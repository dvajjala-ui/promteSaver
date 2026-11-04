// Exclusions dialog: a read-only view of the built-in secret/credential
// exclusions plus editors for the user's own per-app and per-site exclusion
// lists. Every change is applied through the shared ExclusionStore, which
// normalizes, persists and raises Changed; this form keeps NO exclusion state
// of its own and never shows any captured text — only app/site identifiers.
//
// Compatible with .NET Framework 4.7.2 / C# 5 (csc.exe). Dark palette matches
// ConsentForm / MainForm. All UI work runs on the UI thread; the Changed handler
// marshals back onto it defensively in case the store is ever mutated elsewhere.
using System;
using System.Drawing;
using System.Windows.Forms;

namespace TypingRecorder {

    internal sealed class ExclusionsForm : Form {

        // -- Palette (matches ConsentForm / MainForm) --------------------------
        readonly Color colBack     = Color.FromArgb(24, 26, 31);
        readonly Color colFore     = Color.FromArgb(230, 234, 240);
        readonly Color colListBack = Color.FromArgb(18, 20, 24);
        readonly Color colListFore = Color.FromArgb(210, 220, 230);
        readonly Color colAccent   = Color.FromArgb(150, 170, 200);
        readonly Color colPrimary  = Color.FromArgb(46, 120, 210);
        readonly Color colButton    = Color.FromArgb(52, 56, 64);

        // -- Collaborators + immutable inputs (not exclusion state) ------------
        readonly ExclusionStore store;
        readonly string currentApp;   // e.g. "chrome.exe" (bare, from monitor.Current)
        readonly string currentHost;  // e.g. "chat.openai.com"

        // -- Controls ----------------------------------------------------------
        ListBox appList;
        ListBox siteList;
        ListBox builtInList;
        TextBox appAdd;
        TextBox siteAdd;
        Button excludeAppButton;
        Button excludeSiteButton;

        internal ExclusionsForm(ExclusionStore store, string currentApp, string currentHost) {
            if (store == null) throw new ArgumentNullException("store");
            this.store = store;
            this.currentApp = Normalize(currentApp);
            this.currentHost = Normalize(currentHost);

            Text = "TypingRecorder — exclusions";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            ClientSize = new Size(740, 636);
            BackColor = colBack;
            ForeColor = colFore;
            Font = new Font("Segoe UI", 9.75f);

            BuildUi();
            PopulateBuiltIn();
            ReloadLists();
            UpdateCurrentButtons();

            // Subscribe last, after the initial population, so construction never
            // double-fills. Detached again in Dispose(bool).
            store.Changed += OnStoreChanged;
        }

        static string Normalize(string s) {
            return s == null ? "" : s.Trim();
        }

        // -- Layout ------------------------------------------------------------
        void BuildUi() {
            Label title = new Label();
            title.Text = "Exclusions";
            title.Font = new Font("Segoe UI Semibold", 15f);
            title.ForeColor = Color.White;
            title.SetBounds(20, 16, 700, 30);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "Apps and websites in these lists are skipped while recording. " +
                            "Changes take effect immediately and are saved.";
            subtitle.ForeColor = colAccent;
            subtitle.SetBounds(20, 50, 700, 36);
            Controls.Add(subtitle);

            // ---- Apps column (left) ----
            Controls.Add(Header("Excluded apps (process names)", 20, 92, 340));

            appList = NewList(20, 118, 340, 172, true);
            Controls.Add(appList);

            appAdd = NewText(20, 298, 246);
            appAdd.KeyDown += delegate(object s, KeyEventArgs e) {
                if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; DoAddApp(); }
            };
            Controls.Add(appAdd);

            Button addAppBtn = NewButton("Add", 274, 296, 86, true);
            addAppBtn.Click += delegate { DoAddApp(); };
            Controls.Add(addAppBtn);

            Button removeAppBtn = NewButton("Remove selected", 20, 334, 160, false);
            removeAppBtn.Click += delegate { DoRemoveApp(); };
            Controls.Add(removeAppBtn);

            excludeAppButton = NewButton("Exclude current app", 20, 370, 340, false);
            excludeAppButton.Click += delegate { DoExcludeCurrentApp(); };
            Controls.Add(excludeAppButton);

            // ---- Sites column (right) ----
            Controls.Add(Header("Excluded websites (hosts)", 380, 92, 340));

            siteList = NewList(380, 118, 340, 172, true);
            Controls.Add(siteList);

            siteAdd = NewText(380, 298, 246);
            siteAdd.KeyDown += delegate(object s, KeyEventArgs e) {
                if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; DoAddSite(); }
            };
            Controls.Add(siteAdd);

            Button addSiteBtn = NewButton("Add", 634, 296, 86, true);
            addSiteBtn.Click += delegate { DoAddSite(); };
            Controls.Add(addSiteBtn);

            Button removeSiteBtn = NewButton("Remove selected", 380, 334, 160, false);
            removeSiteBtn.Click += delegate { DoRemoveSite(); };
            Controls.Add(removeSiteBtn);

            excludeSiteButton = NewButton("Exclude current site", 380, 370, 340, false);
            excludeSiteButton.Click += delegate { DoExcludeCurrentSite(); };
            Controls.Add(excludeSiteButton);

            // ---- Built-in (read-only transparency view) ----
            Controls.Add(Header("Always excluded (built-in, cannot be removed)", 20, 408, 700));

            builtInList = NewList(20, 434, 700, 130, false);
            Controls.Add(builtInList);

            Button closeBtn = NewButton("Close", 610, 584, 110, false);
            closeBtn.DialogResult = DialogResult.OK;
            closeBtn.Click += delegate { Close(); };
            Controls.Add(closeBtn);
            CancelButton = closeBtn; // Esc closes the dialog
        }

        Label Header(string text, int x, int y, int w) {
            Label l = new Label();
            l.Text = text;
            l.Font = new Font("Segoe UI Semibold", 10.5f);
            l.ForeColor = colFore;
            l.SetBounds(x, y, w, 22);
            return l;
        }

        ListBox NewList(int x, int y, int w, int h, bool selectable) {
            ListBox lb = new ListBox();
            lb.SetBounds(x, y, w, h);
            lb.BackColor = colListBack;
            lb.ForeColor = colListFore;
            lb.BorderStyle = BorderStyle.FixedSingle;
            lb.IntegralHeight = false;
            // The built-in list is read-only: SelectionMode.None still scrolls but
            // cannot be selected, which signals that nothing here can be removed.
            if (!selectable) lb.SelectionMode = SelectionMode.None;
            return lb;
        }

        TextBox NewText(int x, int y, int w) {
            TextBox t = new TextBox();
            t.SetBounds(x, y, w, 26);
            t.BackColor = colListBack;
            t.ForeColor = colListFore;
            t.BorderStyle = BorderStyle.FixedSingle;
            return t;
        }

        Button NewButton(string text, int x, int y, int w, bool primary) {
            Button b = new Button();
            b.Text = text;
            b.SetBounds(x, y, w, 30);
            b.FlatStyle = FlatStyle.Flat;
            b.ForeColor = Color.White;
            b.BackColor = primary ? colPrimary : colButton;
            b.FlatAppearance.BorderSize = 0;
            return b;
        }

        // -- Edits: always routed through the store, which normalizes, persists
        //    and raises Changed. The store silently no-ops invalid/duplicate input
        //    and never throws; the try/catch is purely defensive. The add box is
        //    cleared after every add — the list is the source of truth for whether
        //    the entry was accepted. ------------------------------------------
        void DoAddApp() {
            if (appAdd == null) return;
            string t = Normalize(appAdd.Text);
            if (t.Length == 0) return;
            try { store.AddApp(t); } catch { }
            appAdd.Text = "";
            appAdd.Focus();
        }

        void DoAddSite() {
            if (siteAdd == null) return;
            string t = Normalize(siteAdd.Text);
            if (t.Length == 0) return;
            try { store.AddSite(t); } catch { }
            siteAdd.Text = "";
            siteAdd.Focus();
        }

        void DoRemoveApp() {
            if (appList == null) return;
            string sel = appList.SelectedItem as string;
            if (string.IsNullOrEmpty(sel)) return;
            try { store.RemoveApp(sel); } catch { }
        }

        void DoRemoveSite() {
            if (siteList == null) return;
            string sel = siteList.SelectedItem as string;
            if (string.IsNullOrEmpty(sel)) return;
            try { store.RemoveSite(sel); } catch { }
        }

        void DoExcludeCurrentApp() {
            if (currentApp.Length == 0) return;
            try { store.AddApp(currentApp); } catch { }
        }

        void DoExcludeCurrentSite() {
            if (currentHost.Length == 0) return;
            try { store.AddSite(currentHost); } catch { }
        }

        // -- Changed handler: re-read the store; hold no local copy ------------
        void OnStoreChanged() {
            if (IsDisposed) return;
            if (InvokeRequired) {
                try { BeginInvoke((MethodInvoker)delegate { ApplyStoreChange(); }); }
                catch { /* handle gone / form closing */ }
                return;
            }
            ApplyStoreChange();
        }

        void ApplyStoreChange() {
            if (IsDisposed) return;
            ReloadLists();
            UpdateCurrentButtons();
        }

        void ReloadLists() {
            FillList(appList, store.Apps);
            FillList(siteList, store.Sites);
        }

        // store.Apps / store.Sites each return a fresh sorted copy, so it is safe
        // to bind them directly.
        static void FillList(ListBox list, string[] values) {
            if (list == null) return;
            string keep = list.SelectedItem as string;
            list.BeginUpdate();
            list.Items.Clear();
            if (values != null) {
                for (int i = 0; i < values.Length; i++) {
                    if (values[i] != null) list.Items.Add(values[i]);
                }
            }
            list.EndUpdate();
            if (keep != null) {
                int idx = list.FindStringExact(keep);
                if (idx >= 0 && string.Equals(list.Items[idx].ToString(), keep, StringComparison.Ordinal))
                    list.SelectedIndex = idx;
            }
        }

        void PopulateBuiltIn() {
            if (builtInList == null) return;
            string[] names = null;
            try { names = ExclusionStore.BuiltInApps(); } catch { }
            builtInList.BeginUpdate();
            builtInList.Items.Clear();
            if (names != null) {
                for (int i = 0; i < names.Length; i++)
                    if (names[i] != null) builtInList.Items.Add(names[i]);
            }
            builtInList.EndUpdate();
        }

        // The "Exclude current …" buttons carry the live foreground app/site. They
        // are disabled when there is nothing to exclude or it is already excluded,
        // so one click never silently no-ops.
        void UpdateCurrentButtons() {
            if (excludeAppButton != null) {
                if (currentApp.Length == 0) {
                    excludeAppButton.Enabled = false;
                    excludeAppButton.Text = "No current app";
                } else {
                    bool already = false;
                    try { already = store.IsAppExcluded(currentApp); } catch { }
                    excludeAppButton.Enabled = !already;
                    excludeAppButton.Text = already
                        ? "Current app already excluded"
                        : "Exclude current app: " + Clip(currentApp, 22);
                }
            }
            if (excludeSiteButton != null) {
                if (currentHost.Length == 0) {
                    excludeSiteButton.Enabled = false;
                    excludeSiteButton.Text = "No current site";
                } else {
                    bool already = false;
                    try { already = store.IsSiteExcluded(currentHost); } catch { }
                    excludeSiteButton.Enabled = !already;
                    excludeSiteButton.Text = already
                        ? "Current site already excluded"
                        : "Exclude current site: " + Clip(currentHost, 22);
                }
            }
        }

        static string Clip(string s, int max) {
            if (s == null) return "";
            if (s.Length <= max) return s;
            return s.Substring(0, max) + "…";
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                try { if (store != null) store.Changed -= OnStoreChanged; }
                catch { }
            }
            base.Dispose(disposing);
        }
    }
}
