// TrayController - owns the system-tray NotifyIcon and its context menu so the app
// has an always-visible recording indicator and quick Record/Stop, independent of
// whether the main window is shown.
//
// State icon (P4 adversarial-review correction #2): the red/grey dot is the
// AUTHORITATIVE recording indicator and is redrawn by SetRecording. We deliberately
// do NOT use Icon.ExtractAssociatedIcon for the tray, because it virtually never
// returns null, which would pin a static exe icon and the red/grey guardrail would
// never change while the window is minimized. The exe/app.ico is only for the
// window's shortcut / Alt-Tab / taskbar (set on the Form, not here). The tooltip
// text is the state backstop.
//
// Tooltip (P4 correction #5): the composed NotifyIcon.Text is truncated to <=63
// chars; .NET Framework throws ArgumentException above that. SetContext is driven
// from the host's 500ms status timer so the tooltip tracks the live app/site while
// minimized.
//
// Threading: all public methods are called on the UI/message-pump thread (menu and
// tray callbacks already fire there; SetContext comes from a WinForms Timer). No
// cross-thread marshaling is required or performed. C#5 only; .NET Framework 4.7.2.
using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace TypingRecorder {

    internal sealed class TrayController {

        // Release the GDI icon handle created by Bitmap.GetHicon(); Icon.FromHandle
        // wraps a handle it does not own, so we must destroy each HICON ourselves to
        // avoid a GDI handle leak on every state swap.
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool DestroyIcon(IntPtr hIcon);

        readonly NotifyIcon notifyIcon;
        readonly ContextMenuStrip menu;
        readonly ToolStripMenuItem recordItem;   // label swapped Record <-> Stop
        readonly ToolStripMenuItem startupItem;   // Checked reflects live startup state
        readonly Func<bool> isStartupEnabled;

        Font defaultItemFont;          // bold font for the default 'Open' item
        Icon currentIcon;              // the drawn dot currently shown in the tray
        IntPtr currentHicon;           // HICON backing currentIcon (DestroyIcon on swap)

        bool recording;
        string context;
        bool balloonShown;
        bool disposed;

        internal TrayController(Action onOpen, Action onToggleRecord, Action onExclusions,
                                Action onToggleStartup, Func<bool> isStartupEnabled, Action onQuit) {
            this.isStartupEnabled = isStartupEnabled;
            recording = false;
            context = null;
            currentIcon = null;
            currentHicon = IntPtr.Zero;

            // 'Open TypingRecorder' - the default item (shown bold; also invoked on
            // NotifyIcon double-click).
            ToolStripMenuItem openItem = new ToolStripMenuItem("Open TypingRecorder");
            try {
                defaultItemFont = new Font(openItem.Font, FontStyle.Bold);
                openItem.Font = defaultItemFont;
            } catch { defaultItemFont = null; }
            if (onOpen != null) openItem.Click += delegate { onOpen(); };

            recordItem = new ToolStripMenuItem("Record");
            if (onToggleRecord != null) recordItem.Click += delegate { onToggleRecord(); };

            ToolStripMenuItem exclusionsItem = new ToolStripMenuItem("Exclusions...");
            if (onExclusions != null) exclusionsItem.Click += delegate { onExclusions(); };

            // Checkable 'Start with Windows'. CheckOnClick stays off: the host owns the
            // real registry state; the click fires onToggleStartup and the next menu
            // open re-reads isStartupEnabled() to show the resulting checkmark.
            startupItem = new ToolStripMenuItem("Start with Windows");
            startupItem.CheckOnClick = false;
            if (onToggleStartup != null) startupItem.Click += delegate { onToggleStartup(); };

            ToolStripMenuItem quitItem = new ToolStripMenuItem("Quit");
            if (onQuit != null) quitItem.Click += delegate { onQuit(); };

            menu = new ContextMenuStrip();
            menu.Items.Add(openItem);
            menu.Items.Add(recordItem);
            menu.Items.Add(exclusionsItem);
            menu.Items.Add(startupItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(quitItem);

            // Reflect the live 'Start with Windows' state each time the menu opens.
            menu.Opening += delegate(object sender, CancelEventArgs e) {
                bool on = false;
                Func<bool> probe = this.isStartupEnabled;
                if (probe != null) {
                    try { on = probe(); } catch { on = false; }
                }
                startupItem.Checked = on;
            };

            notifyIcon = new NotifyIcon();
            notifyIcon.ContextMenuStrip = menu;
            if (onOpen != null) notifyIcon.DoubleClick += delegate { onOpen(); };

            // Authoritative state icon + tooltip, then show the tray.
            ApplyStateIcon();
            ApplyTooltip();
            notifyIcon.Visible = true;
        }

        // Swap icon (if the state changed), menu label and tooltip. Called on the UI
        // thread by the host whenever recording starts or stops.
        internal void SetRecording(bool recording) {
            if (disposed) return;
            bool changed = this.recording != recording;
            this.recording = recording;
            recordItem.Text = recording ? "Stop" : "Record";
            if (changed) ApplyStateIcon();
            ApplyTooltip();
        }

        // Update the short current app/site shown in the tooltip. Driven from the
        // host's 500ms status timer so the tooltip tracks the live context.
        internal void SetContext(string appOrSite) {
            if (disposed) return;
            context = appOrSite;
            ApplyTooltip();
        }

        // Show the "still running in the tray" balloon exactly once.
        internal void ShowFirstMinimizeHint() {
            if (disposed) return;
            if (balloonShown) return;
            balloonShown = true;
            try {
                notifyIcon.ShowBalloonTip(5000, "TypingRecorder",
                    "TypingRecorder is still running in the system tray. The tray icon shows whether recording is on. Double-click it to reopen the window.",
                    ToolTipIcon.Info);
            } catch { }
        }

        internal void Dispose() {
            if (disposed) return;
            disposed = true;
            try { notifyIcon.Visible = false; } catch { }
            try { notifyIcon.Dispose(); } catch { }
            try { menu.Dispose(); } catch { }
            if (currentIcon != null) { try { currentIcon.Dispose(); } catch { } currentIcon = null; }
            if (currentHicon != IntPtr.Zero) { try { DestroyIcon(currentHicon); } catch { } currentHicon = IntPtr.Zero; }
            if (defaultItemFont != null) { try { defaultItemFont.Dispose(); } catch { } defaultItemFont = null; }
        }

        // -- internals ---------------------------------------------------------

        // Build the new dot, assign it to the tray, then release the previous icon and
        // its HICON. New is assigned before old is destroyed so the tray never points
        // at a freed handle.
        void ApplyStateIcon() {
            IntPtr newHicon;
            Icon newIcon;
            try {
                newIcon = BuildDotIcon(recording, out newHicon);
            } catch {
                // If drawing fails, keep whatever icon is already shown.
                return;
            }

            Icon oldIcon = currentIcon;
            IntPtr oldHicon = currentHicon;

            currentIcon = newIcon;
            currentHicon = newHicon;
            try { notifyIcon.Icon = newIcon; } catch { }

            if (oldIcon != null) { try { oldIcon.Dispose(); } catch { } }
            if (oldHicon != IntPtr.Zero) { try { DestroyIcon(oldHicon); } catch { } }
        }

        // Draw a filled dot: red while recording, grey while idle. The returned Icon
        // wraps hicon (via Icon.FromHandle) and does NOT own it; the caller tracks and
        // destroys hicon.
        static Icon BuildDotIcon(bool isRecording, out IntPtr hicon) {
            const int size = 16;
            hicon = IntPtr.Zero;
            using (Bitmap bmp = new Bitmap(size, size)) {
                using (Graphics g = Graphics.FromImage(bmp)) {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    Color fill = isRecording ? Color.FromArgb(230, 70, 70) : Color.FromArgb(120, 130, 145);
                    Color edge = isRecording ? Color.FromArgb(150, 30, 30) : Color.FromArgb(70, 78, 90);
                    using (SolidBrush brush = new SolidBrush(fill))
                        g.FillEllipse(brush, 2, 2, size - 5, size - 5);
                    using (Pen pen = new Pen(edge))
                        g.DrawEllipse(pen, 2, 2, size - 5, size - 5);
                }
                hicon = bmp.GetHicon();
            }
            return Icon.FromHandle(hicon);
        }

        // Compose 'TypingRecorder - Recording/idle' plus the short current app/site,
        // truncated to <=63 chars (NotifyIcon.Text throws above that on .NET Framework).
        void ApplyTooltip() {
            string stateText = recording ? "TypingRecorder - Recording" : "TypingRecorder - idle";
            string composed = stateText;
            if (!string.IsNullOrEmpty(context)) composed = stateText + " - " + context;
            if (composed.Length > 63) composed = composed.Substring(0, 63);
            try { notifyIcon.Text = composed; } catch { }
        }
    }
}
