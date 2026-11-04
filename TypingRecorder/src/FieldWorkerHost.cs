// Hidden "--field-worker" child process: the out-of-process host for UI-Automation
// field-text capture. The parent (FieldSnapshotClient) spawns one of these with
// redirected std handles; everything UIA-related happens here, isolated, so a wedged
// accessibility provider can block only this throw-away child, never the parent's UI
// or the typing hot path.
//
// This file is a C# 5 / .NET Framework 4.7.2 port of MonitoringCapture.RunWorker
// (apps/desktop/windows-host/MonitoringCapture.cs). The old JavaScriptSerializer IPC
// is replaced by the Base64 line codec in WorkerProtocol; the UIA reader is the
// sibling FocusedFieldReader. No file, log or network I/O ever happens here.
//
// Wire protocol — one Base64-framed line per message, LF-terminated, raw stdout bytes:
//   parent -> child : START(pid, startTicks)  then optional PING keep-alives, then EOF
//   child  -> parent: READY, HB (1 Hz), SNAP(sourceExe, fieldId, text), GAP(code)
//
// The child exits(0) the instant the parent dies (250 ms watchdog OR stdin EOF) and
// exits(3) if a stdout write ever fails.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace TypingRecorder {

    /// <summary>
    /// Entry point and process plumbing for the hidden <c>--field-worker</c> child.
    /// Program.Main dispatches to <see cref="Run"/> when it sees that single argument.
    /// </summary>
    internal static class FieldWorkerHost {

        // Inbound lines (START, PING) are tiny; cap them tightly. Outbound snapshot
        // lines are bounded by WorkerProtocol.MaxLineBytes inside Emit.
        const int InboundLineCap = 4096;

        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);

        // A snapshot source must look like "name.exe"; mirrors the parent's own guard so a
        // malformed process name can never corrupt the IPC framing.
        static readonly Regex SourceName =
            new Regex("^[a-z0-9][a-z0-9._-]{0,63}\\.exe$", RegexOptions.CultureInvariant);

        // Gap codes the parent accepts. Anything the reader raises outside this set is sent
        // as the generic SOURCE_UNAVAILABLE so the parent never rejects a line as a protocol
        // error. (Ported verbatim from MonitoringCapture.GapCodes.)
        static readonly HashSet<string> WorkerGapCodes = new HashSet<string>(StringComparer.Ordinal) {
            "FIELD_UNSUPPORTED", "SOURCE_LIMIT", "SOURCE_UNAVAILABLE", "SAVE_FAILED",
            "WORKER_START_FAILED", "WORKER_HEARTBEAT_TIMEOUT", "WORKER_PROTOCOL",
            "WORKER_EXITED", "WORKER_BACKPRESSURE"
        };

        // Field-noise processes excluded ON TOP OF GlobalKeyboardCapture.BlockedProcesses.
        // That set carries applicationframehost + the password managers but NOT explorer or
        // codex-computer-use, which the original FocusedFieldCapture.blockedProcesses did:
        // adding them here keeps the consolidated eligibility union complete (corrections P2 #9).
        static readonly HashSet<string> FieldNoise = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "explorer", "codex-computer-use"
        };

        // Serializes stdout frames. In practice every Emit already runs on the single UI/pump
        // thread (heartbeat Timer, and the reader marshals onSnapshot/onGap through its Control
        // owner), so this only guards against an off-thread reader callback.
        static readonly object emitGate = new object();

        /// <summary>Runs the field worker. Returns the process exit code (0 clean, 2 refused).</summary>
        [STAThread]
        internal static int Run() {
            try {
                // --- Handshake: read and validate the parent's START line. ------------------
                WorkerProtocol.BoundedLineReader stdin =
                    new WorkerProtocol.BoundedLineReader(Console.OpenStandardInput(), InboundLineCap);
                string startLine = stdin.ReadLine().GetAwaiter().GetResult();
                if (startLine == null) return 2;
                WorkerProtocol.Msg start;
                if (!WorkerProtocol.TryDecode(startLine, out start) || start == null ||
                    start.Kind != WorkerProtocol.MsgKind.Start || start.Pid <= 0) return 2;

                // Anti-spoof: the pid must be a live process whose exact start time matches.
                Process parent = Process.GetProcessById(start.Pid);
                if (parent.HasExited || parent.StartTime.ToUniversalTime().Ticks != start.StartTicks) {
                    parent.Dispose();
                    return 2;
                }

                // --- Parent-death watchdog on a pool thread (never the UIA/pump thread). ----
                System.Threading.Timer parentWatch = new System.Threading.Timer(delegate {
                    try { if (parent.HasExited) Environment.Exit(0); }
                    catch { Environment.Exit(0); }
                }, null, 250, 250);

                // --- Parent pipe watcher: EOF (pipe closed) is the other death signal. -------
                Thread stdinThread = new Thread(new ThreadStart(delegate { WatchParentPipe(stdin); }));
                stdinThread.IsBackground = true;
                stdinThread.Name = "FieldWorkerStdin";
                stdinThread.Start();

                // --- Message pump + hidden Control that forces the UIA / BeginInvoke HWND. ---
                Application.EnableVisualStyles();
                using (Control owner = new Control()) {
                    if (owner.Handle == IntPtr.Zero) return 2;    // realize the HWND so Application.Run pumps
                    Stream output = Console.OpenStandardOutput();  // raw BaseStream; LF-only writes in Emit

                    string ownName;
                    using (Process self = Process.GetCurrentProcess()) ownName = self.ProcessName;

                    FocusedFieldReader reader = null;
                    bool workerReady = false;
                    string startupGap = null;

                    // Session-level eligibility: never the recorder itself, never a blocked or
                    // field-noise process, and the reader's own producer blocklist on top.
                    Func<string, bool> isEligible = delegate(string source) {
                        if (String.IsNullOrWhiteSpace(source)) return false;
                        string bare = source;
                        if (bare.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                            bare = bare.Substring(0, bare.Length - 4);
                        if (String.Equals(bare, ownName, StringComparison.OrdinalIgnoreCase)) return false;
                        if (GlobalKeyboardCapture.IsBlockedProcess(bare)) return false;
                        if (FieldNoise.Contains(bare)) return false;
                        return FocusedFieldReader.IsEligibleProcess(bare);
                    };

                    // A validated field snapshot -> one SNAP line (or SOURCE_LIMIT on a bad source
                    // name / missing binding episode). The returned Task is already complete, so
                    // the reader's await never blocks the pump.
                    Func<string, string, Task> onSnapshot = delegate(string source, string text) {
                        string normalized = (source == null ? "" : source.ToLowerInvariant()) + ".exe";
                        string fieldId = reader != null ? reader.CurrentFieldId : null;
                        if (!SourceName.IsMatch(normalized) || String.IsNullOrEmpty(fieldId))
                            Emit(output, WorkerProtocol.EncodeGap("SOURCE_LIMIT"));
                        else
                            Emit(output, WorkerProtocol.EncodeSnapshot(normalized, fieldId, text));
                        return Task.FromResult(0);
                    };

                    // Gaps raised during Start() (before READY) are deferred so READY is always
                    // the first line the parent sees.
                    Action<string> onGap = delegate(string code) {
                        string fixedCode = (code != null && WorkerGapCodes.Contains(code)) ? code : "SOURCE_UNAVAILABLE";
                        if (workerReady) Emit(output, WorkerProtocol.EncodeGap(fixedCode));
                        else startupGap = fixedCode;
                    };

                    reader = new FocusedFieldReader(owner, isEligible, onSnapshot, onGap);
                    reader.Start();                                   // the only Start, after the validated handshake
                    Emit(output, WorkerProtocol.EncodeReady());
                    workerReady = true;
                    if (startupGap != null) Emit(output, WorkerProtocol.EncodeGap(startupGap));

                    System.Windows.Forms.Timer heartbeat = new System.Windows.Forms.Timer();
                    heartbeat.Interval = 1000;
                    heartbeat.Tick += delegate { Emit(output, WorkerProtocol.EncodeHeartbeat()); };
                    heartbeat.Start();

                    Application.Run();

                    // A normal return is rare (the worker usually Environment.Exit()s on parent
                    // death). Do NOT call reader.Stop(): process exit owns UIA teardown, so we
                    // never block here on a wedged provider's unsubscription.
                    heartbeat.Stop();
                    heartbeat.Dispose();
                    GC.KeepAlive(reader);
                    GC.KeepAlive(parentWatch);
                    GC.KeepAlive(parent);
                }
                return 0;
            } catch {
                // Any startup/handshake failure: exit 2 so the parent reports a start failure.
                return 2;
            }
        }

        /// <summary>
        /// Blocks on the parent's stdin pipe. EOF or a read error means the pipe closed
        /// (parent gone) -> exit 0. Any line the parent sends meanwhile (e.g. a PING keep-alive)
        /// is tolerated and discarded: the FocusedFieldReader owns its own keyboard/focus hooks,
        /// and the agreed interface exposes no settle entry point to forward a PING to. The
        /// 250 ms watchdog is the redundant death signal.
        /// </summary>
        static void WatchParentPipe(WorkerProtocol.BoundedLineReader stdin) {
            while (true) {
                string line;
                try { line = stdin.ReadLine().GetAwaiter().GetResult(); }
                catch { Environment.Exit(0); return; }
                if (line == null) { Environment.Exit(0); return; } // pipe closed by the parent
            }
        }

        /// <summary>
        /// Writes one already-encoded protocol line to stdout as raw UTF-8 bytes with a single
        /// LF (never Console.WriteLine / CRLF, which would corrupt Base64 line framing). A pipe
        /// failure terminates the child (exit 3); an over-cap line is dropped.
        /// </summary>
        static void Emit(Stream output, string encoded) {
            if (encoded == null) return;
            byte[] line;
            try { line = Utf8.GetBytes(encoded + "\n"); }
            catch { return; }
            if (line.Length > WorkerProtocol.MaxLineBytes) return; // bounded output; drop over-cap frames
            lock (emitGate) {
                try { output.Write(line, 0, line.Length); output.Flush(); }
                catch { Environment.Exit(3); }
            }
        }
    }
}
