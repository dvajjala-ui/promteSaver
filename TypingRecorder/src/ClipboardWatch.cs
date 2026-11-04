// Verified clipboard-change detection. A message-only window (HWND_MESSAGE
// parent) registers AddClipboardFormatListener and raises a callback on the UI
// thread every time the OS clipboard actually changes (WM_CLIPBOARDUPDATE).
//
// This type reads NO clipboard content. Clipboard.GetText() must stay on the STA
// UI thread in MainForm, which correlates a pending Ctrl+C / Ctrl+X with the next
// verified change before recording the copied / cut text. The point of this class
// is to make that correlation trustworthy:
//   * copy/cut is recorded only when the clipboard genuinely advanced, so a
//     Ctrl+C with nothing selected (no clipboard write, no update) records
//     nothing and leaves no phantom copy;
//   * SequenceNumber exposes GetClipboardSequenceNumber() so the host can take a
//     synchronous baseline the instant the keyboard hook observes Ctrl+C/X --
//     before the app writes the clipboard -- guaranteeing baseline < post-copy
//     sequence, so the host never waits on an update that already happened.
//
// .NET Framework 4.7.2 / C# 5. All P/Invoke is guarded. The listener window is
// created and destroyed on the UI thread that owns the message pump; WndProc and
// the raised callback therefore run on that same thread. No locking is needed.
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace TypingRecorder {

    /// <summary>
    /// UI-thread clipboard-change notifier built on a message-only listener window.
    /// It performs no clipboard reads; it only reports that a change happened and
    /// exposes the current clipboard sequence number for the host's copy/cut
    /// correlation. All methods must be called on the UI/message-pump thread.
    /// </summary>
    internal sealed class ClipboardWatch : IDisposable {

        // Posted to a clipboard format listener window after every clipboard write.
        const int WM_CLIPBOARDUPDATE = 0x031D;

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool AddClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll")]
        static extern uint GetClipboardSequenceNumber();

        readonly Action onClipboardChanged;
        readonly Listener window;
        bool enabled;
        bool disposed;

        internal ClipboardWatch(Action onClipboardChanged) {
            if (onClipboardChanged == null) throw new ArgumentNullException("onClipboardChanged");
            this.onClipboardChanged = onClipboardChanged;
            window = new Listener(OnClipboardUpdate);
        }

        /// <summary>
        /// Current OS clipboard sequence number (it advances on every clipboard
        /// write). Read it synchronously the instant a Ctrl+C / Ctrl+X is observed
        /// to capture a baseline guaranteed to be below the post-copy value, then
        /// confirm the next onClipboardChanged reports a higher value before reading
        /// the clipboard. Returns 0 when the sequence number is unavailable (for
        /// example when the process lacks clipboard-read access); a genuine change
        /// still surfaces through onClipboardChanged. Does not require the listener
        /// window, so it is valid before Start and after Stop.
        /// </summary>
        internal long SequenceNumber {
            get {
                try { return GetClipboardSequenceNumber(); }
                catch { return 0; }
            }
        }

        /// <summary>Create the listener window if needed and begin receiving updates. UI thread only.</summary>
        internal void Start() {
            if (disposed) throw new ObjectDisposedException("ClipboardWatch");
            if (enabled) return;
            IntPtr hwnd = window.EnsureHandle();
            if (hwnd == IntPtr.Zero) return; // no handle -> nothing to listen with; the host degrades gracefully
            try {
                if (AddClipboardFormatListener(hwnd)) enabled = true;
            } catch {
                enabled = false;
            }
        }

        /// <summary>Stop receiving updates and tear the listener window down. UI thread only.</summary>
        internal void Stop() {
            bool wasEnabled = enabled;
            enabled = false; // seen by any WM_CLIPBOARDUPDATE still draining below
            IntPtr hwnd = window.Handle;
            if (hwnd != IntPtr.Zero) {
                if (wasEnabled) { try { RemoveClipboardFormatListener(hwnd); } catch { } }
                window.DestroyHandleSafely();
            }
        }

        // Raised by the listener window's WndProc, already on the UI thread.
        void OnClipboardUpdate() {
            if (disposed || !enabled) return;
            try { onClipboardChanged(); }
            catch { /* a host callback must never take down the message pump */ }
        }

        public void Dispose() {
            if (disposed) return;
            disposed = true;
            Stop();
        }

        /// <summary>
        /// Message-only window whose sole job is to receive WM_CLIPBOARDUPDATE. A
        /// NativeWindow subclass so its WndProc runs on the thread that created the
        /// handle (the UI/message-pump thread). Private to ClipboardWatch.
        /// </summary>
        sealed class Listener : NativeWindow {
            static readonly IntPtr HwndMessage = new IntPtr(-3); // HWND_MESSAGE: message-only parent
            readonly Action onUpdate;

            internal Listener(Action onUpdate) {
                this.onUpdate = onUpdate;
            }

            // Create the handle on the current (UI) thread if it does not yet exist.
            internal IntPtr EnsureHandle() {
                if (Handle == IntPtr.Zero) {
                    CreateParams cp = new CreateParams();
                    cp.Caption = "TypingRecorderClipboardWatch";
                    cp.Parent = HwndMessage; // message-only: invisible, no taskbar, no broadcast traffic
                    try { CreateHandle(cp); }
                    catch { /* leave Handle == Zero; Start() degrades gracefully */ }
                }
                return Handle;
            }

            internal void DestroyHandleSafely() {
                try { if (Handle != IntPtr.Zero) DestroyHandle(); }
                catch { }
            }

            protected override void WndProc(ref Message m) {
                if (m.Msg == WM_CLIPBOARDUPDATE && onUpdate != null) {
                    try { onUpdate(); } catch { }
                }
                base.WndProc(ref m);
            }
        }
    }
}
