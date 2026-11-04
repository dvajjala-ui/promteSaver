// TypingRecorder - a visible, consent-first Windows text recorder.
//
// Flow:  open -> agree to monitoring -> press Record -> type anywhere ->
//        text is reconstructed per app (and website for browsers) and written
//        to daily Markdown files -> review them in the Library tab -> Stop.
//
// Everything is local. There is no network code in this app at all.
// Password / credential windows are excluded before any text is read.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace TypingRecorder {

    internal static class Program {
        internal const string AppName = "TypingRecorder";

        [STAThread]
        static void Main() {
            bool createdNew;
            using (var mutex = new Mutex(true, "TypingRecorder.SingleInstance.v1", out createdNew)) {
                if (!createdNew) {
                    MessageBox.Show("TypingRecorder is already running.", AppName,
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // Explicit monitoring consent every time the app opens.
                using (var consent = new ConsentForm()) {
                    if (consent.ShowDialog() != DialogResult.OK) return;
                }

                try { MarkdownStore.EnsureDirs(); } catch { }
                Application.Run(new MainForm());
            }
        }
    }

    // ---------------------------------------------------------------------
    // Consent / monitoring agreement shown before the main window.
    // ---------------------------------------------------------------------
    internal sealed class ConsentForm : Form {
        readonly CheckBox agree;
        readonly Button ok;

        internal ConsentForm() {
            Text = "TypingRecorder — monitoring agreement";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false; MinimizeBox = false;
            ClientSize = new Size(560, 430);
            BackColor = Color.FromArgb(24, 26, 31);
            Font = new Font("Segoe UI", 9.75f);
            ForeColor = Color.FromArgb(230, 234, 240);

            var title = new Label();
            title.Text = "This app records your typing";
            title.Font = new Font("Segoe UI Semibold", 15f);
            title.ForeColor = Color.White;
            title.SetBounds(24, 20, 512, 32);
            Controls.Add(title);

            var body = new Label();
            body.Text =
                "While recording is ON, TypingRecorder watches the keyboard across your apps and reconstructs the text you type. For each block of text it also records:\n\n" +
                "   •  the application you were typing in (e.g. chrome.exe, Code.exe)\n" +
                "   •  the window title, and\n" +
                "   •  the active website host + path when that app is a browser.\n\n" +
                "Copy, cut and paste text is recorded too. Everything is written to Markdown files on this PC only — there is no upload and no cloud. Password and Windows credential windows are skipped before any text is read, and URL query strings are dropped.\n\n" +
                "Recording never starts on its own: nothing is captured until you press Record, and Stop ends it at once.";
            body.SetBounds(24, 60, 512, 250);
            Controls.Add(body);

            var where = new Label();
            where.Text = "Files are saved in:  " + MarkdownStore.DataRoot;
            where.ForeColor = Color.FromArgb(150, 170, 200);
            where.SetBounds(24, 300, 512, 24);
            Controls.Add(where);

            agree = new CheckBox();
            agree.Text = "I understand, and I agree to record my own typing on this computer.";
            agree.SetBounds(24, 338, 512, 24);
            agree.ForeColor = Color.FromArgb(230, 234, 240);
            agree.CheckedChanged += delegate { ok.Enabled = agree.Checked; };
            Controls.Add(agree);

            ok = new Button();
            ok.Text = "Agree and continue";
            ok.Enabled = false;
            ok.SetBounds(300, 378, 150, 34);
            ok.FlatStyle = FlatStyle.Flat;
            ok.BackColor = Color.FromArgb(46, 120, 210);
            ok.ForeColor = Color.White;
            ok.DialogResult = DialogResult.OK;
            Controls.Add(ok);

            var cancel = new Button();
            cancel.Text = "Exit";
            cancel.SetBounds(460, 378, 76, 34);
            cancel.FlatStyle = FlatStyle.Flat;
            cancel.BackColor = Color.FromArgb(52, 56, 64);
            cancel.ForeColor = Color.White;
            cancel.DialogResult = DialogResult.Cancel;
            Controls.Add(cancel);

            AcceptButton = ok;
            CancelButton = cancel;
        }
    }

    // ---------------------------------------------------------------------
    // Main window: Record/Stop, live feed, and a file-backed library view.
    // ---------------------------------------------------------------------
    internal sealed class MainForm : Form {
        GlobalKeyboardCapture capture;
        ActiveContextMonitor monitor;
        readonly System.Windows.Forms.Timer statusTimer;

        Label statusDot;
        Label statusText;
        Label currentApp;
        Button recordButton;
        TextBox liveBox;
        ListBox fileList;
        TextBox fileView;
        TabControl tabs;

        // Diagnostics / coverage
        Label diagLive;
        TextBox diagBox;
        readonly SortedDictionary<string, int> appCounts =
            new SortedDictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        readonly List<string> skipLog = new List<string>();
        int sessionChunks;
        long sessionChars;
        string lastDiagKey;

        bool recording;

        internal MainForm() {
            Text = Program.AppName;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(960, 620);
            MinimumSize = new Size(760, 480);
            BackColor = Color.FromArgb(24, 26, 31);
            Font = new Font("Segoe UI", 9.75f);
            ForeColor = Color.FromArgb(230, 234, 240);

            monitor = new ActiveContextMonitor(700);
            capture = new GlobalKeyboardCapture(OnChunk, OnGap);

            BuildUi();

            statusTimer = new System.Windows.Forms.Timer();
            statusTimer.Interval = 500;
            statusTimer.Tick += delegate { RefreshCurrentApp(); RefreshDiagnostics(); };
            statusTimer.Start();

            RefreshLibrary();
            UpdateStatus();
        }

        // -- UI layout ------------------------------------------------------
        void BuildUi() {
            var header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 72;
            header.BackColor = Color.FromArgb(30, 33, 40);
            Controls.Add(header);

            statusDot = new Label();
            statusDot.Text = "●";
            statusDot.Font = new Font("Segoe UI", 16f);
            statusDot.SetBounds(18, 16, 28, 36);
            header.Controls.Add(statusDot);

            statusText = new Label();
            statusText.Font = new Font("Segoe UI Semibold", 13f);
            statusText.SetBounds(48, 12, 360, 28);
            header.Controls.Add(statusText);

            currentApp = new Label();
            currentApp.ForeColor = Color.FromArgb(150, 170, 200);
            currentApp.SetBounds(50, 42, 560, 22);
            header.Controls.Add(currentApp);

            recordButton = new Button();
            recordButton.Text = "●  Record";
            recordButton.Font = new Font("Segoe UI Semibold", 11f);
            recordButton.Size = new Size(150, 42);
            recordButton.FlatStyle = FlatStyle.Flat;
            recordButton.ForeColor = Color.White;
            recordButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            recordButton.Location = new Point(ClientSize.Width - 170, 15);
            recordButton.Click += delegate { ToggleRecording(); };
            header.Controls.Add(recordButton);

            // Action row
            var actions = new Panel();
            actions.Dock = DockStyle.Top;
            actions.Height = 44;
            actions.BackColor = Color.FromArgb(24, 26, 31);
            Controls.Add(actions);
            actions.BringToFront();

            var openFolder = MakeFlat("Open data folder", 12);
            openFolder.Click += delegate { OpenDataFolder(); };
            actions.Controls.Add(openFolder);

            var refresh = MakeFlat("Refresh library", 160);
            refresh.Click += delegate { RefreshLibrary(); };
            actions.Controls.Add(refresh);

            // Tabs
            tabs = new TabControl();
            tabs.Dock = DockStyle.Fill;
            Controls.Add(tabs);
            tabs.BringToFront();

            var liveTab = new TabPage("Live");
            liveTab.BackColor = Color.FromArgb(24, 26, 31);
            liveBox = new TextBox();
            liveBox.Multiline = true;
            liveBox.ReadOnly = true;
            liveBox.ScrollBars = ScrollBars.Vertical;
            liveBox.Dock = DockStyle.Fill;
            liveBox.BackColor = Color.FromArgb(18, 20, 24);
            liveBox.ForeColor = Color.FromArgb(210, 220, 230);
            liveBox.Font = new Font("Consolas", 9.5f);
            liveBox.BorderStyle = BorderStyle.None;
            liveBox.Text = "Press Record, then type in any app. Captured blocks appear here and are saved to the Library.\r\n";
            liveTab.Controls.Add(liveBox);
            tabs.TabPages.Add(liveTab);

            var libTab = new TabPage("Library");
            libTab.BackColor = Color.FromArgb(24, 26, 31);
            var split = new SplitContainer();
            split.Dock = DockStyle.Fill;
            split.SplitterDistance = 240;
            split.BackColor = Color.FromArgb(24, 26, 31);
            libTab.Controls.Add(split);

            fileList = new ListBox();
            fileList.Dock = DockStyle.Fill;
            fileList.BackColor = Color.FromArgb(18, 20, 24);
            fileList.ForeColor = Color.FromArgb(210, 220, 230);
            fileList.BorderStyle = BorderStyle.None;
            fileList.IntegralHeight = false;
            fileList.SelectedIndexChanged += delegate { ShowSelectedFile(); };
            split.Panel1.Controls.Add(fileList);

            fileView = new TextBox();
            fileView.Multiline = true;
            fileView.ReadOnly = true;
            fileView.ScrollBars = ScrollBars.Both;
            fileView.WordWrap = false;
            fileView.Dock = DockStyle.Fill;
            fileView.BackColor = Color.FromArgb(18, 20, 24);
            fileView.ForeColor = Color.FromArgb(210, 220, 230);
            fileView.Font = new Font("Consolas", 9.5f);
            fileView.BorderStyle = BorderStyle.None;
            split.Panel2.Controls.Add(fileView);

            tabs.TabPages.Add(libTab);

            // ---- Diagnostics tab ----
            var diagTab = new TabPage("Diagnostics");
            diagTab.BackColor = Color.FromArgb(24, 26, 31);

            diagBox = new TextBox();
            diagBox.Multiline = true;
            diagBox.ReadOnly = true;
            diagBox.ScrollBars = ScrollBars.Vertical;
            diagBox.WordWrap = false;
            diagBox.Dock = DockStyle.Fill;
            diagBox.BackColor = Color.FromArgb(18, 20, 24);
            diagBox.ForeColor = Color.FromArgb(210, 220, 230);
            diagBox.Font = new Font("Consolas", 9.5f);
            diagBox.BorderStyle = BorderStyle.None;
            diagTab.Controls.Add(diagBox);

            diagLive = new Label();
            diagLive.Dock = DockStyle.Top;
            diagLive.Height = 54;
            diagLive.TextAlign = ContentAlignment.MiddleLeft;
            diagLive.Padding = new Padding(10, 0, 10, 0);
            diagLive.Font = new Font("Segoe UI Semibold", 12f);
            diagLive.BackColor = Color.FromArgb(30, 33, 40);
            diagLive.ForeColor = Color.FromArgb(230, 234, 240);
            diagLive.Text = "Not recording.";
            diagTab.Controls.Add(diagLive);

            tabs.TabPages.Add(diagTab);

            var footer = new Label();
            footer.Dock = DockStyle.Bottom;
            footer.Height = 26;
            footer.TextAlign = ContentAlignment.MiddleLeft;
            footer.ForeColor = Color.FromArgb(120, 130, 145);
            footer.Text = "  Local only · " + MarkdownStore.DataRoot;
            Controls.Add(footer);
            footer.BringToFront();
        }

        Button MakeFlat(string text, int x) {
            var b = new Button();
            b.Text = text;
            b.Size = new Size(140, 30);
            b.Location = new Point(x, 7);
            b.FlatStyle = FlatStyle.Flat;
            b.BackColor = Color.FromArgb(52, 56, 64);
            b.ForeColor = Color.White;
            return b;
        }

        // -- Recording ------------------------------------------------------
        void ToggleRecording() {
            if (recording) StopRecording();
            else StartRecording();
        }

        void StartRecording() {
            try {
                capture.Start();
                monitor.Start();
                recording = true;
                appCounts.Clear(); skipLog.Clear();
                sessionChunks = 0; sessionChars = 0; lastDiagKey = null;
                AppendLive("--- recording started " + DateTime.Now.ToString("HH:mm:ss") + " ---");
            } catch (Exception e) {
                MessageBox.Show("Could not start recording:\n\n" + e.Message, Program.AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                recording = false;
            }
            UpdateStatus();
        }

        void StopRecording() {
            try { capture.Stop(); } catch { }
            try { monitor.Stop(); } catch { }
            recording = false;
            AppendLive("--- recording stopped " + DateTime.Now.ToString("HH:mm:ss") + " ---");
            UpdateStatus();
            RefreshLibrary();
        }

        void UpdateStatus() {
            if (recording) {
                statusDot.ForeColor = Color.FromArgb(230, 70, 70);
                statusText.Text = "Recording";
                recordButton.Text = "■  Stop";
                recordButton.BackColor = Color.FromArgb(180, 54, 54);
            } else {
                statusDot.ForeColor = Color.FromArgb(120, 130, 145);
                statusText.Text = "Stopped";
                currentApp.Text = "Not recording.";
                recordButton.Text = "●  Record";
                recordButton.BackColor = Color.FromArgb(46, 120, 210);
            }
            RefreshDiagnostics();
        }

        void RefreshCurrentApp() {
            if (!recording) return;
            ContextSnapshot s = monitor.Current;
            if (s == null || s.Process == null) { currentApp.Text = "Watching…"; return; }
            string reason;
            bool cap = WillCapture(s.Process, out reason);
            string site = !string.IsNullOrEmpty(s.Host) ? "  ·  " + s.Host + (s.Path == null ? "" : s.Path) : "";
            currentApp.Text = cap
                ? "Capturing: " + s.Process + site
                : "Skipped: " + s.Process + "  —  " + reason;
        }

        // -- Capture callbacks (run on the UI thread) ----------------------
        void OnChunk(KeystrokeChunk chunk) {
            if (chunk == null) return;
            ContextSnapshot s = monitor.Current;
            string title = null, host = null, path = null;
            if (s != null && string.Equals(s.Process, chunk.Source, StringComparison.OrdinalIgnoreCase)) {
                title = s.Title; host = s.Host; path = s.Path;
            } else if (s != null) {
                title = s.Title; // app switched mid-flush; keep title only
            }
            string via = chunk.IsEnterFlush ? "typed (enter)" : "typed";
            Record(chunk.Source, title, host, path, via, chunk.Text);
        }

        void OnGap(string code) {
            // Clipboard must be read on the STA UI thread; marshal onto it.
            if (IsDisposed) return;
            try {
                BeginInvoke((MethodInvoker)delegate { HandleClipboard(code); });
            } catch { }
        }

        void HandleClipboard(string code) {
            string via;
            if (code == "PASTE_EVENT") via = "paste";
            else if (code == "CUT_EVENT") via = "cut";
            else if (code == "COPY_EVENT") via = "copy";
            else return;

            string text = null;
            try { if (Clipboard.ContainsText()) text = Clipboard.GetText(); } catch { }
            if (string.IsNullOrEmpty(text)) return;

            ContextSnapshot s = monitor.Current;
            string app = s != null && s.Process != null ? s.Process : "unknown";
            string title = s != null ? s.Title : null;
            string host = s != null ? s.Host : null;
            string path = s != null ? s.Path : null;
            Record(app, title, host, path, via, text);
        }

        void Record(string app, string title, string host, string path, string via, string text) {
            string summary = null;
            try { summary = MarkdownStore.Append(DateTime.Now, app, title, host, path, via, text); }
            catch (Exception e) { AppendLive("[write error] " + e.Message); return; }
            if (summary != null) {
                sessionChunks++;
                sessionChars += (text != null ? text.Length : 0);
                string key = app != null ? app : "unknown";
                int cur; appCounts.TryGetValue(key, out cur);
                appCounts[key] = cur + 1;
                AppendLive(summary);
                RefreshDiagnostics();
            }
        }

        // Whether keystrokes in the given foreground app would be captured, and why not.
        bool WillCapture(string app, out string reason) {
            reason = "";
            if (string.IsNullOrEmpty(app)) { reason = "no foreground app"; return false; }
            string name = app;
            if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                name = name.Substring(0, name.Length - 4);
            if (string.Equals(name, "TypingRecorder", StringComparison.OrdinalIgnoreCase)) {
                reason = "this recorder window"; return false;
            }
            if (GlobalKeyboardCapture.IsBlockedProcess(app)) {
                reason = "system / credential window"; return false;
            }
            return true;
        }

        void RefreshDiagnostics() {
            if (diagLive == null || diagBox == null) return;

            if (!recording) {
                diagLive.ForeColor = Color.FromArgb(150, 160, 175);
                diagLive.Text = "Not recording.";
            } else {
                ContextSnapshot s = monitor.Current;
                string app = (s != null) ? s.Process : null;
                if (app == null) {
                    diagLive.ForeColor = Color.FromArgb(150, 160, 175);
                    diagLive.Text = "Watching… (no foreground app yet)";
                } else {
                    string reason;
                    bool cap = WillCapture(app, out reason);
                    string site = (s.Host != null) ? "  ·  " + s.Host + (s.Path == null ? "" : s.Path) : "";
                    if (cap) {
                        diagLive.ForeColor = Color.FromArgb(120, 210, 140);
                        diagLive.Text = "● Capturing: " + app + site;
                    } else {
                        diagLive.ForeColor = Color.FromArgb(235, 180, 90);
                        diagLive.Text = "✕ Skipped: " + app + "  —  " + reason;
                    }
                    string key = (cap ? "C:" : "S:") + app;
                    if (!cap && key != lastDiagKey) {
                        skipLog.Add(DateTime.Now.ToString("HH:mm:ss") + "  " + app + " — " + reason);
                        if (skipLog.Count > 60) skipLog.RemoveAt(0);
                    }
                    lastDiagKey = key;
                }
            }

            var sb = new StringBuilder();
            sb.AppendLine("SESSION COVERAGE");
            sb.AppendLine("  blocks saved : " + sessionChunks);
            sb.AppendLine("  chars saved  : " + sessionChars);
            sb.AppendLine("  apps captured: " + appCounts.Count);
            sb.AppendLine();
            sb.AppendLine("BY APP");
            if (appCounts.Count == 0) sb.AppendLine("  (nothing captured yet)");
            foreach (var kv in appCounts) sb.AppendLine("  " + kv.Key.PadRight(24) + kv.Value);
            sb.AppendLine();
            sb.AppendLine("RECENT SKIPS  (password and system windows are never recorded)");
            if (skipLog.Count == 0) sb.AppendLine("  (none)");
            for (int i = skipLog.Count - 1; i >= 0 && i >= skipLog.Count - 15; i--)
                sb.AppendLine("  " + skipLog[i]);

            diagBox.Text = sb.ToString();
        }

        // -- Live feed + library -------------------------------------------
        void AppendLive(string line) {
            if (liveBox == null) return;
            const int maxLen = 60000;
            if (liveBox.TextLength > maxLen)
                liveBox.Text = liveBox.Text.Substring(liveBox.TextLength - maxLen / 2);
            liveBox.AppendText(line + "\r\n");
        }

        void RefreshLibrary() {
            if (fileList == null) return;
            object keep = fileList.SelectedItem;
            fileList.BeginUpdate();
            fileList.Items.Clear();
            foreach (var f in MarkdownStore.ListFiles()) fileList.Items.Add(f);
            fileList.EndUpdate();
            if (keep != null) {
                for (int i = 0; i < fileList.Items.Count; i++)
                    if (fileList.Items[i].ToString() == keep.ToString()) { fileList.SelectedIndex = i; break; }
            } else if (fileList.Items.Count > 0) {
                fileList.SelectedIndex = 0;
            }
        }

        void ShowSelectedFile() {
            var f = fileList.SelectedItem as CaptureFile;
            if (f == null) { fileView.Text = ""; return; }
            fileView.Text = MarkdownStore.Read(f.Path).Replace("\n", "\r\n");
            fileView.SelectionStart = 0;
            fileView.ScrollToCaret();
        }

        void OpenDataFolder() {
            try {
                MarkdownStore.EnsureDirs();
                Process.Start("explorer.exe", "\"" + MarkdownStore.CaptureDir + "\"");
            } catch (Exception e) {
                MessageBox.Show("Could not open the folder:\n\n" + e.Message, Program.AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e) {
            statusTimer.Stop();
            try { if (capture != null) capture.Dispose(); } catch { }
            try { if (monitor != null) monitor.Dispose(); } catch { }
            base.OnFormClosing(e);
        }
    }
}
