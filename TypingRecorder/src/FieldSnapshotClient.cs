// Parent-side supervisor of the out-of-process field-snapshot worker.
//
// Spawns this same exe with "--field-worker", performs the START handshake,
// drains the worker's private stdout IPC, enforces a heartbeat timeout plus
// generation guards plus single-snapshot backpressure, and raises field
// snapshots / gaps on the WinForms UI thread. The parent NEVER calls UI
// Automation and never reads field text itself: a wedged accessibility provider
// can only stall the isolated child, which this supervisor terminates by its
// exact owned Process handle — never by a PID or process-name lookup.
//
// Port of the parent half of the old MonitoringCapture.cs, retargeted to the
// TypingRecorder namespace and the WorkerProtocol line codec (plain Base64
// lines, no JSON / System.Web.Extensions / anonymous types). Worker stdout is
// private bounded IPC, never a diagnostic log or a file.
// .NET Framework 4.7.2 / C# 5.
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
    /// Supervises the field-snapshot worker child process and surfaces its
    /// snapshots and gaps to the host on the UI thread. Public methods are
    /// called on the UI thread; the stdout drain runs on a pool thread so no
    /// process wait, pipe flush or UIA call ever touches the typing hot path.
    /// Snapshot and gap callbacks are synchronous Actions (the host does a
    /// non-blocking reconciler feed + write enqueue), so backpressure rarely
    /// trips.
    /// </summary>
    internal sealed class FieldSnapshotClient {

        const int HeartbeatTimeoutMs = 5000;   // max silence from the worker before we fail it
        const int MaxSnapshotChars   = 50000;  // parent-side re-validation bound (mirrors the reader)

        static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(false);

        // A plausible "<name>.exe" source, re-validated on the (untrusted) IPC channel.
        static readonly Regex SourceName =
            new Regex("^[a-z0-9][a-z0-9._-]{0,63}\\.exe$", RegexOptions.CultureInvariant);

        // Gap codes the worker is permitted to raise, plus the ones this supervisor
        // raises itself. Anything else on the wire is treated as a protocol breach.
        static readonly HashSet<string> GapCodes = new HashSet<string>(StringComparer.Ordinal) {
            "FIELD_UNSUPPORTED", "SOURCE_LIMIT", "SOURCE_UNAVAILABLE", "SAVE_FAILED",
            "WORKER_START_FAILED", "WORKER_HEARTBEAT_TIMEOUT", "WORKER_PROTOCOL",
            "WORKER_EXITED", "WORKER_BACKPRESSURE"
        };

        readonly object gate = new object();
        readonly Control owner;
        readonly Action<string, string, string> onSnapshot;  // (sourceExe, text, fieldId)
        readonly Action<string> onGap;                        // (gapCode)
        WorkerRun active;
        int generation;
        bool enabled, disposed;
        string lastGap;

        sealed class WorkerRun {
            internal readonly int Generation;
            internal readonly CancellationTokenSource Cancellation = new CancellationTokenSource();
            internal int SnapshotPending, GapPending;
            internal WorkerRun(int generation) { Generation = generation; }
        }

        sealed class WorkerProblem : Exception {
            internal readonly string Code;
            internal WorkerProblem(string code) { Code = code; }
        }

        internal FieldSnapshotClient(Control owner, Action<string, string, string> onSnapshot, Action<string> onGap) {
            if (owner == null || onSnapshot == null || onGap == null) throw new ArgumentNullException();
            this.owner = owner; this.onSnapshot = onSnapshot; this.onGap = onGap;
        }

        /// <summary>True while a worker is supervised (optimistic during the brief
        /// startup handshake); cleared on Stop, Dispose, worker exit or any failure.</summary>
        internal bool WorkerAlive { get { lock (gate) return enabled; } }

        /// <summary>The most recent gap code surfaced to the host, or null.</summary>
        internal string LastGap { get { lock (gate) return lastGap; } }

        internal void Start() {
            // Pre-flight guards throw (caller/teardown races), exactly as the port did.
            // A genuine worker-spawn failure is reported through onGap, never thrown.
            WorkerRun run;
            lock (gate) {
                if (disposed) throw new ObjectDisposedException("FieldSnapshotClient");
                if (enabled) return;
                if (active != null)
                    throw new InvalidOperationException("The previous field worker is still stopping. Try again after it exits.");
                if (owner.IsDisposed || !owner.IsHandleCreated)
                    throw new InvalidOperationException("The desktop window is unavailable.");
                run = new WorkerRun(++generation); active = run; enabled = true;
            }
            Observe(Task.Run((Func<Task>)delegate { return RunParent(run); }));
        }

        internal void Stop() {
            // No UIA, process wait, pipe flush or process enumeration on the UI thread.
            lock (gate) {
                enabled = false; generation++;
                if (active != null) active.Cancellation.Cancel();
            }
        }

        internal void Dispose() {
            lock (gate) { if (disposed) return; disposed = true; }
            Stop();
        }

        bool Current(WorkerRun run) {
            lock (gate) return !disposed && enabled && active == run && generation == run.Generation;
        }

        void PostGap(WorkerRun run, string code) {
            if (Interlocked.CompareExchange(ref run.GapPending, 1, 0) != 0) return;
            lock (gate) { lastGap = code; }
            try {
                owner.BeginInvoke((MethodInvoker)delegate {
                    try { if (Current(run)) onGap(code); }
                    finally { Interlocked.Exchange(ref run.GapPending, 0); }
                });
            } catch (InvalidOperationException) { Interlocked.Exchange(ref run.GapPending, 0); }
        }

        void Fail(WorkerRun run, string code) {
            int failedGeneration;
            lock (gate) {
                if (!enabled || active != run || generation != run.Generation) return;
                enabled = false; failedGeneration = ++generation; run.Cancellation.Cancel();
                lastGap = code;
            }
            try {
                owner.BeginInvoke((MethodInvoker)delegate {
                    lock (gate) { if (disposed || generation != failedGeneration) return; }
                    onGap(code);
                });
            } catch (InvalidOperationException) { }
        }

        void Dispatch(WorkerRun run, string source, string text, string fieldId) {
            // At most one snapshot callback is in flight. Heartbeats keep being
            // consumed meanwhile; a second overlapping snapshot becomes a gap.
            if (Interlocked.CompareExchange(ref run.SnapshotPending, 1, 0) != 0) {
                PostGap(run, "WORKER_BACKPRESSURE"); return;
            }
            try {
                owner.BeginInvoke((MethodInvoker)delegate {
                    try { if (Current(run)) onSnapshot(source, text, fieldId); }
                    catch { if (Current(run)) PostGap(run, "SAVE_FAILED"); }
                    finally { Interlocked.Exchange(ref run.SnapshotPending, 0); }
                });
            } catch (InvalidOperationException) { Interlocked.Exchange(ref run.SnapshotPending, 0); }
        }

        async Task RunParent(WorkerRun run) {
            Process child = null;
            bool started = false;
            try {
                if (!Current(run)) return;
                string executable;
                using (var own = Process.GetCurrentProcess()) executable = own.MainModule.FileName;
                child = new Process {
                    StartInfo = new ProcessStartInfo(executable, "--field-worker") {
                        UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
                        RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                        StandardOutputEncoding = Utf8NoBom, StandardErrorEncoding = Utf8NoBom
                    }
                };
                started = child.Start();
                if (!started) throw new WorkerProblem("WORKER_START_FAILED");
                // Only this exact Process object is ever terminated; never a PID/name lookup.
                if (!Current(run)) return;

                int ownPid; long startTicks;
                using (var own = Process.GetCurrentProcess()) {
                    ownPid = own.Id;
                    startTicks = own.StartTime.ToUniversalTime().Ticks;
                }
                // Send START over stdin and keep the pipe open afterwards: the worker
                // treats any further line (or EOF) as a signal to exit.
                await WriteLine(child.StandardInput.BaseStream, WorkerProtocol.EncodeStart(ownPid, startTicks));

                // Discard stderr without buffering or surfacing its contents.
                Observe(Drain(child.StandardError.BaseStream));

                var reader = new WorkerProtocol.BoundedLineReader(child.StandardOutput.BaseStream, WorkerProtocol.MaxLineBytes);
                bool ready = false;
                while (Current(run)) {
                    string line;
                    using (var wait = CancellationTokenSource.CreateLinkedTokenSource(run.Cancellation.Token)) {
                        var read = reader.ReadLine();
                        Observe(read);
                        var deadline = Task.Delay(HeartbeatTimeoutMs, wait.Token);
                        if (await Task.WhenAny(read, deadline) != read) {
                            if (run.Cancellation.IsCancellationRequested) return;
                            throw new WorkerProblem("WORKER_HEARTBEAT_TIMEOUT");
                        }
                        wait.Cancel();
                        line = await read;
                    }
                    if (!Current(run)) return;
                    if (line == null) throw new WorkerProblem("WORKER_EXITED");

                    WorkerProtocol.Msg msg;
                    if (!WorkerProtocol.TryDecode(line, out msg) || msg == null)
                        throw new WorkerProblem("WORKER_PROTOCOL");

                    // READY first, exactly once; then heartbeats, gaps and snapshots.
                    if (msg.Kind == WorkerProtocol.MsgKind.Ready && !ready) { ready = true; continue; }
                    if (!ready) throw new WorkerProblem("WORKER_PROTOCOL");
                    if (msg.Kind == WorkerProtocol.MsgKind.Heartbeat) continue;
                    if (msg.Kind == WorkerProtocol.MsgKind.Gap) {
                        if (msg.Code == null || !GapCodes.Contains(msg.Code)) throw new WorkerProblem("WORKER_PROTOCOL");
                        PostGap(run, msg.Code); continue;
                    }
                    if (msg.Kind != WorkerProtocol.MsgKind.Snapshot) throw new WorkerProblem("WORKER_PROTOCOL");

                    // Re-validate the snapshot the same way the producer gated it; the IPC
                    // payload is treated as untrusted even though it is our own child.
                    string source = msg.Source, text = msg.Text, fieldId = msg.FieldId;
                    Guid parsed;
                    if (source == null || !SourceName.IsMatch(source) ||
                        !FocusedFieldReader.IsEligibleProcess(source.Substring(0, source.Length - 4)) ||
                        String.IsNullOrWhiteSpace(text) || text.Length > MaxSnapshotChars ||
                        String.IsNullOrEmpty(fieldId) || !Guid.TryParseExact(fieldId, "D", out parsed))
                        throw new WorkerProblem("WORKER_PROTOCOL");
                    Dispatch(run, source, text, fieldId);
                }
            } catch (WorkerProblem problem) { Fail(run, problem.Code); }
            catch { Fail(run, started ? "WORKER_PROTOCOL" : "WORKER_START_FAILED"); }
            finally {
                // Runs on a pool thread even if a provider wedged the child UI thread.
                // Hold the lane until the owned child has really exited.
                if (child != null) {
                    if (started) {
                        try { if (!child.HasExited) child.Kill(); }
                        catch (InvalidOperationException) { }
                        catch (System.ComponentModel.Win32Exception) { }
                        try { child.WaitForExit(); } catch (InvalidOperationException) { }
                    }
                    child.Dispose();
                }
                lock (gate) { if (active == run) { active = null; enabled = false; } }
                run.Cancellation.Dispose();
            }
        }

        // Frame one protocol line to the child's stdin as UTF-8 + a single LF,
        // regardless of whether the codec already framed it with a newline. Sending
        // a stray empty line would be read by the worker as "further input" and stop it.
        static async Task WriteLine(Stream output, string line) {
            if (line == null) line = "";
            int end = line.Length;
            while (end > 0 && (line[end - 1] == '\n' || line[end - 1] == '\r')) end--;
            byte[] bytes = Utf8NoBom.GetBytes(line.Substring(0, end) + "\n");
            await output.WriteAsync(bytes, 0, bytes.Length);
            await output.FlushAsync();
        }

        static async Task Drain(Stream stream) {
            byte[] buffer = new byte[1024];
            while (await stream.ReadAsync(buffer, 0, buffer.Length) != 0) { }
        }

        static void Observe(Task task) {
            if (task == null) return;
            task.ContinueWith(DropFault, TaskContinuationOptions.OnlyOnFaulted);
        }

        static void DropFault(Task failed) {
            var ignored = failed.Exception;
        }
    }
}
