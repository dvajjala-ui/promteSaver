// The Library UI: a self-contained dark UserControl with search + filter + group
// bar, a VirtualMode ListView for large histories, a read-only detail pane, and
// per-entry actions (copy / open / pin / delete-with-undo / restore / purge) plus
// a Rebuild button. It is the one new UI file wired into Program.cs.
//
// Everything stays local. Captured text is untrusted data: the detail pane renders
// it as plain text (never interpreted) and all owner-draw text is drawn with
// TextFormatFlags.NoPrefix so an '&' in captured content is never a mnemonic.
//
// Threading: index.Query runs on a background thread (it is self-synchronising);
// results are marshalled back with BeginInvoke and only applied if the query
// generation still matches, so stale results are dropped. The Row snapshot is an
// immutable array swapped atomically on the UI thread, so RetrieveVirtualItem
// needs no per-item lock.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace TypingRecorder {

    sealed class LibraryPanel : UserControl {

        // -- palette (matches the existing app) ---------------------------------
        static readonly Color ColBack   = Color.FromArgb(24, 26, 31);
        static readonly Color ColPanel  = Color.FromArgb(30, 33, 40);
        static readonly Color ColList   = Color.FromArgb(18, 20, 24);
        static readonly Color ColText   = Color.FromArgb(220, 226, 234);
        static readonly Color ColDim     = Color.FromArgb(150, 160, 175);
        static readonly Color ColAccent = Color.FromArgb(46, 120, 210);
        static readonly Color ColSel    = Color.FromArgb(46, 74, 110);
        static readonly Color ColGroup  = Color.FromArgb(38, 42, 50);
        static readonly Color ColBtn    = Color.FromArgb(52, 56, 64);
        static readonly Color ColToggle = Color.FromArgb(44, 48, 57);

        const string PinGlyph = "★"; // leading glyph on pinned rows
        const int PageLimit = 5000;       // matches the index result cap

        // -- cue banner for the search box --------------------------------------
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
        const int EM_SETCUEBANNER = 0x1501;

        // -- collaborators ------------------------------------------------------
        readonly CaptureIndex index;

        // -- controls -----------------------------------------------------------
        Panel header;
        TableLayoutPanel headerTable;
        TextBox search;
        ComboBox appCombo, siteCombo, dayCombo, viaCombo, sortCombo, groupCombo;
        Button aiBtn, pinnedBtn, trashBtn, rebuildBtn;
        Button copyBtn, openBtn, pinBtn, deleteBtn, restoreBtn, purgeBtn;
        Label countLabel;
        SplitContainer centerSplit;
        ListView list;
        TextBox detail;
        Panel undoStrip;
        Label undoLabel;
        Button undoBtn, undoDismiss;

        ContextMenuStrip menu;
        ToolStripMenuItem menuCopy, menuOpen, menuPin, menuDelete, menuRestore, menuPurge;

        // -- paint resources (disposed on Dispose) ------------------------------
        SolidBrush brushList, brushSel, brushGroup, brushHeader;
        Font cellFont, groupFont, headerFont, detailFont;

        // -- timers -------------------------------------------------------------
        System.Windows.Forms.Timer searchTimer;
        System.Windows.Forms.Timer undoTimer;

        // -- state --------------------------------------------------------------
        Row[] rows = new Row[0];            // immutable snapshot, swapped on UI thread
        int queryGen;                       // bumped per query; stale results dropped
        int detailGen;                      // bumped per detail load
        bool aiOnly, pinnedOnly, trashMode;
        bool suppressQuery;                 // guards programmatic combo changes
        bool initialLoaded;
        bool splitInit;
        readonly List<string> undo = new List<string>(); // bounded delete-undo stack

        internal LibraryPanel(CaptureIndex index) {
            this.index = index;
            suppressQuery = true;

            BackColor = ColBack;
            Font = new Font("Segoe UI", 9.75f);
            ForeColor = ColText;

            cellFont   = new Font("Segoe UI", 9f);
            groupFont  = new Font("Segoe UI Semibold", 9.5f);
            headerFont = new Font("Segoe UI", 9f, FontStyle.Bold);
            detailFont = new Font("Consolas", 9.5f);

            brushList   = new SolidBrush(ColList);
            brushSel    = new SolidBrush(ColSel);
            brushGroup  = new SolidBrush(ColGroup);
            brushHeader = new SolidBrush(ColPanel);

            BuildUi();

            searchTimer = new System.Windows.Forms.Timer();
            searchTimer.Interval = 200;
            searchTimer.Tick += delegate { searchTimer.Stop(); RunQuery(); };

            undoTimer = new System.Windows.Forms.Timer();
            undoTimer.Interval = 6000;
            undoTimer.Tick += delegate { HideUndoStrip(); };

            if (index != null) {
                try { index.IndexChanged += OnIndexChanged; } catch { }
            }

            countLabel.Text = "Building index…";
            UpdateActionStates();
            suppressQuery = false;
        }

        // ===================================================================
        //  UI construction
        // ===================================================================
        void BuildUi() {
            // --- center: list on top, detail below -------------------------
            centerSplit = new SplitContainer();
            centerSplit.Dock = DockStyle.Fill;
            centerSplit.Orientation = Orientation.Horizontal;
            centerSplit.BackColor = ColPanel;
            centerSplit.Panel1.BackColor = ColList;
            centerSplit.Panel2.BackColor = ColList;
            centerSplit.Panel1MinSize = 120;
            centerSplit.Panel2MinSize = 90;
            centerSplit.SplitterWidth = 6;

            list = new ListView();
            list.View = View.Details;
            list.VirtualMode = true;
            list.FullRowSelect = true;
            list.HideSelection = false;
            list.MultiSelect = false;
            list.OwnerDraw = true;
            list.GridLines = false;
            list.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            list.BorderStyle = BorderStyle.None;
            list.BackColor = ColList;
            list.ForeColor = ColText;
            list.Dock = DockStyle.Fill;
            list.Font = cellFont;
            list.Columns.Add("Time", 150);
            list.Columns.Add("App", 120);
            list.Columns.Add("Site", 170);
            list.Columns.Add("Via", 95);
            list.Columns.Add("AI", 90);
            list.Columns.Add("Preview", 520);
            list.VirtualListSize = 0;
            list.RetrieveVirtualItem += OnRetrieveVirtualItem;
            list.DrawColumnHeader += OnDrawColumnHeader;
            list.DrawItem += OnDrawItem;
            list.DrawSubItem += OnDrawSubItem;
            list.SelectedIndexChanged += delegate { OnSelectionChanged(); };
            list.MouseDown += OnListMouseDown;
            list.DoubleClick += delegate { DoOpen(); };
            TryEnableDoubleBuffer(list);

            detail = new TextBox();
            detail.Multiline = true;
            detail.ReadOnly = true;
            detail.ScrollBars = ScrollBars.Both;
            detail.WordWrap = false;
            detail.Dock = DockStyle.Fill;
            detail.BackColor = ColList;
            detail.ForeColor = Color.FromArgb(210, 220, 230);
            detail.BorderStyle = BorderStyle.None;
            detail.Font = detailFont;
            detail.Text = "";

            centerSplit.Panel1.Controls.Add(list);
            centerSplit.Panel2.Controls.Add(detail);

            // --- header (three rows of controls) ---------------------------
            headerTable = new TableLayoutPanel();
            headerTable.Dock = DockStyle.Fill;
            headerTable.ColumnCount = 1;
            headerTable.RowCount = 3;
            headerTable.BackColor = ColPanel;
            headerTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            headerTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 38f));
            headerTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 38f));
            headerTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 38f));

            FlowLayoutPanel row1 = MakeRow();
            search = new TextBox();
            search.Width = 230;
            search.Margin = new Padding(4, 7, 8, 6);
            search.BackColor = ColList;
            search.ForeColor = ColText;
            search.BorderStyle = BorderStyle.FixedSingle;
            search.TextChanged += delegate {
                if (suppressQuery) return;
                searchTimer.Stop(); searchTimer.Start();
            };
            row1.Controls.Add(search);
            appCombo  = MakeCombo(170); row1.Controls.Add(appCombo);
            siteCombo = MakeCombo(180); row1.Controls.Add(siteCombo);
            dayCombo  = MakeCombo(135); row1.Controls.Add(dayCombo);
            viaCombo  = MakeCombo(115); row1.Controls.Add(viaCombo);

            FlowLayoutPanel row2 = MakeRow();
            aiBtn = MakeToggle("AI only", new EventHandler(OnToggleAi));
            pinnedBtn = MakeToggle("Pinned only", new EventHandler(OnTogglePinned));
            row2.Controls.Add(aiBtn);
            row2.Controls.Add(pinnedBtn);
            Label sortLbl = MakeTag("Sort");
            row2.Controls.Add(sortLbl);
            sortCombo = MakeCombo(115);
            sortCombo.Items.Add("Newest");
            sortCombo.Items.Add("Oldest");
            sortCombo.Items.Add("Relevance");
            sortCombo.SelectedIndex = 0;
            row2.Controls.Add(sortCombo);
            Label groupLbl = MakeTag("Group");
            row2.Controls.Add(groupLbl);
            groupCombo = MakeCombo(110);
            groupCombo.Items.Add("None");
            groupCombo.Items.Add("App");
            groupCombo.Items.Add("Site");
            groupCombo.Items.Add("Day");
            groupCombo.SelectedIndex = 0;
            row2.Controls.Add(groupCombo);
            trashBtn = MakeToggle("Trash", new EventHandler(OnToggleTrash));
            row2.Controls.Add(trashBtn);
            rebuildBtn = MakeAction("Rebuild", new EventHandler(OnRebuild));
            row2.Controls.Add(rebuildBtn);
            countLabel = new Label();
            countLabel.AutoSize = true;
            countLabel.ForeColor = ColDim;
            countLabel.Margin = new Padding(10, 10, 4, 6);
            row2.Controls.Add(countLabel);

            FlowLayoutPanel row3 = MakeRow();
            copyBtn    = MakeAction("Copy",   new EventHandler(OnCopy));    row3.Controls.Add(copyBtn);
            openBtn    = MakeAction("Open",   new EventHandler(OnOpen));    row3.Controls.Add(openBtn);
            pinBtn     = MakeAction("Pin",    new EventHandler(OnPin));     row3.Controls.Add(pinBtn);
            deleteBtn  = MakeAction("Delete", new EventHandler(OnDelete));  row3.Controls.Add(deleteBtn);
            restoreBtn = MakeAction("Restore", new EventHandler(OnRestore)); row3.Controls.Add(restoreBtn);
            purgeBtn   = MakeAction("Delete permanently", new EventHandler(OnPurge)); purgeBtn.Width = 150; row3.Controls.Add(purgeBtn);

            headerTable.Controls.Add(row1, 0, 0);
            headerTable.Controls.Add(row2, 0, 1);
            headerTable.Controls.Add(row3, 0, 2);

            header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 118;
            header.BackColor = ColPanel;
            header.Controls.Add(headerTable);

            // --- transient undo strip --------------------------------------
            undoStrip = new Panel();
            undoStrip.Dock = DockStyle.Bottom;
            undoStrip.Height = 34;
            undoStrip.BackColor = Color.FromArgb(70, 58, 40);
            undoStrip.Visible = false;

            undoLabel = new Label();
            undoLabel.Dock = DockStyle.Fill;
            undoLabel.TextAlign = ContentAlignment.MiddleLeft;
            undoLabel.Padding = new Padding(12, 0, 0, 0);
            undoLabel.ForeColor = Color.FromArgb(240, 236, 226);
            undoLabel.Text = "Entry moved to Trash.";
            undoBtn = new Button();
            undoBtn.Text = "Undo";
            undoBtn.Dock = DockStyle.Right;
            undoBtn.Width = 90;
            undoBtn.FlatStyle = FlatStyle.Flat;
            undoBtn.FlatAppearance.BorderSize = 0;
            undoBtn.BackColor = ColAccent;
            undoBtn.ForeColor = Color.White;
            undoBtn.Click += new EventHandler(OnUndo);
            undoDismiss = new Button();
            undoDismiss.Text = "Dismiss";
            undoDismiss.Dock = DockStyle.Right;
            undoDismiss.Width = 90;
            undoDismiss.FlatStyle = FlatStyle.Flat;
            undoDismiss.FlatAppearance.BorderSize = 0;
            undoDismiss.BackColor = ColBtn;
            undoDismiss.ForeColor = Color.White;
            undoDismiss.Click += delegate { HideUndoStrip(); };
            undoStrip.Controls.Add(undoLabel);   // Fill first
            undoStrip.Controls.Add(undoDismiss); // then edges
            undoStrip.Controls.Add(undoBtn);

            // --- context menu (same action set as the buttons) -------------
            menu = new ContextMenuStrip();
            menu.BackColor = ColPanel;
            menu.ForeColor = ColText;
            menuCopy = new ToolStripMenuItem("Copy"); menuCopy.Click += new EventHandler(OnCopy);
            menuOpen = new ToolStripMenuItem("Open day file"); menuOpen.Click += new EventHandler(OnOpen);
            menuPin = new ToolStripMenuItem("Pin"); menuPin.Click += new EventHandler(OnPin);
            menuDelete = new ToolStripMenuItem("Delete"); menuDelete.Click += new EventHandler(OnDelete);
            menuRestore = new ToolStripMenuItem("Restore"); menuRestore.Click += new EventHandler(OnRestore);
            menuPurge = new ToolStripMenuItem("Delete permanently"); menuPurge.Click += new EventHandler(OnPurge);
            menu.Items.Add(menuCopy);
            menu.Items.Add(menuOpen);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(menuPin);
            menu.Items.Add(menuDelete);
            menu.Items.Add(menuRestore);
            menu.Items.Add(menuPurge);
            menu.Opening += new System.ComponentModel.CancelEventHandler(OnMenuOpening);
            list.ContextMenuStrip = menu;

            // --- assemble (Fill added first, then docked edges) ------------
            Controls.Add(centerSplit);
            Controls.Add(header);
            Controls.Add(undoStrip);

            // Via facet has no counts in Facets; offer a fixed vocabulary.
            viaCombo.Items.Add(new FacetItem(null, "Any via"));
            viaCombo.Items.Add(new FacetItem("typed", "typed"));
            viaCombo.Items.Add(new FacetItem("paste", "paste"));
            viaCombo.Items.Add(new FacetItem("copy", "copy"));
            viaCombo.Items.Add(new FacetItem("cut", "cut"));
            viaCombo.SelectedIndex = 0;
        }

        FlowLayoutPanel MakeRow() {
            FlowLayoutPanel f = new FlowLayoutPanel();
            f.Dock = DockStyle.Fill;
            f.FlowDirection = FlowDirection.LeftToRight;
            f.WrapContents = false;
            f.BackColor = ColPanel;
            f.Padding = new Padding(6, 2, 6, 2);
            f.Margin = new Padding(0);
            return f;
        }

        Label MakeTag(string text) {
            Label l = new Label();
            l.Text = text;
            l.AutoSize = true;
            l.ForeColor = ColDim;
            l.Margin = new Padding(8, 10, 2, 6);
            return l;
        }

        ComboBox MakeCombo(int width) {
            ComboBox c = new ComboBox();
            c.DropDownStyle = ComboBoxStyle.DropDownList;
            c.FlatStyle = FlatStyle.Flat;
            c.Width = width;
            c.Margin = new Padding(4, 6, 4, 6);
            c.BackColor = ColPanel;
            c.ForeColor = ColText;
            c.SelectedIndexChanged += delegate { OnFilterChanged(); };
            return c;
        }

        Button MakeToggle(string text, EventHandler onClick) {
            Button b = new Button();
            b.Text = text;
            b.AutoSize = false;
            b.Height = 26;
            b.Width = 100;
            b.Margin = new Padding(4, 6, 4, 6);
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = ColToggle;
            b.ForeColor = ColText;
            b.Click += onClick;
            return b;
        }

        Button MakeAction(string text, EventHandler onClick) {
            Button b = new Button();
            b.Text = text;
            b.AutoSize = false;
            b.Height = 26;
            b.Width = 90;
            b.Margin = new Padding(4, 5, 4, 5);
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = ColBtn;
            b.ForeColor = Color.White;
            b.Click += onClick;
            return b;
        }

        static void TryEnableDoubleBuffer(ListView lv) {
            try {
                typeof(ListView).InvokeMember("DoubleBuffered",
                    System.Reflection.BindingFlags.SetProperty |
                    System.Reflection.BindingFlags.Instance |
                    System.Reflection.BindingFlags.NonPublic,
                    null, lv, new object[] { true });
            } catch { }
        }

        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            if (!initialLoaded) {
                initialLoaded = true;
                try {
                    SendMessage(search.Handle, EM_SETCUEBANNER, (IntPtr)1, "Search captures…");
                } catch { }
                ReloadFacetsAndQuery();
            }
        }

        protected override void OnSizeChanged(EventArgs e) {
            base.OnSizeChanged(e);
            if (!splitInit && centerSplit != null && centerSplit.Height > 260) {
                try {
                    centerSplit.SplitterDistance = (int)(centerSplit.Height * 0.58);
                    splitInit = true;
                } catch { }
            }
        }

        // ===================================================================
        //  Facets + query
        // ===================================================================
        internal void ReloadFacetsAndQuery() {
            RefreshFacetCombos();
            RunQuery();
        }

        void RefreshFacetCombos() {
            Facets f = null;
            if (index != null) { try { f = index.GetFacets(); } catch { } }
            bool prev = suppressQuery;
            suppressQuery = true;
            try {
                FillFacetCombo(appCombo, "All apps", f == null ? null : f.Apps);
                FillFacetCombo(siteCombo, "All sites", f == null ? null : f.Sites);
                FillFacetCombo(dayCombo, "All days", f == null ? null : f.Days);
                aiBtn.Text = f == null ? "AI only" : "AI only (" + f.AiCount.ToString("N0") + ")";
                pinnedBtn.Text = f == null ? "Pinned only" : "Pinned only (" + f.PinnedCount.ToString("N0") + ")";
                trashBtn.Text = f == null ? "Trash" : "Trash (" + f.TrashCount.ToString("N0") + ")";
            } finally { suppressQuery = prev; }
        }

        void FillFacetCombo(ComboBox combo, string allLabel, List<Facet> facets) {
            string prevKey = SelectedFacetKey(combo);
            combo.BeginUpdate();
            combo.Items.Clear();
            combo.Items.Add(new FacetItem(null, allLabel));
            int select = 0;
            if (facets != null) {
                for (int i = 0; i < facets.Count; i++) {
                    Facet fc = facets[i];
                    if (fc == null) continue;
                    string disp = fc.Label + "  (" + fc.Count.ToString("N0") + ")";
                    combo.Items.Add(new FacetItem(fc.Key, disp));
                    if (prevKey != null && prevKey == fc.Key) select = combo.Items.Count - 1;
                }
            }
            combo.SelectedIndex = select;
            combo.EndUpdate();
        }

        static string SelectedFacetKey(ComboBox combo) {
            FacetItem it = combo.SelectedItem as FacetItem;
            return it == null ? null : it.Key;
        }

        CaptureQuery BuildQuery() {
            CaptureQuery q = new CaptureQuery();
            q.Text = NullIfEmpty(search.Text);
            q.App = SelectedFacetKey(appCombo);
            q.Host = SelectedFacetKey(siteCombo);
            q.DayKey = SelectedFacetKey(dayCombo);
            q.Via = SelectedFacetKey(viaCombo);
            q.AiOnly = aiOnly;
            q.PinnedOnly = pinnedOnly;
            q.Trash = trashMode;
            q.Sort = CurrentSort();
            q.Group = CurrentGroup();
            q.Offset = 0;
            q.Limit = PageLimit;
            return q;
        }

        SortMode CurrentSort() {
            switch (sortCombo.SelectedIndex) {
                case 1: return SortMode.Oldest;
                case 2: return SortMode.Relevance;
                default: return SortMode.Newest;
            }
        }

        GroupMode CurrentGroup() {
            switch (groupCombo.SelectedIndex) {
                case 1: return GroupMode.App;
                case 2: return GroupMode.Site;
                case 3: return GroupMode.Day;
                default: return GroupMode.None;
            }
        }

        void OnFilterChanged() {
            if (suppressQuery) return;
            RunQuery();
        }

        void RunQuery() {
            if (IsDisposed || index == null) return;

            bool building = false;
            try { building = index.IsBuilding; } catch { }
            if (building) {
                SwapRows(new Row[0]);
                countLabel.Text = "Building index…";
                return;
            }

            CaptureQuery q = BuildQuery();
            int gen = ++queryGen;
            countLabel.Text = "Searching…";

            ThreadPool.QueueUserWorkItem(delegate {
                QueryResult res = null;
                bool failed = false;
                try { res = index.Query(q); }
                catch { failed = true; }
                if (IsDisposed) return;
                try {
                    BeginInvoke((MethodInvoker)delegate {
                        if (gen != queryGen || IsDisposed) return; // stale result, drop it
                        if (res == null) {
                            SwapRows(new Row[0]);
                            countLabel.Text = failed ? "Query error" : "No results";
                            UpdateActionStates();
                            return;
                        }
                        Row[] arr = res.Rows == null ? new Row[0] : res.Rows.ToArray();
                        SwapRows(arr);
                        UpdateCountLabel(res);
                        UpdateActionStates();
                    });
                } catch { }
            });
        }

        // Swap the immutable snapshot atomically on the UI thread.
        void SwapRows(Row[] arr) {
            if (arr == null) arr = new Row[0];
            try { list.SelectedIndices.Clear(); } catch { }
            rows = arr;
            try { list.VirtualListSize = arr.Length; } catch { }
            list.Invalidate();
            detail.Text = "";
        }

        void UpdateCountLabel(QueryResult res) {
            int shown = 0;
            if (res.Rows != null) {
                for (int i = 0; i < res.Rows.Count; i++)
                    if (res.Rows[i] != null && !res.Rows[i].IsHeader) shown++;
            }
            string word = (res.Total == 1) ? " entry" : " entries";
            if (res.Truncated)
                countLabel.Text = "Showing " + shown.ToString("N0") + " of " + res.Total.ToString("N0") + word + " — refine to narrow";
            else
                countLabel.Text = res.Total.ToString("N0") + word;
        }

        // ===================================================================
        //  Virtual ListView rendering
        // ===================================================================
        void OnRetrieveVirtualItem(object sender, RetrieveVirtualItemEventArgs e) {
            Row[] snap = rows;
            if (snap == null || e.ItemIndex < 0 || e.ItemIndex >= snap.Length) {
                e.Item = new ListViewItem("");
                return;
            }
            e.Item = MakeItem(snap[e.ItemIndex]);
        }

        ListViewItem MakeItem(Row r) {
            if (r == null) return new ListViewItem("");
            ListViewItem it = new ListViewItem(CellText(r, 0));
            for (int col = 1; col < list.Columns.Count; col++) it.SubItems.Add(CellText(r, col));
            return it;
        }

        string CellText(Row r, int col) {
            if (r == null) return "";
            if (r.IsHeader) return col == 0 ? (r.HeaderLabel == null ? "" : r.HeaderLabel) : "";
            EntryMeta e = r.Entry;
            if (e == null) return "";
            switch (col) {
                case 0: {
                    string t = e.When.ToString("yyyy-MM-dd HH:mm:ss");
                    if (r.State != null && r.State.Pinned) t = PinGlyph + " " + t;
                    return t;
                }
                case 1: return e.App == null ? "" : e.App;
                case 2: {
                    string site = e.Host == null ? "" : e.Host;
                    if (!string.IsNullOrEmpty(e.PathTail)) site += e.PathTail;
                    return site;
                }
                case 3: return e.Via == null ? "" : e.Via;
                case 4: return e.IsAi ? (string.IsNullOrEmpty(e.AiLabel) ? "AI" : e.AiLabel) : "";
                case 5: return e.Preview == null ? "" : e.Preview;
            }
            return "";
        }

        void OnDrawColumnHeader(object sender, DrawListViewColumnHeaderEventArgs e) {
            e.Graphics.FillRectangle(brushHeader, e.Bounds);
            TextRenderer.DrawText(e.Graphics, e.Header.Text, headerFont, e.Bounds,
                Color.FromArgb(170, 182, 198),
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter |
                TextFormatFlags.LeftAndRightPadding | TextFormatFlags.NoPrefix);
            using (Pen p = new Pen(Color.FromArgb(50, 54, 62)))
                e.Graphics.DrawLine(p, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
        }

        void OnDrawItem(object sender, DrawListViewItemEventArgs e) {
            Row[] snap = rows;
            Row r = (snap != null && e.ItemIndex >= 0 && e.ItemIndex < snap.Length) ? snap[e.ItemIndex] : null;
            if (r != null && r.IsHeader) {
                e.Graphics.FillRectangle(brushGroup, e.Bounds);
                Rectangle hr = e.Bounds; hr.X += 10; hr.Width -= 10;
                string label = (r.HeaderLabel == null ? "(none)" : r.HeaderLabel) + "    " + r.HeaderCount.ToString("N0");
                TextRenderer.DrawText(e.Graphics, label, groupFont, hr, Color.FromArgb(150, 190, 235),
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter |
                    TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
                e.DrawDefault = false;
                return;
            }
            bool selected = IsRowSelected(e.ItemIndex);
            e.Graphics.FillRectangle(selected ? brushSel : brushList, e.Bounds);
        }

        void OnDrawSubItem(object sender, DrawListViewSubItemEventArgs e) {
            Row[] snap = rows;
            if (snap == null || e.ItemIndex < 0 || e.ItemIndex >= snap.Length) return;
            Row r = snap[e.ItemIndex];
            if (r == null || r.IsHeader) return; // header already drawn full-width in OnDrawItem

            Rectangle cell = e.Bounds;
            if (e.ColumnIndex == 0) cell.Width = list.Columns[0].Width; // first subitem reports whole-row bounds

            bool selected = IsRowSelected(e.ItemIndex);
            Color fore;
            if (selected) fore = Color.White;
            else if (e.ColumnIndex == 4) fore = Color.FromArgb(150, 200, 150);
            else if (e.ColumnIndex == 5) fore = Color.FromArgb(185, 195, 208);
            else fore = ColText;

            string text = CellText(r, e.ColumnIndex);
            if (string.IsNullOrEmpty(text)) return;
            TextRenderer.DrawText(e.Graphics, text, cellFont, cell, fore,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
                TextFormatFlags.LeftAndRightPadding | TextFormatFlags.NoPrefix);
        }

        bool IsRowSelected(int index) {
            ListView.SelectedIndexCollection sel = list.SelectedIndices;
            for (int i = 0; i < sel.Count; i++) if (sel[i] == index) return true;
            return false;
        }

        // ===================================================================
        //  Selection + detail pane
        // ===================================================================
        Row SelectedRow() {
            Row[] snap = rows;
            if (snap == null) return null;
            ListView.SelectedIndexCollection sel = list.SelectedIndices;
            if (sel.Count == 0) return null;
            int idx = sel[0];
            if (idx < 0 || idx >= snap.Length) return null;
            Row r = snap[idx];
            if (r == null || r.IsHeader) return null;
            return r;
        }

        EntryMeta SelectedEntry() { Row r = SelectedRow(); return r == null ? null : r.Entry; }
        EntryState SelectedState() { Row r = SelectedRow(); return r == null ? null : r.State; }

        void OnSelectionChanged() {
            UpdateActionStates();
            LoadDetail();
        }

        void LoadDetail() {
            EntryMeta entry = SelectedEntry();
            if (entry == null || index == null) { detail.Text = ""; return; }
            int gen = ++detailGen;
            EntryMeta captured = entry;
            detail.Text = "Loading…";
            ThreadPool.QueueUserWorkItem(delegate {
                string body = null;
                try { body = index.GetBody(captured); } catch { }
                if (IsDisposed) return;
                string shown = body == null ? "" : body.Replace("\r\n", "\n").Replace("\n", "\r\n");
                try {
                    BeginInvoke((MethodInvoker)delegate {
                        if (gen != detailGen || IsDisposed) return; // a newer selection won
                        detail.Text = shown;
                        detail.SelectionStart = 0;
                        detail.SelectionLength = 0;
                    });
                } catch { }
            });
        }

        void UpdateActionStates() {
            EntryMeta e = SelectedEntry();
            EntryState st = SelectedState();
            bool has = e != null;

            copyBtn.Enabled = has;
            openBtn.Enabled = has;

            pinBtn.Visible = !trashMode;
            deleteBtn.Visible = !trashMode;
            restoreBtn.Visible = trashMode;
            purgeBtn.Visible = trashMode;

            pinBtn.Enabled = has;
            pinBtn.Text = (st != null && st.Pinned) ? "Unpin" : "Pin";
            deleteBtn.Enabled = has;
            restoreBtn.Enabled = has;
            purgeBtn.Enabled = has;
        }

        // ===================================================================
        //  Context menu
        // ===================================================================
        void OnListMouseDown(object sender, MouseEventArgs e) {
            if (e.Button != MouseButtons.Right) return;
            ListViewItem hit = null;
            try { hit = list.GetItemAt(e.X, e.Y); } catch { }
            if (hit == null) return;
            try {
                list.SelectedIndices.Clear();
                list.SelectedIndices.Add(hit.Index);
            } catch { }
        }

        void OnMenuOpening(object sender, System.ComponentModel.CancelEventArgs e) {
            EntryMeta entry = SelectedEntry();
            EntryState st = SelectedState();
            bool has = entry != null;
            menuCopy.Enabled = has;
            menuOpen.Enabled = has;
            menuPin.Visible = !trashMode;
            menuDelete.Visible = !trashMode;
            menuRestore.Visible = trashMode;
            menuPurge.Visible = trashMode;
            menuPin.Enabled = has;
            menuPin.Text = (st != null && st.Pinned) ? "Unpin" : "Pin";
            menuDelete.Enabled = has;
            menuRestore.Enabled = has;
            menuPurge.Enabled = has;
        }

        // ===================================================================
        //  Actions
        // ===================================================================
        void OnCopy(object sender, EventArgs e) { DoCopy(); }
        void OnOpen(object sender, EventArgs e) { DoOpen(); }
        void OnPin(object sender, EventArgs e) { DoPin(); }
        void OnDelete(object sender, EventArgs e) { DoDelete(); }
        void OnRestore(object sender, EventArgs e) { DoRestore(); }
        void OnPurge(object sender, EventArgs e) { DoPurge(); }
        void OnUndo(object sender, EventArgs e) { DoUndo(); }
        void OnRebuild(object sender, EventArgs e) { DoRebuild(); }

        void DoCopy() {
            EntryMeta e = SelectedEntry();
            if (e == null || index == null) return;
            string body = null;
            try { body = index.GetBody(e); } catch { }
            if (string.IsNullOrEmpty(body)) return;
            try { Clipboard.SetText(body); } catch { } // STA UI thread
        }

        void DoOpen() {
            EntryMeta e = SelectedEntry();
            if (e == null) return;
            string path = System.IO.Path.Combine(MarkdownStore.CaptureDir, e.DayKey + ".md");
            bool opened = false;
            try { Process.Start(path); opened = true; }
            catch {
                try { Process.Start("notepad.exe", "\"" + path + "\""); opened = true; } catch { }
            }
            if (opened && index != null) { try { index.RecordOpen(e.EntryId); } catch { } }
        }

        void DoPin() {
            EntryMeta e = SelectedEntry();
            EntryState st = SelectedState();
            if (e == null || index == null) return;
            bool pinned = st != null && st.Pinned;
            try { index.SetPinned(e.EntryId, !pinned); } catch { }
            // IndexChanged re-runs the query and refreshes the pin glyph/counts.
        }

        void DoDelete() {
            EntryMeta e = SelectedEntry();
            if (e == null || index == null) return;
            try { index.SoftDelete(e.EntryId); } catch { return; }
            PushUndo(e.EntryId);
            ShowUndoStrip();
        }

        void DoRestore() {
            EntryMeta e = SelectedEntry();
            if (e == null || index == null) return;
            try { index.Restore(e.EntryId); } catch { }
        }

        void DoPurge() {
            EntryMeta e = SelectedEntry();
            if (e == null || index == null) return;
            DialogResult r = MessageBox.Show(
                "Remove this entry from the library permanently?\n\nThe original text stays in the daily Markdown file on disk; only the library listing is hidden.",
                "Delete permanently", MessageBoxButtons.OKCancel, MessageBoxIcon.Warning);
            if (r != DialogResult.OK) return;
            try { index.Purge(e.EntryId); } catch { }
        }

        void DoRebuild() {
            if (index == null) return;
            try { index.BeginBuild(); } catch { }
            RunQuery(); // shows "Building index..." while IsBuilding
        }

        // -- bounded undo stack (most-recent at the end) ------------------------
        void PushUndo(string id) {
            if (id == null) return;
            undo.Add(id);
            if (undo.Count > 50) undo.RemoveAt(0);
        }

        string PopUndo() {
            if (undo.Count == 0) return null;
            int i = undo.Count - 1;
            string id = undo[i];
            undo.RemoveAt(i);
            return id;
        }

        void DoUndo() {
            string id = PopUndo();
            HideUndoStrip();
            if (id == null || index == null) return;
            try { index.Restore(id); } catch { }
        }

        void ShowUndoStrip() {
            undoLabel.Text = "Entry moved to Trash — you can undo.";
            undoStrip.Visible = true;
            undoStrip.BringToFront();
            undoTimer.Stop();
            undoTimer.Start();
        }

        void HideUndoStrip() {
            undoTimer.Stop();
            undoStrip.Visible = false;
        }

        // ===================================================================
        //  Toggles
        // ===================================================================
        void OnToggleAi(object sender, EventArgs e) {
            aiOnly = !aiOnly;
            StyleToggle(aiBtn, aiOnly);
            RunQuery();
        }

        void OnTogglePinned(object sender, EventArgs e) {
            pinnedOnly = !pinnedOnly;
            StyleToggle(pinnedBtn, pinnedOnly);
            RunQuery();
        }

        void OnToggleTrash(object sender, EventArgs e) {
            trashMode = !trashMode;
            StyleToggle(trashBtn, trashMode);
            UpdateActionStates();
            RunQuery();
        }

        static void StyleToggle(Button b, bool on) {
            b.BackColor = on ? ColAccent : ColToggle;
            b.ForeColor = on ? Color.White : ColText;
        }

        // ===================================================================
        //  Index change notification
        // ===================================================================
        void OnIndexChanged(object sender, EventArgs e) {
            if (IsDisposed) return;
            try {
                BeginInvoke((MethodInvoker)delegate {
                    if (IsDisposed) return;
                    ReloadFacetsAndQuery();
                });
            } catch { }
        }

        // ===================================================================
        //  Disposal
        // ===================================================================
        protected override void Dispose(bool disposing) {
            if (disposing) {
                try { if (index != null) index.IndexChanged -= OnIndexChanged; } catch { }
                try { if (searchTimer != null) { searchTimer.Stop(); searchTimer.Dispose(); } } catch { }
                try { if (undoTimer != null) { undoTimer.Stop(); undoTimer.Dispose(); } } catch { }
                try { if (menu != null) menu.Dispose(); } catch { }
                DisposeResource(brushList); DisposeResource(brushSel);
                DisposeResource(brushGroup); DisposeResource(brushHeader);
                DisposeResource(cellFont); DisposeResource(groupFont);
                DisposeResource(headerFont); DisposeResource(detailFont);
            }
            base.Dispose(disposing);
        }

        static void DisposeResource(IDisposable d) {
            if (d != null) { try { d.Dispose(); } catch { } }
        }

        // -- helpers ------------------------------------------------------------
        static string NullIfEmpty(string s) {
            if (s == null) return null;
            string t = s.Trim();
            return t.Length == 0 ? null : t;
        }

        // Combo item carrying a stable facet key plus its display text.
        private sealed class FacetItem {
            public string Key;
            public string Text;
            public FacetItem(string key, string text) { Key = key; Text = text; }
            public override string ToString() { return Text; }
        }
    }
}
