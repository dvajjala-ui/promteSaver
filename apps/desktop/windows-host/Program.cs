// Native Windows developer preview. Uses the reviewed local Node service; no WebView, browser,
// global keyboard hook, clipboard polling, plaintext credentials on disk or frontend native IPC.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PromteSaver.WindowsPreview {
    internal static class Json {
        internal static JavaScriptSerializer Codec() { return new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024, RecursionLimit = 32 }; }
        internal static Dictionary<string, object> Object(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
        internal static string Text(Dictionary<string, object> value, string key) { object found; return value.TryGetValue(key, out found) && found != null ? Convert.ToString(found) : ""; }
        internal static bool Flag(Dictionary<string, object> value, string key) { object found; return value.TryGetValue(key, out found) && found is bool && (bool)found; }
        internal static object Get(Dictionary<string, object> value, string key) { object found; return value.TryGetValue(key, out found) ? found : null; }
        internal static IEnumerable<object> Items(Dictionary<string, object> value, string key) { return Get(value, key) as object[] ?? new object[0]; }
    }

    internal sealed class ApiProblem : Exception {
        internal readonly int Status;
        internal ApiProblem(int status, string message) : base(message) { Status = status; }
    }

    // The Windows preview keeps a random vault wrapping secret under CurrentUser DPAPI.
    // It is separate from legacy passphrase vaults; losing this file or Windows account
    // access requires restoring a separately exported backup.
    internal static class DesktopCredential {
        static readonly byte[] Entropy = Encoding.UTF8.GetBytes("promteSaver Windows desktop vault v1");
        internal static string DefaultVaultDirectory() {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (String.IsNullOrWhiteSpace(local)) throw new InvalidOperationException("Windows user data folder is unavailable.");
            return Path.Combine(local, "promteSaver", "desktop-vault");
        }
        internal static string LoadOrCreate(string directory) {
            Directory.CreateDirectory(directory);
            if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Unsafe desktop vault path.");
            string path = Path.Combine(directory, "desktop-credential.bin");
            if (!File.Exists(path) && File.Exists(Path.Combine(directory, "keyinfo.json")))
                throw new InvalidOperationException("The Windows vault credential is missing. Restore it from a backup; existing vault data was not changed.");
            if (File.Exists(path)) {
                if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Unsafe desktop credential path.");
                var protectedBytes = File.ReadAllBytes(path);
                if (protectedBytes.Length < 32 || protectedBytes.Length > 2048) throw new InvalidOperationException("Desktop credential is invalid.");
                byte[] plain = null;
                try {
                    plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
                    if (plain.Length != 48) throw new InvalidOperationException("Desktop credential is invalid.");
                    return Convert.ToBase64String(plain);
                } finally { if (plain != null) Array.Clear(plain, 0, plain.Length); Array.Clear(protectedBytes, 0, protectedBytes.Length); }
            }
            var secret = new byte[48];
            using (var random = RandomNumberGenerator.Create()) random.GetBytes(secret);
            byte[] wrapped = null;
            try {
                wrapped = ProtectedData.Protect(secret, Entropy, DataProtectionScope.CurrentUser);
                using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) {
                    stream.Write(wrapped, 0, wrapped.Length); stream.Flush(true);
                }
                return Convert.ToBase64String(secret);
            } finally { Array.Clear(secret, 0, secret.Length); if (wrapped != null) Array.Clear(wrapped, 0, wrapped.Length); }
        }
    }

    // Per-user Windows login launch. This starts the visible native app only;
    // it never grants a capture source, unlocks a vault or restores pairing.
    internal static class WindowsLoginStartup {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string ValueName = "promteSaver Windows Preview";
        internal static string Command(string executable) { return "\"" + Path.GetFullPath(executable) + "\""; }
        internal static bool Enabled(string executable) {
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey, false))
                return key != null && String.Equals(key.GetValue(ValueName) as string, Command(executable), StringComparison.OrdinalIgnoreCase);
        }
        internal static void SetEnabled(string executable, bool enabled) {
            if (enabled) {
                using (var key = Registry.CurrentUser.CreateSubKey(RunKey)) {
                    if (key == null) throw new InvalidOperationException("Windows startup settings are unavailable.");
                    key.SetValue(ValueName, Command(executable), RegistryValueKind.String);
                }
            } else {
                using (var key = Registry.CurrentUser.OpenSubKey(RunKey, true)) {
                    if (key != null && String.Equals(key.GetValue(ValueName) as string, Command(executable), StringComparison.OrdinalIgnoreCase))
                        key.DeleteValue(ValueName, false);
                }
            }
        }
    }

    internal sealed class LocalService : IDisposable {
        Process child;
        HttpClient http;
        readonly object processLock = new object();
        internal event Action Stopped;
        internal event Action<long> DeadlineObserved;
        internal bool Running { get { lock (processLock) { return child != null && !child.HasExited; } } }

        internal static Uri ValidateReady(string line) {
            if (line == null || Encoding.UTF8.GetByteCount(line) > 4096) throw new InvalidOperationException("Invalid local service handshake.");
            var ready = Json.Object(Json.Codec().DeserializeObject(line));
            Uri url;
            if (Json.Text(ready, "type") != "ready" || Json.Text(ready, "version") != "1" ||
                !Uri.TryCreate(Json.Text(ready, "url"), UriKind.Absolute, out url) || url.Scheme != "http" ||
                url.Host != "127.0.0.1" || url.Port < 1 || url.AbsolutePath != "/" || url.Query != "" ||
                url.UserInfo != "" || !Regex.IsMatch(url.Fragment, "^#[a-f0-9]{64}$"))
                throw new InvalidOperationException("Invalid local service handshake.");
            return url;
        }

        static string ReadBoundedLine(StreamReader reader) {
            var line = new StringBuilder();
            while (line.Length <= 4096) {
                int next = reader.Read();
                if (next < 0) throw new InvalidOperationException("The local vault service stopped before it was ready.");
                if (next == '\n') return line.ToString();
                line.Append((char)next);
            }
            throw new InvalidOperationException("Local service handshake exceeded its limit.");
        }

        internal async Task Start(string vaultDirectory) {
            var root = PreviewConfig.SourceRoot;
            var script = Path.Combine(root, "apps", "desktop", "sidecar.ts");
            if (!File.Exists(PreviewConfig.NodePath) || !File.Exists(script))
                throw new InvalidOperationException("This developer preview requires its source folder and supported local Node 24 runtime. Rebuild the preview after moving either.");
            var start = new ProcessStartInfo(PreviewConfig.NodePath, Quote(script) + " --desktop-child") {
                WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
            };
            start.EnvironmentVariables.Remove("NODE_OPTIONS"); start.EnvironmentVariables.Remove("NODE_PATH");
            start.EnvironmentVariables.Remove("PROMTESAVER_DATA_DIR");
            if (vaultDirectory != null) start.EnvironmentVariables["PROMTESAVER_DATA_DIR"] = vaultDirectory;
            var process = new Process { StartInfo = start, EnableRaisingEvents = true };
            process.Exited += delegate { var callback = Stopped; if (callback != null) callback(); };
            lock (processLock) { child = process; }
            try {
                process.Start();
                // Drain private runtime diagnostics without persisting paths, contents or capabilities.
                process.ErrorDataReceived += delegate { }; process.BeginErrorReadLine();
                var handshake = Task.Run(() => ReadBoundedLine(process.StandardOutput));
                if (await Task.WhenAny(handshake, Task.Delay(15000)) != handshake)
                    throw new InvalidOperationException("The local vault did not start in time. Close an existing promteSaver instance before trying again.");
                var url = ValidateReady(await handshake);
                var handler = new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false, UseCookies = false };
                http = new HttpClient(handler) { BaseAddress = new Uri(url.GetLeftPart(UriPartial.Authority)), Timeout = TimeSpan.FromSeconds(20) };
                http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", url.Fragment.Substring(1));
                // Fixed parent protocol responses contain no prompt data; drain without retaining them.
                ThreadPool.QueueUserWorkItem(delegate { try { var buffer = new char[1024]; while (process.StandardOutput.Read(buffer, 0, buffer.Length) > 0) { } } catch { } });
            } catch { Stop(); throw; }
        }

        static string Quote(string value) {
            if (value.IndexOf('"') >= 0 || value.EndsWith("\\")) throw new InvalidOperationException("Unsupported local runtime path.");
            return "\"" + value + "\"";
        }

        internal async Task<Dictionary<string, object>> Request(string path, string method, object payload, CancellationToken cancellation) {
            if (http == null) throw new InvalidOperationException("The local vault service is unavailable.");
            if (!path.StartsWith("/api/", StringComparison.Ordinal) || path.Contains("..") || path.Contains("#"))
                throw new InvalidOperationException("Invalid internal API path.");
            using (var request = new HttpRequestMessage(new HttpMethod(method), path)) {
                if (payload != null) request.Content = new StringContent(Json.Codec().Serialize(payload), Encoding.UTF8, "application/json");
                var elapsed = Stopwatch.StartNew();
                using (var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellation)) {
                    IEnumerable<string> atHeader, nowHeader; long at, now;
                    if (!cancellation.IsCancellationRequested && response.Headers.TryGetValues("X-Vault-Lock-At", out atHeader) && response.Headers.TryGetValues("X-Vault-Now", out nowHeader) &&
                        long.TryParse(string.Join("", atHeader), out at) && long.TryParse(string.Join("", nowHeader), out now)) {
                        var callback = DeadlineObserved;
                        // Subtract the entire request time so network/body delays cannot extend the local deadline.
                        if (callback != null) callback(at <= 0 ? 0 : Math.Max(0, at - now - elapsed.ElapsedMilliseconds));
                    }
                    if (response.Content.Headers.ContentLength > 4 * 1024 * 1024) throw new InvalidOperationException("Local response exceeded its limit.");
                    using (var stream = await response.Content.ReadAsStreamAsync())
                    using (var data = new MemoryStream()) {
                        var buffer = new byte[8192]; int count;
                        while ((count = await stream.ReadAsync(buffer, 0, buffer.Length, cancellation)) > 0) {
                            if (data.Length + count > 4 * 1024 * 1024) throw new InvalidOperationException("Local response exceeded its limit.");
                            data.Write(buffer, 0, count);
                        }
                        var result = Json.Object(Json.Codec().DeserializeObject(Encoding.UTF8.GetString(data.ToArray())));
                        if (!response.IsSuccessStatusCode) {
                            var message = Json.Text(result, "error");
                            throw new ApiProblem((int)response.StatusCode, message.Length > 0 && message.Length < 220 ? message : "The local operation could not complete.");
                        }
                        return result;
                    }
                }
            }
        }

        internal void LockViaPipe() {
            lock (processLock) { if (child != null && !child.HasExited) { child.StandardInput.WriteLine("{\"type\":\"lock\"}"); child.StandardInput.Flush(); } }
        }

        // Only the explicit --ui-smoke path calls this against its own temporary vault.
        internal async Task SeedSyntheticCapture() {
            var offer = await Request("/api/bridge/start", "POST", new { autoCaptureHosts = new[] { "chatgpt.com" } }, CancellationToken.None);
            string code = Json.Text(offer, "pairingCode").Split(':')[2];
            using (var fixture = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false, UseCookies = false }) { BaseAddress = http.BaseAddress, Timeout = TimeSpan.FromSeconds(10) }) {
                fixture.DefaultRequestHeaders.Add("Origin", "chrome-extension://" + new string('a', 32));
                using (var paired = await fixture.PostAsync("/api/bridge/pair", new StringContent(Json.Codec().Serialize(new { code = code }), Encoding.UTF8, "application/json"))) {
                    paired.EnsureSuccessStatusCode();
                    var response = Json.Object(Json.Codec().DeserializeObject(await paired.Content.ReadAsStringAsync()));
                    fixture.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", Json.Text(response, "writeToken"));
                }
                using (var captured = await fixture.PostAsync("/api/bridge/capture", new StringContent(Json.Codec().Serialize(new {
                    eventId = Guid.NewGuid().ToString(), host = "chatgpt.com", text = "Help me  write a clear project update. Keep the the next steps specific.", recordedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), signal = "send-click"
                }), Encoding.UTF8, "application/json"))) { captured.EnsureSuccessStatusCode(); }
            }
            await Request("/api/bridge/revoke", "POST", new { }, CancellationToken.None);
        }

        internal void Stop() {
            Process owned;
            lock (processLock) { owned = child; child = null; }
            if (owned == null) return;
            try {
                if (!owned.HasExited) {
                    owned.StandardInput.WriteLine("{\"type\":\"shutdown\"}"); owned.StandardInput.Flush(); owned.StandardInput.Close();
                    if (!owned.WaitForExit(4500)) { owned.Kill(); owned.WaitForExit(1500); }
                }
            } catch (InvalidOperationException) { } catch (IOException) { } catch (System.ComponentModel.Win32Exception) { }
            finally { owned.Dispose(); }
        }
        public void Dispose() { Stop(); if (http != null) http.Dispose(); }
    }

    internal sealed class PromptRow {
        internal Dictionary<string, object> Value;
        internal bool Review;
        public override string ToString() {
            var text = Json.Text(Value, "text").Replace("\r", " ").Replace("\n", " ");
            if (text.Length > 100) text = text.Substring(0, 100) + "…";
            return text;
        }
    }

    internal sealed class VaultWindow : Form {
        readonly LocalService service = new LocalService();
        readonly NotepadKeyboardCapture keyboardCapture;
        readonly NotifyIcon tray;
        readonly System.Windows.Forms.Timer statusTimer = new System.Windows.Forms.Timer { Interval = 10000 };
        readonly System.Windows.Forms.Timer deadlineTimer = new System.Windows.Forms.Timer { Interval = 200 };
        readonly Color background = Color.FromArgb(15, 21, 29), panelColor = Color.FromArgb(23, 32, 42), accent = Color.FromArgb(172, 236, 203);
        readonly Label state = new Label(), hint = new Label(), gateTitle = new Label(), gateMessage = new Label(), footer = new Label(), pageInfo = new Label(), detailMeta = new Label();
        readonly Panel gate = new Panel(), workspace = new Panel();
        readonly TextBox search = new TextBox(), raw = new TextBox(), suggestions = new TextBox(), pairing = new TextBox();
        readonly ListBox timeline = new ListBox();
        readonly Button unlock = new Button(), native = new Button(), notepad = new Button(), pause = new Button(), browser = new Button(), refresh = new Button(), next = new Button(), previous = new Button();
        readonly ComboBox browserSite = new ComboBox();
        readonly CheckBox nativeConsent = new CheckBox(), notepadConsent = new CheckBox(), loginStartup = new CheckBox();
        readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        CancellationTokenSource session = new CancellationTokenSource();
        bool initialized, unlocked, quitting, checking, nativeEnabled, reviewMode, minimizedNotice, changingLoginStartup;
        int epoch, offset, total;
        long localLockAt;
        string localKeyboardGap;
        readonly string fixtureDirectory;
        readonly bool pilotTemporary;
        readonly string vaultDirectory;

        internal VaultWindow(string fixtureDirectory, bool pilotTemporary) {
            this.fixtureDirectory = fixtureDirectory; this.pilotTemporary = pilotTemporary;
            keyboardCapture = new NotepadKeyboardCapture(SaveNotepadSnapshot, code => {
                if (unlocked) { localKeyboardGap = code; state.Text = "Notepad capture gap · " + code; tray.Text = "promteSaver · capture gap"; }
            });
            vaultDirectory = fixtureDirectory ?? DesktopCredential.DefaultVaultDirectory();
            Text = "promteSaver · Windows preview"; Icon = new Icon(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "promteSaver.ico"));
            StartPosition = FormStartPosition.CenterScreen; MinimumSize = new Size(950, 700); Size = new Size(1170, 820);
            AutoScaleMode = AutoScaleMode.Dpi; Font = new Font("Segoe UI", 10); BackColor = background; ForeColor = Color.FromArgb(226, 235, 241);
            var header = new Panel { Dock = DockStyle.Top, Height = 91, Padding = new Padding(25, 18, 25, 12), BackColor = panelColor };
            var brand = Label("promteSaver", 22, FontStyle.Bold); brand.Location = new Point(25, 10); brand.AutoSize = true; header.Controls.Add(brand);
            state.Text = "Starting local vault…"; state.ForeColor = accent; state.Location = new Point(27, 52); state.Size = new Size(760, 25); header.Controls.Add(state);
            var lockButton = Button("Lock vault", 125); lockButton.Anchor = AnchorStyles.Top | AnchorStyles.Right; lockButton.Location = new Point(Width - 190, 23); lockButton.Click += async delegate { await Lock(); }; header.Controls.Add(lockButton);
            Controls.Add(header);
            footer.Dock = DockStyle.Bottom; footer.Height = 36; footer.Padding = new Padding(25, 8, 8, 0); footer.Font = new Font(Font.FontFamily, 9); footer.ForeColor = Color.FromArgb(150, 170, 184);
            footer.Text = "Developer preview · Local encrypted storage · Close keeps the visible tray app running; Quit stops capture."; Controls.Add(footer);
            BuildGate(); BuildWorkspace();
            gate.BringToFront(); header.BringToFront(); footer.BringToFront();
            var menu = new ContextMenuStrip(); menu.Items.Add("Open promteSaver", null, delegate { OpenWindow(); });
            menu.Items.Add("Lock vault and stop capture", null, async delegate { await Lock(); });
            menu.Items.Add("Pause all capture", null, async delegate { keyboardCapture.Stop(); localKeyboardGap = null; await Execute(async () => { await service.Request("/api/capture/pause", "POST", new { }, session.Token); await CaptureStatus(); }); });
            menu.Items.Add(new ToolStripSeparator()); menu.Items.Add("Quit promteSaver", null, delegate { Quit(); });
            tray = new NotifyIcon { Icon = Icon, Text = "promteSaver · starting", ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += delegate { OpenWindow(); };
            Shown += async delegate { await Start(); };
            FormClosing += OnClose; statusTimer.Tick += async delegate { await CheckStatus(); };
            service.DeadlineObserved += ObserveDeadline;
            deadlineTimer.Tick += async delegate { if (unlocked && Stopwatch.GetTimestamp() >= localLockAt) await Lock(); };
            SystemEvents.SessionSwitch += SessionSwitch;
        }

        Label Label(string text, float size, FontStyle style) { return new Label { Text = text, Font = new Font("Segoe UI", size, style), ForeColor = ForeColor, AutoSize = false }; }
        Button Button(string text, int width) {
            return new Button { Text = text, Width = width, Height = 38, FlatStyle = FlatStyle.Flat, BackColor = panelColor, ForeColor = ForeColor, Cursor = Cursors.Hand, Margin = new Padding(0, 0, 10, 0) };
        }
        void StyleButton(Button control, string text, int width) { var model = Button(text, width); control.Text = model.Text; control.Size = model.Size; control.FlatStyle = model.FlatStyle; control.BackColor = model.BackColor; control.ForeColor = model.ForeColor; control.Margin = model.Margin; control.Cursor = model.Cursor; model.Dispose(); }
        void StyleText(TextBox control, bool multiline) { control.BackColor = panelColor; control.ForeColor = ForeColor; control.BorderStyle = BorderStyle.FixedSingle; control.Multiline = multiline; if (multiline) { control.ScrollBars = ScrollBars.Vertical; control.ReadOnly = true; control.WordWrap = true; } }

        void BuildGate() {
            gate.Dock = DockStyle.Fill; gate.Padding = new Padding(35, 110, 35, 40); gate.BackColor = background;
            var card = new TableLayoutPanel { Width = 700, Height = 280, Location = new Point(45, 125), ColumnCount = 1, RowCount = 3, BackColor = background };
            gateTitle.Text = "Your private prompt memory"; gateTitle.Font = new Font("Segoe UI", 23, FontStyle.Bold); gateTitle.Size = new Size(600, 55); card.Controls.Add(gateTitle);
            gateMessage.Text = "Open your Windows-protected local vault, then choose what to remember."; gateMessage.Size = new Size(680, 80); card.Controls.Add(gateMessage);
            StyleButton(unlock, "Open vault", 180); unlock.BackColor = accent; unlock.ForeColor = background; unlock.Click += async delegate { await Unlock(); }; card.Controls.Add(unlock);
            gate.Controls.Add(card); Controls.Add(gate);
        }

        void BuildWorkspace() {
            workspace.Dock = DockStyle.Fill; workspace.Padding = new Padding(24, 12, 24, 8); workspace.Visible = false; Controls.Add(workspace);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 7 };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 55)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 45)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
            hint.Dock = DockStyle.Fill; hint.Text = "Choose a source. New prompts are saved automatically while the vault stays unlocked."; hint.ForeColor = accent; layout.Controls.Add(hint, 0, 0);
            var sources = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
            nativeConsent.Text = "Remember new Codex prompts from local session logs (experimental)"; nativeConsent.Size = new Size(560, 38); nativeConsent.ForeColor = ForeColor; nativeConsent.AccessibleName = nativeConsent.Text; nativeConsent.Visible = false; nativeConsent.TabStop = false; sources.Controls.Add(nativeConsent);
            StyleButton(native, "Enable Codex", 145); native.Click += async delegate { await ToggleNative(); }; native.Visible = false; native.TabStop = false; sources.Controls.Add(native);
            notepadConsent.Text = "Save Notepad editor text"; notepadConsent.Size = new Size(245, 38);
            notepadConsent.ForeColor = ForeColor; notepadConsent.AccessibleName = "Approve saving any foreground Notepad editor text after keyboard activity for this unlocked session";
            sources.Controls.Add(notepadConsent);
            StyleButton(notepad, "Start Notepad", 150); notepad.Click += async delegate { await ToggleNotepad(); }; sources.Controls.Add(notepad);
            browserSite.DropDownStyle = ComboBoxStyle.DropDownList; browserSite.Width = 125; browserSite.Height = 38;
            browserSite.AccessibleName = "Choose one AI site to connect";
            browserSite.Items.AddRange(new object[] { "ChatGPT", "Claude", "Gemini" }); browserSite.SelectedIndex = 0; sources.Controls.Add(browserSite);
            StyleButton(browser, "Connect browser", 155); browser.Click += async delegate { await PairBrowser(); }; sources.Controls.Add(browser); layout.Controls.Add(sources, 0, 1);
            loginStartup.Text = "Start with Windows"; loginStartup.Size = new Size(190, 38); loginStartup.ForeColor = ForeColor;
            loginStartup.AccessibleName = "Start promteSaver with Windows; capture stays off until the vault is opened and a source is approved";
            try { loginStartup.Checked = !pilotTemporary && fixtureDirectory == null && WindowsLoginStartup.Enabled(Application.ExecutablePath); }
            catch { loginStartup.Checked = false; }
            loginStartup.Enabled = fixtureDirectory == null;
            loginStartup.CheckedChanged += delegate {
                if (changingLoginStartup) return;
                try {
                    WindowsLoginStartup.SetEnabled(Application.ExecutablePath, loginStartup.Checked);
                    footer.Text = loginStartup.Checked
                        ? "Starts with Windows. Open the vault and approve a source to resume capture."
                        : "Windows login startup is off. Use this app's Quit action to stop it now.";
                } catch {
                    changingLoginStartup = true; loginStartup.Checked = !loginStartup.Checked; changingLoginStartup = false;
                    footer.Text = "Windows startup setting could not be changed. Check your account or policy.";
                }
            }; sources.Controls.Add(loginStartup);
            var tools = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
            StyleButton(pause, "Pause all", 120); pause.Click += async delegate { keyboardCapture.Stop(); localKeyboardGap = null; await Execute(async () => { await service.Request("/api/capture/pause", "POST", new { }, session.Token); await CaptureStatus(); }); }; tools.Controls.Add(pause);
            StyleButton(refresh, "Refresh prompts", 155); refresh.Click += async delegate { reviewMode = false; offset = 0; await LoadPage(); }; tools.Controls.Add(refresh);
            var review = Button("Review recent wording", 195); review.Click += async delegate { reviewMode = true; offset = 0; await LoadPage(); }; tools.Controls.Add(review);
            StyleText(search, false); search.Width = 220; search.AccessibleName = "Search saved prompts"; tools.Controls.Add(search);
            var find = Button("Search", 90); find.Click += async delegate { reviewMode = false; offset = 0; await LoadPage(); }; tools.Controls.Add(find); layout.Controls.Add(tools, 0, 2);
            pairing.Dock = DockStyle.Fill; pairing.ReadOnly = true; StyleText(pairing, false); pairing.Visible = false; pairing.AccessibleName = "Single-use browser pairing code";
            layout.Controls.Add(pairing, 0, 3);
            var split = new SplitContainer { Width = 1000, Dock = DockStyle.Fill, SplitterDistance = 360, BackColor = panelColor, BorderStyle = BorderStyle.FixedSingle, Panel1MinSize = 220, Panel2MinSize = 300 };
            timeline.Dock = DockStyle.Fill; timeline.BackColor = panelColor; timeline.ForeColor = ForeColor; timeline.BorderStyle = BorderStyle.None; timeline.ItemHeight = 50; timeline.DrawMode = DrawMode.OwnerDrawFixed;
            timeline.DrawItem += DrawPrompt; timeline.SelectedIndexChanged += delegate { SelectPrompt(); }; split.Panel1.Controls.Add(timeline);
            var detail = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18, 8, 10, 8), BackColor = panelColor, ColumnCount = 1, RowCount = 5 };
            detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 52)); detail.RowStyles.Add(new RowStyle(SizeType.Percent, 68)); detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 30)); detail.RowStyles.Add(new RowStyle(SizeType.Percent, 32)); detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            detailMeta.Dock = DockStyle.Fill; detailMeta.Text = "Saved capture snapshot"; detail.Controls.Add(detailMeta); StyleText(raw, true); raw.Dock = DockStyle.Fill; raw.AccessibleName = "Saved capture snapshot, read only"; detail.Controls.Add(raw);
            var suggestionsLabel = Label("Review suggestions · saved snapshots stay unchanged", 10, FontStyle.Bold); suggestionsLabel.Dock = DockStyle.Fill; detail.Controls.Add(suggestionsLabel);
            StyleText(suggestions, true); suggestions.Dock = DockStyle.Fill; suggestions.AccessibleName = "Optional wording review suggestions"; detail.Controls.Add(suggestions);
            var copy = Button("Copy saved text", 150); copy.Click += delegate { if (unlocked && raw.Text.Length > 0) { try { Clipboard.SetText(raw.Text); footer.Text = "Saved snapshot copied. Your encrypted captured evidence stays unchanged."; } catch { footer.Text = "Clipboard is busy. Try copying again."; } } }; detail.Controls.Add(copy);
            split.Panel2.Controls.Add(detail); layout.Controls.Add(split, 0, 4);
            var paging = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(0, 4, 0, 0) };
            StyleButton(previous, "Previous", 100); previous.Click += async delegate { offset = Math.Max(0, offset - 10); await LoadPage(); }; paging.Controls.Add(previous);
            StyleButton(next, "Next", 100); next.Click += async delegate { offset += 10; await LoadPage(); }; paging.Controls.Add(next); pageInfo.Size = new Size(580, 35); pageInfo.Padding = new Padding(8); paging.Controls.Add(pageInfo); layout.Controls.Add(paging, 0, 5);
            var boundaries = Label("Approved Notepad editors save any text as drafts, not sent prompts. Browser capture needs the optional helper; other apps are not recorded.", 9, FontStyle.Regular); boundaries.Dock = DockStyle.Fill; boundaries.ForeColor = Color.FromArgb(150, 170, 184); layout.Controls.Add(boundaries, 0, 6);
            workspace.Controls.Add(layout);
        }

        async Task Start() {
            string startupStage = "service";
            try {
                await service.Start(vaultDirectory);
                service.Stopped += delegate { if (!IsDisposed && IsHandleCreated) BeginInvoke((Action)(() => { ShowGate(); state.Text = "Local service stopped"; gateMessage.Text = "Reopen promteSaver to restart its local vault service."; unlock.Enabled = false; })); };
                startupStage = "status";
                var status = await service.Request("/api/status", "GET", null, lifetime.Token); initialized = Json.Flag(status, "initialized"); ShowGate(); statusTimer.Start();
                if (fixtureDirectory != null && !pilotTemporary) {
                    startupStage = "synthetic setup";
                    string fixtureSecret = DesktopCredential.LoadOrCreate(vaultDirectory);
                    await service.Request("/api/setup", "POST", new { passphrase = fixtureSecret, confirm = fixtureSecret }, lifetime.Token); fixtureSecret = null;
                    startupStage = "synthetic capture";
                    await service.SeedSyntheticCapture(); initialized = true; unlocked = true; gate.Visible = false; workspace.Visible = true; workspace.BringToFront();
                    startupStage = "synthetic status";
                    await CaptureStatus(); native.Enabled = false; nativeConsent.Enabled = false; browser.Enabled = false;
                    startupStage = "synthetic list";
                    await LoadPage(); Text += " · SYNTHETIC UI FIXTURE";
                    footer.Text = "Synthetic UI fixture · temporary vault · real capture controls disabled · close with Alt+F4, then Quit in tray.";
                }
                if (pilotTemporary) { Text += " · TEMPORARY LIVE TEST VAULT"; footer.Text = "Temporary live test vault · harmless prompts only · Quit removes this test vault."; }
            } catch (Exception error) { state.Text = "Could not start local vault"; gateMessage.Text = fixtureDirectory != null ? "Synthetic startup failed at " + startupStage + " (" + error.GetType().Name + (error is ApiProblem ? " " + ((ApiProblem)error).Status : "") + ")." : "Close another promteSaver instance or check that runtime/ and binaries/ are beside this executable. Windows .NET Framework 4.7.2+ is required."; unlock.Enabled = false; }
        }

        void ShowGate() {
            keyboardCapture.Stop();
            localKeyboardGap = null;
            deadlineTimer.Stop(); localLockAt = 0;
            unlocked = false; epoch++; session.Cancel(); session.Dispose(); session = new CancellationTokenSource();
            raw.Clear(); suggestions.Clear(); pairing.Clear(); pairing.Visible = false; search.Clear(); timeline.Items.Clear();
            nativeEnabled = false; nativeConsent.Checked = false; native.Text = "Enable Codex";
            notepadConsent.Checked = false; notepad.Text = "Start Notepad"; workspace.Visible = false; gate.Visible = true; gate.BringToFront();
            gateTitle.Text = initialized ? "Welcome back." : "Your private prompt memory";
            gateMessage.Text = initialized ? "Open your Windows-protected vault, then approve the sources you want to remember." :
                "Create a local encrypted vault protected by this Windows account. Back up your data before changing devices or Windows accounts.";
            unlock.Text = initialized ? "Open vault" : "Create vault";
            state.Text = "Locked · all capture stopped"; tray.Text = "promteSaver · locked"; unlock.Focus();
        }

        async Task Unlock() {
            if (!unlock.Enabled) return;
            string secret = null;
            int requestEpoch = epoch; unlock.Enabled = false; bool unexpectedFailure = false;
            try {
                secret = DesktopCredential.LoadOrCreate(vaultDirectory);
                await service.Request(initialized ? "/api/unlock" : "/api/setup", "POST", initialized ? (object)new { passphrase = secret } : new { passphrase = secret, confirm = secret }, session.Token);
                if (requestEpoch != epoch || quitting) return;
                initialized = true; unlocked = true; gate.Visible = false; workspace.Visible = true; workspace.BringToFront();
                await CaptureStatus(); await LoadPage();
            } catch (OperationCanceledException) { }
            catch (ApiProblem error) { if (requestEpoch == epoch) gateMessage.Text = error.Message; }
            catch (InvalidOperationException error) { if (requestEpoch == epoch) gateMessage.Text = error.Message; }
            catch (CryptographicException) { if (requestEpoch == epoch) gateMessage.Text = "Windows could not open this vault's protected credential. Use the original Windows account or restore a backup."; }
            catch { unexpectedFailure = requestEpoch == epoch; }
            finally { secret = null; unlock.Enabled = service.Running; }
            if (unexpectedFailure) { if (unlocked) await FailClosed(); gateMessage.Text = "Could not unlock or load the vault. Reopen the app to retry."; }
        }

        async Task Lock() {
            ShowGate(); unlock.Enabled = false;
            bool failed = false;
            try { service.LockViaPipe(); await service.Request("/api/lock", "POST", new { }, lifetime.Token); }
            catch { failed = true; }
            if (failed) { await Task.Run(() => service.Stop()); gateMessage.Text = "The local service was stopped because locking could not be confirmed. Reopen the app."; }
            else unlock.Enabled = true;
        }

        void ObserveDeadline(long millisecondsRemaining) {
            if (InvokeRequired) { if (!IsDisposed && IsHandleCreated) BeginInvoke((Action)(() => ObserveDeadline(millisecondsRemaining))); return; }
            if (!unlocked || quitting) return;
            if (millisecondsRemaining <= 0) { BeginInvoke((Action)(async () => await Lock())); return; }
            localLockAt = Stopwatch.GetTimestamp() + (long)(Math.Max(0, millisecondsRemaining - 200) * (double)Stopwatch.Frequency / 1000);
            deadlineTimer.Start();
        }

        async Task CheckStatus() {
            if (checking || quitting || !service.Running) return; checking = true; int observedEpoch = epoch; bool failed = false;
            try {
                var current = await service.Request("/api/status", "GET", null, unlocked ? session.Token : lifetime.Token);
                if (observedEpoch != epoch || quitting) return;
                if (unlocked && !Json.Flag(current, "unlocked")) { ShowGate(); return; }
                if (unlocked) await CaptureStatus();
            } catch { failed = unlocked && observedEpoch == epoch; }
            finally { checking = false; }
            if (failed) await FailClosed();
        }

        async Task FailClosed() {
            try { service.LockViaPipe(); } catch { }
            ShowGate(); unlock.Enabled = false;
            state.Text = "Connection lost · stopping capture";
            await Task.Run(() => service.Stop());
            if (!quitting) { state.Text = "Local service stopped · capture off"; gateMessage.Text = "The local service lost contact and was stopped. Reopen promteSaver to retry."; }
        }

        async Task CaptureStatus() {
            int observedEpoch = epoch;
            var result = await service.Request("/api/capture/status", "GET", null, session.Token);
            if (observedEpoch != epoch || !unlocked) return;
            var source = Json.Object(Json.Get(result, "native")); var browserState = Json.Object(Json.Get(result, "browser"));
            var keyboard = Json.Object(Json.Get(result, "keyboard"));
            nativeEnabled = Json.Flag(source, "enabled"); native.Text = nativeEnabled ? "Pause Codex" : "Enable Codex";
            native.Enabled = fixtureDirectory == null && (Json.Flag(source, "available") || nativeEnabled);
            bool keyboardEnabled = Json.Flag(keyboard, "enabled") && keyboardCapture.Enabled;
            notepad.Enabled = (fixtureDirectory == null || pilotTemporary) && Json.Flag(keyboard, "available");
            notepadConsent.Enabled = notepad.Enabled && !keyboardEnabled;
            notepad.Text = keyboardEnabled ? "Pause Notepad" : "Start Notepad";
            var sourceState = Json.Text(source, "state");
            bool browserPaired = Json.Flag(browserState, "paired");
            string approvedHost = ""; foreach (var item in Json.Items(browserState, "hosts")) { approvedHost = Convert.ToString(item); break; }
            string code = Json.Text(source, "code");
            bool sourceGap = code.Length > 0;
            string description = keyboardEnabled ? "Saving approved Notepad editor text" : sourceState == "running" ? "Remembering new Codex prompts" : browserPaired ? "Browser paired" + (approvedHost.Length > 0 ? " for " + approvedHost : "") + " · enable site in helper" : "Capture off · choose a source";
            string keyboardCode = Json.Text(keyboard, "code");
            if (keyboardCode.Length == 0) keyboardCode = localKeyboardGap ?? "";
            if (keyboardCode.Length > 0) description = "Notepad capture gap · " + keyboardCode;
            if (sourceGap) description = "Capture gap · " + code + " · check recent saves";
            state.Text = description; tray.Text = "promteSaver · " + (sourceGap || keyboardCode.Length > 0 ? "capture gap" : keyboardEnabled ? "Notepad capture on" : sourceState == "running" ? "Codex capture on" : browserPaired ? "browser pairing ready" : "capture off");
            hint.Text = sourceGap ? "Some Codex events may not have been saved. Check recent captures; pausing and restarting cannot recover missed text." :
                keyboardCode.Length > 0 ? "Some Notepad text may not have been saved. Check recent snapshots; pause and retry this source." :
                sourceState == "running" ? "New Codex prompts are saved from approved local session logs. Refresh to see the latest." :
                keyboardEnabled ? "Any changed text in an approved Notepad editor is saved after a short pause. Refresh prompts to review it." :
                "Approve Notepad here or connect the browser companion. Other desktop sources remain unavailable.";
        }

        async Task SaveNotepadSnapshot(string text) {
            if (!unlocked || !keyboardCapture.Enabled) return;
            int observedEpoch = epoch;
            try {
                var response = await service.Request("/api/capture/keyboard/snapshot", "POST",
                    new { eventId = Guid.NewGuid().ToString(), text, recordedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture) }, session.Token);
                if (observedEpoch == epoch && unlocked && Json.Flag(response, "saved")) {
                    localKeyboardGap = null;
                    footer.Text = "Notepad draft saved locally. Refresh prompts to review the snapshot.";
                    await CaptureStatus();
                }
            } catch (OperationCanceledException) { }
            catch (ApiProblem error) {
                if (observedEpoch == epoch && unlocked) {
                    localKeyboardGap = error.Status == 429 ? "RATE_LIMIT" : "SAVE_FAILED";
                    state.Text = "Notepad capture gap · " + localKeyboardGap;
                    tray.Text = "promteSaver · capture gap";
                }
            }
        }

        async Task ToggleNotepad() {
            if (keyboardCapture.Enabled) {
                keyboardCapture.Stop();
                localKeyboardGap = null;
                await Execute(async () => {
                    await service.Request("/api/capture/keyboard/consent", "POST", new { enabled = false, source = "notepad.exe" }, session.Token);
                    await CaptureStatus(); footer.Text = "Notepad capture paused.";
                });
                return;
            }
            if (!notepadConsent.Checked) { footer.Text = "Approve the Notepad checkbox before starting this source."; return; }
            await Execute(async () => {
                localKeyboardGap = null;
                await service.Request("/api/capture/keyboard/consent", "POST", new { enabled = true, source = "notepad.exe", consent = true }, session.Token);
                try { keyboardCapture.Start(); } catch { keyboardCapture.Stop(); }
                if (!keyboardCapture.Enabled) {
                    await service.Request("/api/capture/keyboard/consent", "POST", new { enabled = false, source = "notepad.exe" }, session.Token);
                    throw new InvalidOperationException("Windows keyboard events are unavailable.");
                }
                await CaptureStatus(); footer.Text = "Notepad capture is on for this unlocked session. Pause, lock or Quit to stop it.";
            });
        }

        async Task ToggleNative() {
            if (!nativeEnabled && !nativeConsent.Checked) { footer.Text = "First approve the checkbox for remembering new prompts from Codex local session logs."; return; }
            bool enable = !nativeEnabled;
            await Execute(async () => {
                await service.Request("/api/capture/native", "POST", new { enabled = enable, consent = enable }, session.Token);
                await CaptureStatus();
                footer.Text = enable ? "Codex approved for this unlocked session. Only new user prompts are observed; existing history is not imported." : "Codex source paused.";
            });
        }

        async Task PairBrowser() {
            string host = browserSite.SelectedIndex == 1 ? "claude.ai" : browserSite.SelectedIndex == 2 ? "gemini.google.com" : "chatgpt.com";
            if (MessageBox.Show(this, "Approve send snapshots from " + host + " only? The browser companion still requires separate site permission. Locking revokes the pairing.", "Approve one browser source", MessageBoxButtons.OKCancel, MessageBoxIcon.Information) != DialogResult.OK) return;
            await Execute(async () => {
                int observedEpoch = epoch;
                var result = await service.Request("/api/bridge/start", "POST", new { autoCaptureHosts = new[] { host } }, session.Token);
                if (observedEpoch != epoch || !unlocked) return;
                pairing.Text = Json.Text(result, "pairingCode"); pairing.Visible = true; pairing.SelectAll();
                footer.Text = "Pair the browser helper, then enable " + host + " in its popup. Code expires in ten minutes.";
            });
        }

        async Task LoadPage() {
            if (!unlocked) return;
            int observedEpoch = epoch; string term = search.Text;
            await Execute(async () => {
                var result = await service.Request(reviewMode ? "/api/capture/review?limit=10" : "/api/captured?limit=10&offset=" + offset + "&q=" + Uri.EscapeDataString(term), "GET", null, session.Token);
                if (observedEpoch != epoch || !unlocked) return;
                timeline.Items.Clear(); raw.Clear(); suggestions.Clear();
                foreach (var item in Json.Items(result, "items")) timeline.Items.Add(new PromptRow { Value = Json.Object(item), Review = reviewMode });
                int.TryParse(Json.Text(result, "total"), out total);
                previous.Enabled = !reviewMode && offset > 0; next.Enabled = !reviewMode && offset + timeline.Items.Count < total;
                pageInfo.Text = reviewMode ? "Recent prompts · offline spacing checks · original text preserved" : (total == 0 ? "No captured prompts yet. Enable a source, then type a Notepad draft or send a browser prompt." : (offset + 1) + "–" + (offset + timeline.Items.Count) + " of " + total + " captured prompts");
                if (timeline.Items.Count > 0) timeline.SelectedIndex = 0;
            });
        }

        void SelectPrompt() {
            if (!unlocked) return;
            var row = timeline.SelectedItem as PromptRow; if (row == null) return;
            raw.Text = Json.Text(row.Value, "text");
            var surface = Json.Object(Json.Get(row.Value, "surface"));
            string source = row.Review ? Json.Text(row.Value, "source") : Json.Text(surface, "appId");
            DateTime stamp; string date = Json.Text(row.Value, "recordedAt");
            if (DateTime.TryParse(date, null, System.Globalization.DateTimeStyles.RoundtripKind, out stamp)) date = stamp.ToLocalTime().ToString("ddd, dd MMM · h:mm tt");
            string redaction = Json.Text(row.Value, "redactions");
            string quality = Json.Text(row.Value, "quality");
            string qualityLabel = quality == "draft_snapshot" ?
                (source == "notepad.exe" ? "Editor draft snapshot · no send observed" : "Send snapshot · delivery unverified") : quality;
            detailMeta.Text = source + " · " + date + "\n" + qualityLabel + (redaction != "" && redaction != "0" ? " · sensitive matches redacted" : "");
            var notes = new StringBuilder();
            foreach (var item in Json.Items(row.Value, "suggestions")) { var issue = Json.Object(item); notes.Append("• ").Append(Json.Text(issue, "message")).AppendLine(); }
            suggestions.Text = !row.Review ? "Select ‘Review recent wording’ to check for simple spacing, repetition and punctuation issues locally." : Json.Flag(row.Value, "checkSkipped") ? "This prompt exceeds the 12,000-character offline check limit. Saved snapshot kept." : notes.Length == 0 ? "No changes suggested by the lightweight offline checks. Saved snapshot kept." : notes.ToString();
        }

        void DrawPrompt(object sender, DrawItemEventArgs e) {
            if (e.Index < 0 || e.Index >= timeline.Items.Count) return;
            bool selected = (e.State & DrawItemState.Selected) != 0;
            using (var brush = new SolidBrush(selected ? Color.FromArgb(41, 70, 59) : panelColor)) e.Graphics.FillRectangle(brush, e.Bounds);
            var row = timeline.Items[e.Index] as PromptRow;
            TextRenderer.DrawText(e.Graphics, row == null ? "" : row.ToString(), Font, new Rectangle(e.Bounds.X + 12, e.Bounds.Y + 9, e.Bounds.Width - 22, e.Bounds.Height - 16), ForeColor, TextFormatFlags.EndEllipsis | TextFormatFlags.WordBreak);
            e.DrawFocusRectangle();
        }

        async Task Execute(Func<Task> action) {
            if (!unlocked) return; int observedEpoch = epoch; bool failed = false;
            try { await action(); }
            catch (OperationCanceledException) { }
            catch (ApiProblem error) { if (observedEpoch == epoch) { if (error.Status == 423 || error.Status == 401) ShowGate(); else footer.Text = error.Message; } }
            catch { failed = observedEpoch == epoch; }
            if (failed) await FailClosed();
        }

        void SessionSwitch(object sender, SessionSwitchEventArgs e) {
            if (e.Reason == SessionSwitchReason.SessionLock || e.Reason == SessionSwitchReason.SessionLogoff) {
                if (IsHandleCreated && !IsDisposed) BeginInvoke((Action)(async () => await Lock()));
            }
        }
        void OpenWindow() { Show(); WindowState = FormWindowState.Normal; Activate(); }
        void OnClose(object sender, FormClosingEventArgs e) {
            if (!quitting && e.CloseReason == CloseReason.UserClosing) {
                e.Cancel = true; Hide();
                if (!minimizedNotice) { minimizedNotice = true; tray.ShowBalloonTip(4500, "promteSaver is in the tray", "Approved capture continues while unlocked. Use the tray to open, pause, lock or quit.", ToolTipIcon.Info); }
                return;
            }
            keyboardCapture.Dispose(); statusTimer.Stop(); deadlineTimer.Stop(); lifetime.Cancel(); session.Cancel(); SystemEvents.SessionSwitch -= SessionSwitch; tray.Visible = false; tray.Dispose();
            service.Dispose(); lifetime.Dispose(); session.Dispose();
        }
        void Quit() { quitting = true; Close(); }
    }

    internal static class Program {
        static void CleanupTemporaryVault(string directory) {
            if (directory == null || !Directory.Exists(directory)) return;
            string target = Path.GetFullPath(directory);
            string tempRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!target.StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase) ||
                !Regex.IsMatch(Path.GetFileName(target), "^promtesaver-(?:ui|pilot|native)-[a-f0-9]{32}$") ||
                (File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Unsafe temporary vault cleanup path.");
            var pending = new Stack<string>(); pending.Push(target); int checkedDirectories = 0;
            while (pending.Count > 0) {
                if (++checkedDirectories > 32) throw new InvalidOperationException("Temporary vault cleanup directory limit exceeded.");
                foreach (var child in Directory.GetDirectories(pending.Pop(), "*", SearchOption.TopDirectoryOnly)) {
                    if ((File.GetAttributes(child) & FileAttributes.ReparsePoint) != 0)
                        throw new InvalidOperationException("Temporary vault contains an unsafe directory link.");
                    pending.Push(child);
                }
            }
            Directory.Delete(target, true);
        }
        [STAThread]
        static int Main(string[] args) {
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length == 1 && args[0] == "--self-test") return SelfTest().GetAwaiter().GetResult();
            Application.ThreadException += delegate { MessageBox.Show("An operation could not complete. Lock or quit the app before reopening it.", "promteSaver", MessageBoxButtons.OK, MessageBoxIcon.Error); };
            bool fixtureUi = (args.Length == 1 && args[0] == "--ui-smoke") || Path.GetFileNameWithoutExtension(Application.ExecutablePath) == "promteSaver.UiSmoke";
            bool pilotTemporary = args.Length == 1 && args[0] == "--pilot-temp";
            string fixtureDirectory = fixtureUi || pilotTemporary ? Path.Combine(Path.GetTempPath(), "promtesaver-" + (pilotTemporary ? "pilot-" : "ui-") + Guid.NewGuid().ToString("N")) : null;
            try { Application.Run(new VaultWindow(fixtureDirectory, pilotTemporary)); return 0; }
            finally { CleanupTemporaryVault(fixtureDirectory); }
        }

        static async Task<int> SelfTest() {
            string directory = Path.Combine(Path.GetTempPath(), "promtesaver-native-" + Guid.NewGuid().ToString("N"));
            string resultPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "native-smoke-result.txt");
            string stage = "startup";
            try {
                if (WindowsLoginStartup.Command(Path.Combine(Path.GetTempPath(), "promteSaver preview.exe")) !=
                    "\"" + Path.GetFullPath(Path.Combine(Path.GetTempPath(), "promteSaver preview.exe")) + "\"") throw new InvalidOperationException();
                using (var service = new LocalService()) {
                    bool rejected = false;
                    try { LocalService.ValidateReady("{\"type\":\"ready\",\"version\":1,\"url\":\"http://evil.example/#" + new string('a', 64) + "\"}"); } catch { rejected = true; }
                    if (!rejected) throw new InvalidOperationException();
                    await service.Start(directory); var cancellation = CancellationToken.None; stage = "vault setup";
                    var status = await service.Request("/api/status", "GET", null, cancellation);
                    if (Json.Flag(status, "initialized")) throw new InvalidOperationException();
                    string secret = DesktopCredential.LoadOrCreate(directory);
                    await service.Request("/api/setup", "POST", new { passphrase = secret, confirm = secret }, cancellation);
                    var capture = await service.Request("/api/capture/status", "GET", null, cancellation);
                    if (Json.Flag(Json.Object(Json.Get(capture, "native")), "enabled")) throw new InvalidOperationException();
                    stage = "synthetic browser send"; await service.SeedSyntheticCapture();
                    stage = "capture read";
                    var captured = await service.Request("/api/captured?limit=1&offset=0", "GET", null, cancellation);
                    var capturedItems = new List<object>(Json.Items(captured, "items"));
                    if (capturedItems.Count != 1 || Json.Text(Json.Object(capturedItems[0]), "quality") != "draft_snapshot") throw new InvalidOperationException();
                    stage = "synthetic Notepad keyboard snapshot";
                    await service.Request("/api/capture/keyboard/consent", "POST", new { enabled = true, source = "notepad.exe", consent = true }, cancellation);
                    var keyboardSaved = await service.Request("/api/capture/keyboard/snapshot", "POST", new {
                        eventId = Guid.NewGuid().ToString(), text = "Synthetic Notepad prompt draft for native verification.",
                        recordedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") }, cancellation);
                    if (!Json.Flag(keyboardSaved, "saved") || Json.Text(keyboardSaved, "quality") != "draft_snapshot") throw new InvalidOperationException();
                    await service.Request("/api/capture/keyboard/consent", "POST", new { enabled = false, source = "notepad.exe" }, cancellation);
                    stage = "library and lock"; await service.Request("/api/items", "POST", new { title = "Synthetic native preview check", body = "Synthetic safe host lifecycle content." }, cancellation);
                    await service.Request("/api/lock", "POST", new { }, cancellation);
                    status = await service.Request("/api/status", "GET", null, cancellation); if (Json.Flag(status, "unlocked")) throw new InvalidOperationException();
                    bool wrongRejected = false;
                    try { await service.Request("/api/unlock", "POST", new { passphrase = Guid.NewGuid().ToString("N") }, cancellation); } catch (ApiProblem) { wrongRejected = true; }
                    if (!wrongRejected) throw new InvalidOperationException();
                    await service.Request("/api/unlock", "POST", new { passphrase = secret }, cancellation);
                    if (DesktopCredential.LoadOrCreate(directory) != secret) throw new InvalidOperationException();
                    secret = null;
                    var items = await service.Request("/api/items?limit=1&view=preview", "GET", null, cancellation);
                    if (Json.Text(items, "total") != "3") throw new InvalidOperationException();
                    await service.Request("/api/capture/pause", "POST", new { }, cancellation);
                    await service.Request("/api/capture/review?limit=10", "GET", null, cancellation);
                    service.Stop(); if (File.Exists(Path.Combine(directory, ".vault-session.lock"))) throw new InvalidOperationException();
                    stage = "credential failure cases"; string keyPath = Path.Combine(directory, "desktop-credential.bin");
                    byte[] original = File.ReadAllBytes(keyPath);
                    File.Delete(keyPath);
                    bool missingRejected = false;
                    try { DesktopCredential.LoadOrCreate(directory); } catch (InvalidOperationException) { missingRejected = true; }
                    if (!missingRejected) throw new InvalidOperationException();
                    File.WriteAllBytes(keyPath, original);
                    var tampered = (byte[])original.Clone(); tampered[tampered.Length - 1] ^= 0x01;
                    File.WriteAllBytes(keyPath, tampered);
                    bool tamperRejected = false;
                    try { DesktopCredential.LoadOrCreate(directory); } catch (CryptographicException) { tamperRejected = true; }
                    if (!tamperRejected) throw new InvalidOperationException();
                    File.WriteAllBytes(keyPath, original);
                    Array.Clear(tampered, 0, tampered.Length); Array.Clear(original, 0, original.Length);
                }
                File.WriteAllText(resultPath, "PASS: native EXE service startup; strict private handshake; Windows CurrentUser-protected random vault secret; missing/tampered credential rejection; isolated encrypted vault setup; capture default-off; synthetic approved browser send and Notepad editor snapshot accepted as draft_snapshot; saved item; lock; wrong secret rejection; unlock; bounded list; pause; offline review; shutdown lease release.\r\nNOT TESTED: real Notepad keyboard hook/editor read, real third-party site capture, tray interaction, installer, signing, clean-device runtime.\r\n");
                return 0;
            } catch {
                File.WriteAllText(resultPath, "FAIL: native EXE synthetic service smoke stopped at " + stage + ". No prompt contents, paths or session capabilities were logged.\r\n"); return 1;
            } finally { CleanupTemporaryVault(directory); }
        }
    }
}
