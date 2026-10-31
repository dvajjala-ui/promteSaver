// Synthetic IPC/process fixture only: this deliberately does not reference UIA
// or install any keyboard hook, and never reads any real application field.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using PromteSaver.WindowsPreview;

namespace PromteSaver.WindowsPreview {
    internal sealed class FocusedFieldCapture {
        readonly Func<string, string, Task> snapshot;
        readonly Action<string> gap;
        System.Windows.Forms.Timer timer;
        internal FocusedFieldCapture(Control owner, Func<string, bool> approved, Func<string, string, Task> snapshot,
            Action<string> gap, Action<string> trace = null, bool allowValuePatternFallback = true) {
            if (allowValuePatternFallback) throw new Exception("The monitoring worker must disable unbounded value reads.");
            this.snapshot = snapshot; this.gap = gap;
        }
        internal string CurrentFieldId { get { return "00000000-0000-4000-8000-000000000001"; } }
        internal static bool IsEligibleProcess(string process) { return process != "chrome" && process != "bitwarden"; }
        internal void Start() {
            string mode = Environment.GetEnvironmentVariable("PROMTESAVER_SYNTHETIC_WORKER");
            if (mode == "hang") { Thread.Sleep(Timeout.Infinite); return; }
            if (mode == "oversize") {
                byte[] bytes = new byte[MonitoringCapture.MaxLineBytes + 1];
                for (int n = 0; n < bytes.Length; n++) bytes[n] = 65;
                var output = Console.OpenStandardOutput(); output.Write(bytes, 0, bytes.Length); output.Flush();
                Thread.Sleep(Timeout.Infinite); return;
            }
            if (mode == "startup-gap") gap("FIELD_UNSUPPORTED");
            timer = new System.Windows.Forms.Timer { Interval = 100 };
            int emitted = 0;
            timer.Tick += async delegate {
                emitted++;
                if (mode != "backpressure" || emitted == 2) timer.Stop();
                await snapshot("synthetic-editor", "harmless synthetic fixture text");
            };
            timer.Start();
        }
    }
}

internal static class MonitoringWorkerHarness {
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void PumpUntil(Func<bool> complete, int timeout) {
        var clock = Stopwatch.StartNew();
        while (!complete() && clock.ElapsedMilliseconds < timeout) { Application.DoEvents(); Thread.Sleep(10); }
        Check(complete(), "Synthetic harness deadline exceeded.");
    }
    static void WaitForReap(MonitoringCapture capture) {
        var clock = Stopwatch.StartNew();
        while (true) {
            try { capture.Start(); capture.Stop(); return; }
            catch (InvalidOperationException) {
                Check(clock.ElapsedMilliseconds < 6000, "Owned worker was not reaped.");
                Application.DoEvents(); Thread.Sleep(20);
            }
        }
    }
    static void ReaderChecks() {
        var input = new MemoryStream(Encoding.UTF8.GetBytes("one\r\ntwo\n"));
        var reader = new MonitoringCapture.BoundedLineReader(input, 5);
        Check(reader.ReadLine().GetAwaiter().GetResult() == "one", "CRLF line");
        Check(reader.ReadLine().GetAwaiter().GetResult() == "two", "buffered second line");
        Check(reader.ReadLine().GetAwaiter().GetResult() == null, "clean EOF");
        foreach (var bytes in new[] { Encoding.UTF8.GetBytes("123456\n"), Encoding.UTF8.GetBytes("partial"), new byte[] { 255, 10 } }) {
            bool rejected = false;
            try { new MonitoringCapture.BoundedLineReader(new MemoryStream(bytes), 5).ReadLine().GetAwaiter().GetResult(); }
            catch { rejected = true; }
            Check(rejected, "Invalid/oversize/incomplete line must fail closed.");
        }
    }
    static int ParentExitCheck(bool terminateParent) {
        Environment.SetEnvironmentVariable("PROMTESAVER_SYNTHETIC_WORKER", "healthy");
        var own = Process.GetCurrentProcess();
        var child = Process.Start(new ProcessStartInfo(own.MainModule.FileName, "--monitoring-worker") {
            UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
        });
        child.StandardInput.WriteLine("{\"kind\":\"start\",\"parentPid\":" + own.Id + ",\"parentStart\":\"" +
            own.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\"}");
        child.StandardInput.Flush();
        Check(child.StandardOutput.ReadLine() == "{\"kind\":\"ready\"}", "Worker private handshake.");
        if (terminateParent) {
            Console.WriteLine("OWNED_CHILD " + child.Id); Console.Out.Flush();
            // Simulate abrupt parent death, deliberately bypassing recorder Dispose.
            Environment.Exit(0);
        }
        child.StandardInput.Close();
        bool exited = child.WaitForExit(4000);
        if (!exited) { child.Kill(); child.WaitForExit(); }
        Check(exited && child.ExitCode == 0, "Worker must stop on stdin EOF.");
        child.Dispose(); own.Dispose();
        Console.WriteLine("PASS synthetic worker stdin-eof; no keyboard/UIA capture executed"); return 0;
    }
    [STAThread]
    static int Main(string[] args) {
        if (args.Length == 1 && args[0] == "--monitoring-worker") return MonitoringCapture.RunWorker();
        try {
            ReaderChecks();
            string mode = args.Length == 1 ? args[0] : "healthy";
            if (mode == "stdin-eof" || mode == "parent-death") return ParentExitCheck(mode == "parent-death");
            Environment.SetEnvironmentVariable("PROMTESAVER_SYNTHETIC_WORKER", mode);
            using (var owner = new Control()) {
                var handle = owner.Handle;
                int snapshots = 0; string gap = null;
                using (var capture = new MonitoringCapture(owner, (source, text, fieldId) => {
                    Check(source == "synthetic-editor.exe", "Source normalization");
                    Check(text == "harmless synthetic fixture text", "IPC payload roundtrip");
                    Check(fieldId == "00000000-0000-4000-8000-000000000001", "Field episode roundtrip");
                    snapshots++; return mode == "backpressure" ? Task.Delay(800) : Task.FromResult(0);
                }, code => { gap = code; })) {
                    if (mode == "stop-hang") {
                        Environment.SetEnvironmentVariable("PROMTESAVER_SYNTHETIC_WORKER", "hang");
                        capture.Start(); Thread.Sleep(200);
                        var clock = Stopwatch.StartNew(); capture.Stop(); clock.Stop();
                        Check(!capture.Enabled && clock.ElapsedMilliseconds < 250, "Stop must not wait on hung native work.");
                        WaitForReap(capture);
                    } else if (mode == "stale") {
                        capture.Start(); Thread.Sleep(700); capture.Stop();
                        for (int n = 0; n < 20; n++) { Application.DoEvents(); Thread.Sleep(10); }
                        Check(snapshots == 0, "Stopped generation must not invoke queued snapshot.");
                        WaitForReap(capture);
                    } else if (mode == "hang" || mode == "oversize") {
                        capture.Start(); PumpUntil(() => gap != null, 8000);
                        Check(!capture.Enabled, "Fault must disable recorder.");
                        Check(gap == (mode == "hang" ? "WORKER_HEARTBEAT_TIMEOUT" : "WORKER_PROTOCOL"), "Fixed content-free fault code.");
                        WaitForReap(capture);
                    } else {
                        capture.Start(); capture.Start();
                        PumpUntil(() => snapshots == 1, 4000);
                        Check(capture.Enabled, "Healthy worker must remain active.");
                        if (mode == "startup-gap") Check(gap == "FIELD_UNSUPPORTED", "Startup gap may precede actual field binding.");
                        if (mode == "backpressure") {
                            PumpUntil(() => gap != null, 2000);
                            Check(gap == "WORKER_BACKPRESSURE", "Extra pending snapshot must be visibly rejected.");
                        }
                        // A heartbeat must survive after the single synthetic snapshot.
                        var clock = Stopwatch.StartNew();
                        while (clock.ElapsedMilliseconds < 1200) { Application.DoEvents(); Thread.Sleep(10); }
                        Check(capture.Enabled && snapshots == 1, "Healthy worker and idempotent Start.");
                        capture.Stop(); WaitForReap(capture);
                    }
                }
            }
            Console.WriteLine("PASS synthetic worker " + mode + "; no keyboard/UIA capture executed"); return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message); return 1;
        }
    }
}
