// Compiles against the real Windows host. Never shows its window, starts its
// local service/monitoring worker, approves access, or reads application text.
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using PromteSaver.WindowsPreview;

internal static class MonitoringUiHarness {
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    static void Check(bool condition, string message) {
        if (!condition) throw new Exception(message);
    }
    static T Get<T>(object target, string name) {
        var field = target.GetType().GetField(name, Private);
        Check(field != null, "Missing actual host field: " + name);
        return (T)field.GetValue(target);
    }
    static void Set(object target, string name, object value) {
        var field = target.GetType().GetField(name, Private);
        Check(field != null, "Missing actual host field: " + name);
        field.SetValue(target, value);
    }
    static Task InvokeTask(object target, string name, params object[] arguments) {
        var method = target.GetType().GetMethod(name, Private);
        Check(method != null, "Missing actual host method: " + name);
        try { return (Task)method.Invoke(target, arguments); }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
    }
    static VaultWindow HiddenWindow(string directory) {
        var window = new VaultWindow(directory, false);
        Get<NotifyIcon>(window, "tray").Visible = false;
        Check(!window.Visible, "Synthetic host must stay hidden.");
        Check(!Get<LocalService>(window, "service").Running, "Construction must not start a local service.");
        Check(!Get<MonitoringCapture>(window, "recorder").Enabled, "Construction must not start recording.");
        Check(!Get<bool>(window, "monitoringApproved"), "Synthetic host must not approve monitoring.");
        return window;
    }
    static void DisposeWindow(VaultWindow window) {
        try {
            // Dispose an unshown form through the real host's non-user-close path
            // so its tray, timers and static session-switch subscription are freed.
            var closing = typeof(VaultWindow).GetMethod("OnClose", Private);
            closing.Invoke(window, new object[] {window, new FormClosingEventArgs(CloseReason.ApplicationExitCall, false)});
        } finally { window.Dispose(); }
    }
    static void LockedStopCheck(string directory) {
        var window = HiddenWindow(directory);
        try {
            Check(!Get<bool>(window, "unlocked"), "New synthetic window must remain locked.");
            Set(window, "recordingBusy", true);
            InvokeTask(window, "PauseAll").GetAwaiter().GetResult();
            Check(!Get<bool>(window, "recordingBusy"), "Stop while locked must clear recordingBusy.");
            Check(!Get<bool>(window, "unlocked"), "Stop while locked must preserve lock state.");
            Check(!Get<LocalService>(window, "service").Running, "Stop while locked must not start a service.");
            Check(!Get<MonitoringCapture>(window, "recorder").Enabled, "Stop while locked must not start recording.");
        } finally { DisposeWindow(window); }
        Console.WriteLine("PASS synthetic UI locked Stop leaves recordingBusy false");
    }
    static void StaleErrorCheck(string directory, bool apiError) {
        var window = HiddenWindow(directory);
        try {
            Set(window, "unlocked", true);
            Set(window, "epoch", 31);
            Set(window, "recordingEpoch", 41);
            Get<Label>(window, "state").Text = "Synthetic current-session state";
            Get<Label>(window, "footer").Text = "Synthetic current-session footer";
            var session = Get<CancellationTokenSource>(window, "session");
            var service = Get<LocalService>(window, "service");
            Func<Task> staleAction = delegate {
                // An intervening Record/Stop intent makes the captured error old,
                // without invoking either recording action or approving access.
                Set(window, "recordingEpoch", 42);
                if (apiError) throw new ApiProblem(423, "Synthetic obsolete locked response");
                throw new InvalidOperationException("Synthetic obsolete transport failure");
            };
            InvokeTask(window, "Execute", staleAction, (int?)41).GetAwaiter().GetResult();
            Check(Get<bool>(window, "unlocked"), "Obsolete failure must not lock the current session.");
            Check(Get<int>(window, "epoch") == 31, "Obsolete failure must not invoke ShowGate.");
            Check(Get<int>(window, "recordingEpoch") == 42, "Obsolete failure must preserve the latest recording intent.");
            Check(Object.ReferenceEquals(session, Get<CancellationTokenSource>(window, "session")) &&
                !session.IsCancellationRequested, "Obsolete failure must not cancel or replace the current session.");
            Check(Get<Label>(window, "state").Text == "Synthetic current-session state", "Obsolete failure must not enter service-stop UI.");
            Check(Get<Label>(window, "footer").Text == "Synthetic current-session footer", "Obsolete failure must not replace current UI text.");
            Check(Object.ReferenceEquals(service, Get<LocalService>(window, "service")) && !service.Running,
                "Synthetic host must retain its unstarted service.");
            Check(!Get<MonitoringCapture>(window, "recorder").Enabled, "Stale-error check must never start recording.");
        } finally { DisposeWindow(window); }
        Console.WriteLine("PASS synthetic UI obsolete " + (apiError ? "423" : "generic") + " error preserves current session");
    }
    static void CurrentErrorCheck(string directory) {
        var window = HiddenWindow(directory);
        try {
            Set(window, "unlocked", true);
            Set(window, "epoch", 31);
            Set(window, "recordingEpoch", 41);
            Func<Task> action = delegate { throw new ApiProblem(423, "Synthetic current locked response"); };
            InvokeTask(window, "Execute", action, (int?)41).GetAwaiter().GetResult();
            Check(!Get<bool>(window, "unlocked"), "Current 423 must enter the locked gate.");
            Check(Get<int>(window, "epoch") == 32, "Current 423 must invalidate the old vault UI generation.");
            Check(!Get<bool>(window, "recordingBusy"), "Current 423 must leave recording controls idle.");
        } finally { DisposeWindow(window); }
        Console.WriteLine("PASS synthetic UI current 423 enters locked gate");
    }
    static async Task InvalidDeadline(LocalService service, int timeoutMs) {
        var request = service.Request("/api/status", "GET", null, CancellationToken.None, timeoutMs);
        Check(await Task.WhenAny(request, Task.Delay(1000)) == request, "Invalid request deadline must fail immediately.");
        bool rejected = false;
        try { await request; }
        catch (ArgumentOutOfRangeException) { rejected = true; }
        Check(rejected, "Request deadline must be bounded to 1..20000ms.");
    }
    static async Task StalledBodyCheck() {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var endpoint = (IPEndPoint)listener.LocalEndpoint;
        var release = new TaskCompletionSource<bool>();
        var headersSent = new TaskCompletionSource<bool>();
        var fixture = Task.Run(async delegate {
            using (var socket = await listener.AcceptTcpClientAsync())
            using (var stream = socket.GetStream()) {
                var header = new StringBuilder(); var single = new byte[1];
                while (header.Length < 16 * 1024 && !header.ToString().EndsWith("\r\n\r\n", StringComparison.Ordinal)) {
                    if (await stream.ReadAsync(single, 0, 1) == 0) throw new Exception("Synthetic client disconnected before request headers.");
                    header.Append((char)single[0]);
                }
                Check(header.ToString().StartsWith("GET /api/status HTTP/1.1", StringComparison.Ordinal), "Fixture must receive the actual LocalService request.");
                var response = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{");
                await stream.WriteAsync(response, 0, response.Length); await stream.FlushAsync();
                headersSent.TrySetResult(true);
                // Hold the partial body open until the test releases it. The
                // request must finish through its deadline, not fixture EOF.
                await release.Task;
            }
        });
        using (var service = new LocalService())
        using (var client = new HttpClient(new HttpClientHandler {UseProxy = false, AllowAutoRedirect = false}) {
            BaseAddress = new Uri("http://127.0.0.1:" + endpoint.Port), Timeout = TimeSpan.FromSeconds(20)
        }) {
            Set(service, "http", client);
            Exception failure = null;
            try {
                await InvalidDeadline(service, 0); await InvalidDeadline(service, 20001);
                var clock = Stopwatch.StartNew();
                // Request must run without a WinForms synchronization context.
                var request = Task.Run(() => service.Request("/api/status", "GET", null, CancellationToken.None, 200));
                Check(await Task.WhenAny(request, Task.Delay(2800)) == request, "Actual LocalService.Request hung after successful headers and a stalled JSON body.");
                Check(headersSent.Task.IsCompleted, "Deadline test must exercise a response body after successful headers.");
                Check(!fixture.IsCompleted, "Fixture must still hold the partial response open.");
                bool failed = false;
                try { await request; } catch (Exception) { failed = true; }
                Check(failed && clock.ElapsedMilliseconds < 3000, "Incomplete response must fail within the total request deadline.");
                Check(!service.Running, "HTTP fixture must not start a local child service.");
                Console.WriteLine("PASS synthetic UI stalled body request failed in " + clock.ElapsedMilliseconds + "ms after 200ms total deadline");
            } catch (Exception error) { failure = error; }
            finally {
                release.TrySetResult(true); listener.Stop();
            }
            try { await fixture; } catch (ObjectDisposedException) { } catch (SocketException) { }
            if (failure != null) throw failure;
        }
    }
    [STAThread]
    static int Main(string[] args) {
        try {
            Check(args.Length == 1 && Directory.Exists(args[0]), "An isolated synthetic test directory is required.");
            Application.EnableVisualStyles();
            LockedStopCheck(args[0]);
            StaleErrorCheck(args[0], true); StaleErrorCheck(args[0], false);
            CurrentErrorCheck(args[0]);
            Task.Run(() => StalledBodyCheck()).GetAwaiter().GetResult();
            Console.WriteLine("PASS synthetic UI actual compiled host; no service, worker, monitoring permission or live capture started");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message); return 1;
        }
    }
}
