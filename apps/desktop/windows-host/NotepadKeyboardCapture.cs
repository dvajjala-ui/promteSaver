// First native keyboard-triggered source. A low-level key event only schedules
// an accessibility snapshot for an explicitly approved Notepad editor. No key
// values, keyboard stream, clipboard, other processes or browser text are read.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Automation;
using System.Windows.Forms;

namespace PromteSaver.WindowsPreview {
    internal sealed class NotepadKeyboardCapture : IDisposable {
        const int KeyboardHook = 13, KeyDown = 0x0100, SystemKeyDown = 0x0104;
        delegate IntPtr HookProcedure(int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int hook, HookProcedure procedure, IntPtr module, uint thread);
        [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string module);

        readonly HookProcedure procedure;
        readonly Timer settle = new Timer { Interval = 1300 };
        readonly Func<string, Task> onSnapshot;
        readonly Action<string> onGap;
        IntPtr hook, pendingWindow;
        bool enabled, busy, retryAfterBusy;

        internal NotepadKeyboardCapture(Func<string, Task> onSnapshot, Action<string> onGap) {
            this.onSnapshot = onSnapshot; this.onGap = onGap;
            procedure = KeyEvent;
            settle.Tick += async delegate {
                settle.Stop();
                if (!enabled) return;
                if (busy) { retryAfterBusy = true; return; }
                busy = true;
                try {
                    string text, gap;
                    if (!TryReadApprovedEditor(pendingWindow, out text, out gap)) {
                        if (enabled && gap != null) onGap(gap);
                        return;
                    }
                    await onSnapshot(text);
                } catch { if (enabled) onGap("SAVE_FAILED"); }
                finally {
                    busy = false;
                    if (retryAfterBusy && enabled && pendingWindow != IntPtr.Zero) {
                        retryAfterBusy = false;
                        settle.Start();
                    }
                }
            };
        }
        internal bool Enabled { get { return enabled; } }
        internal void Start() {
            if (enabled) return;
            hook = SetWindowsHookEx(KeyboardHook, procedure, GetModuleHandle(null), 0);
            if (hook == IntPtr.Zero) throw new InvalidOperationException("Windows keyboard event access is unavailable.");
            enabled = true;
        }
        internal void Stop() {
            enabled = false; retryAfterBusy = false; settle.Stop(); pendingWindow = IntPtr.Zero;
            var old = hook; hook = IntPtr.Zero;
            if (old != IntPtr.Zero) UnhookWindowsHookEx(old);
        }
        IntPtr KeyEvent(int code, IntPtr message, IntPtr data) {
            if (enabled && code >= 0 && (message.ToInt64() == KeyDown || message.ToInt64() == SystemKeyDown)) {
                var window = GetForegroundWindow();
                if (IsNotepad(window)) { pendingWindow = window; settle.Stop(); settle.Start(); }
                else { pendingWindow = IntPtr.Zero; settle.Stop(); }
            }
            return CallNextHookEx(hook, code, message, data);
        }
        static bool IsNotepad(IntPtr window) {
            if (window == IntPtr.Zero) return false;
            uint processId; GetWindowThreadProcessId(window, out processId);
            if (processId == 0) return false;
            try { return String.Equals(Process.GetProcessById((int)processId).ProcessName, "Notepad", StringComparison.OrdinalIgnoreCase); }
            catch { return false; }
        }
        static bool InsideWindow(AutomationElement element, AutomationElement window) {
            var cursor = element;
            for (int depth = 0; depth < 40 && cursor != null; depth++) {
                if (Automation.Compare(cursor, window)) return true;
                cursor = TreeWalker.ControlViewWalker.GetParent(cursor);
            }
            return false;
        }
        static bool TryReadApprovedEditor(IntPtr originalWindow, out string text, out string gap) {
            text = null; gap = null;
            if (originalWindow == IntPtr.Zero || GetForegroundWindow() != originalWindow || !IsNotepad(originalWindow)) return false;
            try {
                var window = AutomationElement.FromHandle(originalWindow);
                var focused = AutomationElement.FocusedElement;
                if (window == null || focused == null || !InsideWindow(focused, window)) return false;
                var current = focused.Current;
                // Windows 11 Notepad's actual editing surface was observed as a
                // Document named "Text editor". Search and settings fields are
                // excluded before requesting any text.
                if (current.IsPassword || !current.IsEnabled || current.IsOffscreen ||
                    current.ControlType != ControlType.Document ||
                    !String.Equals(current.Name, "Text editor", StringComparison.Ordinal)) return false;
                object pattern;
                // TextPattern permits a bounded read; ValuePattern has no bounded
                // getter and is therefore excluded from this first source.
                if (!focused.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
                    gap = "EDITOR_UNSUPPORTED"; return false;
                }
                text = ((TextPattern)pattern).DocumentRange.GetText(50001);
                if (text != null && text.Length <= 50000 && text.Trim().Length > 0) return true;
                if (text != null && text.Length > 50000) gap = "SOURCE_LIMIT";
                text = null; return false;
            } catch { text = null; gap = "SOURCE_UNAVAILABLE"; return false; }
        }
        public void Dispose() { Stop(); settle.Dispose(); }
    }
}
