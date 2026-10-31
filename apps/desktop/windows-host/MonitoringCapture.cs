// Explicit-session recorder process boundary. The parent never calls UIA.
// Worker stdout is private bounded IPC, never a diagnostic log or a file.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PromteSaver.WindowsPreview {
    internal sealed class MonitoringCapture : IDisposable {
        internal const int MaxLineBytes = 350000;
        const int HeartbeatTimeoutMs = 5000;
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
        static readonly Regex SourceName = new Regex("^[a-z0-9][a-z0-9._-]{0,63}\\.exe$", RegexOptions.CultureInvariant);
        static readonly HashSet<string> GapCodes = new HashSet<string>(StringComparer.Ordinal) {
            "FIELD_UNSUPPORTED", "SOURCE_LIMIT", "SOURCE_UNAVAILABLE", "SAVE_FAILED",
            "WORKER_START_FAILED", "WORKER_HEARTBEAT_TIMEOUT", "WORKER_PROTOCOL",
            "WORKER_EXITED", "WORKER_BACKPRESSURE"
        };
        readonly object gate = new object();
        readonly Control owner;
        readonly Func<string, string, string, Task> onSnapshot;
        readonly Action<string> onGap;
        WorkerRun active;
        int generation;
        bool enabled, disposed;

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

        internal MonitoringCapture(Control owner, Func<string, string, string, Task> onSnapshot, Action<string> onGap) {
            if (owner == null || onSnapshot == null || onGap == null) throw new ArgumentNullException();
            this.owner = owner; this.onSnapshot = onSnapshot; this.onGap = onGap;
        }
        internal bool Enabled { get { lock (gate) return enabled; } }
        internal void Start() {
            WorkerRun run;
            lock (gate) {
                if (disposed) throw new ObjectDisposedException("MonitoringCapture");
                if (enabled) return;
                if (active != null) throw new InvalidOperationException("The previous recorder is still stopping. Try Record again after it exits.");
                if (owner.IsDisposed || !owner.IsHandleCreated) throw new InvalidOperationException("The desktop window is unavailable.");
                run = new WorkerRun(++generation); active = run; enabled = true;
            }
            Task.Run(() => RunParent(run));
        }
        internal void Stop() {
            // No UIA, process wait, pipe flush or process enumeration on the UI thread.
            lock (gate) {
                enabled = false; generation++;
                if (active != null) active.Cancellation.Cancel();
            }
        }
        bool Current(WorkerRun run) {
            lock (gate) return !disposed && enabled && active == run && generation == run.Generation;
        }
        void PostGap(WorkerRun run, string code) {
            if (Interlocked.CompareExchange(ref run.GapPending, 1, 0) != 0) return;
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
            }
            try {
                owner.BeginInvoke((MethodInvoker)delegate {
                    lock (gate) if (disposed || generation != failedGeneration) return;
                    onGap(code);
                });
            } catch (InvalidOperationException) { }
        }
        void Dispatch(WorkerRun run, string source, string text, string fieldId) {
            // At most one UI/network callback can retain a snapshot. Heartbeats
            // continue to be consumed while that callback awaits the service.
            if (Interlocked.CompareExchange(ref run.SnapshotPending, 1, 0) != 0) {
                PostGap(run, "WORKER_BACKPRESSURE"); return;
            }
            try {
                owner.BeginInvoke((MethodInvoker)(async delegate {
                    try { if (Current(run)) await onSnapshot(source, text, fieldId); }
                    catch { if (Current(run)) PostGap(run, "SAVE_FAILED"); }
                    finally { Interlocked.Exchange(ref run.SnapshotPending, 0); }
                }));
            } catch (InvalidOperationException) { Interlocked.Exchange(ref run.SnapshotPending, 0); }
        }
        async Task RunParent(WorkerRun run) {
            Process child = null;
            bool started = false;
            try {
                if (!Current(run)) return;
                string executable;
                using (var own = Process.GetCurrentProcess()) executable = own.MainModule.FileName;
                child = new Process { StartInfo = new ProcessStartInfo(executable, "--monitoring-worker") {
                    UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                    StandardOutputEncoding = Utf8, StandardErrorEncoding = Utf8
                } };
                started = child.Start();
                if (!started) throw new WorkerProblem("WORKER_START_FAILED");
                // Only this exact Process object is ever terminated. No PID/name lookup for killing.
                if (!Current(run)) return;
                using (var own = Process.GetCurrentProcess()) {
                    var start = new { kind = "start", parentPid = own.Id, parentStart = own.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture) };
                    await child.StandardInput.WriteLineAsync(Codec().Serialize(start));
                    await child.StandardInput.FlushAsync();
                }
                // Discard stderr without buffering or reporting its contents.
                Observe(Drain(child.StandardError.BaseStream));
                var reader = new BoundedLineReader(child.StandardOutput.BaseStream, MaxLineBytes);
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
                        wait.Cancel(); line = await read;
                    }
                    if (!Current(run)) return;
                    if (line == null) throw new WorkerProblem("WORKER_EXITED");
                    var message = Decode(line);
                    string kind = Text(message, "kind");
                    if (kind == "ready" && message.Count == 1 && !ready) { ready = true; continue; }
                    if (!ready) throw new WorkerProblem("WORKER_PROTOCOL");
                    if (kind == "heartbeat" && message.Count == 1) continue;
                    if (kind == "gap" && message.Count == 2 && GapCodes.Contains(Text(message, "code"))) {
                        PostGap(run, Text(message, "code")); continue;
                    }
                    string source = Text(message, "source"), text = Text(message, "text"), fieldId = Text(message, "fieldId");
                    Guid parsed;
                    if (kind != "snapshot" || message.Count != 4 || source == null || !SourceName.IsMatch(source) ||
                        !FocusedFieldCapture.IsEligibleProcess(source.Substring(0, source.Length - 4)) ||
                        String.IsNullOrWhiteSpace(text) || text.Length > 50000 || !Guid.TryParseExact(fieldId, "D", out parsed))
                        throw new WorkerProblem("WORKER_PROTOCOL");
                    Dispatch(run, source, text, fieldId);
                }
            } catch (WorkerProblem problem) { Fail(run, problem.Code); }
            catch { Fail(run, started ? "WORKER_PROTOCOL" : "WORKER_START_FAILED"); }
            finally {
                // This runs on a pool thread, even when a provider has wedged the child UI thread.
                // Keep the lane occupied until the owned child has really exited.
                if (child != null) {
                    if (started) {
                        try { if (!child.HasExited) child.Kill(); } catch (InvalidOperationException) { }
                        catch (System.ComponentModel.Win32Exception) { }
                        try { child.WaitForExit(); } catch (InvalidOperationException) { }
                    }
                    child.Dispose();
                }
                lock (gate) { if (active == run) { active = null; enabled = false; } }
                run.Cancellation.Dispose();
            }
        }
        static async Task Drain(Stream stream) {
            byte[] buffer = new byte[1024];
            while (await stream.ReadAsync(buffer, 0, buffer.Length) != 0) { }
        }
        static void Observe(Task task) {
            task.ContinueWith(failed => { var ignored = failed.Exception; }, TaskContinuationOptions.OnlyOnFaulted);
        }
        static JavaScriptSerializer Codec() { return new JavaScriptSerializer { MaxJsonLength = MaxLineBytes, RecursionLimit = 8 }; }
        static Dictionary<string, object> Decode(string line) {
            var message = Codec().DeserializeObject(line) as Dictionary<string, object>;
            if (message == null) throw new WorkerProblem("WORKER_PROTOCOL");
            return message;
        }
        static string Text(Dictionary<string, object> value, string key) {
            object found; return value.TryGetValue(key, out found) ? found as string : null;
        }
        internal sealed class BoundedLineReader {
            readonly Stream stream;
            readonly int maximum;
            readonly byte[] input = new byte[4096];
            int offset, length;
            internal BoundedLineReader(Stream stream, int maximum) { this.stream = stream; this.maximum = maximum; }
            internal async Task<string> ReadLine() {
                using (var line = new MemoryStream()) {
                    while (true) {
                        if (offset == length) {
                            length = await stream.ReadAsync(input, 0, input.Length); offset = 0;
                            if (length == 0) {
                                if (line.Length == 0) return null;
                                throw new WorkerProblem("WORKER_PROTOCOL");
                            }
                        }
                        int begin = offset;
                        while (offset < length && input[offset] != 10) offset++;
                        int count = offset - begin;
                        if (line.Length + count > maximum) throw new WorkerProblem("WORKER_PROTOCOL");
                        line.Write(input, begin, count);
                        if (offset < length) {
                            offset++;
                            byte[] bytes = line.ToArray();
                            int end = bytes.Length;
                            if (end > 0 && bytes[end - 1] == 13) end--;
                            return Utf8.GetString(bytes, 0, end);
                        }
                    }
                }
            }
        }
        static void Write(Stream output, object message) {
            byte[] line = Utf8.GetBytes(Codec().Serialize(message) + "\n");
            if (line.Length > MaxLineBytes) throw new WorkerProblem("WORKER_PROTOCOL");
            try { output.Write(line, 0, line.Length); output.Flush(); }
            catch { Environment.Exit(3); }
        }
        // Called before any normal app initialization, exclusively for the private child process.
        [STAThread]
        internal static int RunWorker() {
            try {
                var input = new BoundedLineReader(Console.OpenStandardInput(), 4096);
                string line = input.ReadLine().GetAwaiter().GetResult();
                if (line == null) return 2;
                var start = Decode(line);
                object rawPid; long ticks;
                if (start.Count != 3 || Text(start, "kind") != "start" || !start.TryGetValue("parentPid", out rawPid) ||
                    !(rawPid is int) || (int)rawPid <= 0 || !Int64.TryParse(Text(start, "parentStart"), out ticks)) return 2;
                var parent = Process.GetProcessById((int)rawPid);
                if (parent.HasExited || parent.StartTime.ToUniversalTime().Ticks != ticks) { parent.Dispose(); return 2; }
                // Both checks run off the UIA thread, including when UIA startup/cleanup hangs.
                var parentWatch = new System.Threading.Timer(delegate {
                    try { if (parent.HasExited) Environment.Exit(0); } catch { Environment.Exit(0); }
                }, null, 250, 250);
                Task.Run(async delegate {
                    try { await input.ReadLine(); } catch { }
                    // Any further input, EOF, malformed input or parent pipe failure stops this child.
                    Environment.Exit(0);
                });
                Application.EnableVisualStyles();
                using (var owner = new Control()) {
                    var handle = owner.Handle;
                    Stream output = Console.OpenStandardOutput();
                    string ownName;
                    using (var own = Process.GetCurrentProcess()) ownName = own.ProcessName;
                    FocusedFieldCapture capture = null;
                    bool workerReady = false;
                    string startupGap = null;
                    capture = new FocusedFieldCapture(owner,
                        source => !String.Equals(source, ownName, StringComparison.OrdinalIgnoreCase) && FocusedFieldCapture.IsEligibleProcess(source),
                        (source, text) => {
                            string normalized = source.ToLowerInvariant() + ".exe";
                            if (!SourceName.IsMatch(normalized) || String.IsNullOrEmpty(capture.CurrentFieldId))
                                Write(output, new { kind = "gap", code = "SOURCE_LIMIT" });
                            else Write(output, new { kind = "snapshot", source = normalized, text, fieldId = capture.CurrentFieldId });
                            return Task.FromResult(0);
                        }, code => {
                            string fixedCode = GapCodes.Contains(code) ? code : "SOURCE_UNAVAILABLE";
                            if (workerReady) Write(output, new { kind = "gap", code = fixedCode });
                            else startupGap = fixedCode;
                        },
                        allowValuePatternFallback: false);
                    // The only Start is after the parent's explicit-record handshake.
                    capture.Start();
                    Write(output, new { kind = "ready" });
                    workerReady = true;
                    if (startupGap != null) Write(output, new { kind = "gap", code = startupGap });
                    var heartbeat = new System.Windows.Forms.Timer { Interval = 1000 };
                    heartbeat.Tick += delegate { Write(output, new { kind = "heartbeat" }); };
                    heartbeat.Start();
                    Application.Run();
                    heartbeat.Stop(); heartbeat.Dispose();
                    // Process exit owns cleanup; do not wait for provider unsubscription here.
                    GC.KeepAlive(capture); GC.KeepAlive(parentWatch); GC.KeepAlive(parent);
                }
                return 0;
            } catch { return 2; }
        }
        public void Dispose() {
            lock (gate) { if (disposed) return; disposed = true; }
            Stop();
        }
    }
}
