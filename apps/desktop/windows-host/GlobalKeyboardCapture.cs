// Global low-level keyboard hook that reconstructs typed text per foreground window.
// Compatible with .NET Framework 4.7.2 / C# 5 (csc.exe from Framework v4.0.30319).
// Requires no elevated permissions or UIAccess — WH_KEYBOARD_LL runs at normal user level.
// Does NOT read key values for blocked processes (browsers, credential tools, password managers).
// Emits text chunks on Enter/Return or after a configurable idle period.
// All methods run on the UI/message-pump thread; no cross-thread mutation of buffers.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace PromteSaver.WindowsPreview {

    /// <summary>One reconstructed block of typed text from a single app window.</summary>
    internal sealed class KeystrokeChunk {
        internal readonly string Source;       // e.g. "notepad.exe"
        internal readonly string Text;         // reconstructed printable text
        internal readonly bool IsEnterFlush;   // true = emitted because Enter was pressed
        internal KeystrokeChunk(string source, string text, bool isEnterFlush) {
            Source = source; Text = text; IsEnterFlush = isEnterFlush;
        }
    }

    /// <summary>
    /// System-wide keystroke capture using WH_KEYBOARD_LL.
    /// Reconstructs printable text per foreground process and emits chunks.
    /// All methods must be called on the UI thread that owns the message pump.
    /// </summary>
    internal sealed class GlobalKeyboardCapture : IDisposable {

        // ── Win32 imports ────────────────────────────────────────────────────
        const int WH_KEYBOARD_LL = 13;
        const int WM_KEYDOWN     = 0x0100;
        const int WM_SYSKEYDOWN  = 0x0104;

        [StructLayout(LayoutKind.Sequential)]
        struct KBDLLHOOKSTRUCT {
            public uint   vkCode;
            public uint   scanCode;
            public uint   flags;
            public uint   time;
            public IntPtr dwExtraInfo;
        }

        delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll")]
        static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        static extern short GetKeyState(int nVirtKey);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
        static extern IntPtr GetModuleHandle(string lpModuleName);

        // Virtual-key codes we care about
        const int VK_BACK      = 0x08;
        const int VK_TAB       = 0x09;
        const int VK_RETURN    = 0x0D;
        const int VK_SHIFT     = 0x10;
        const int VK_CAPITAL   = 0x14;
        const int VK_ESCAPE    = 0x1B;
        const int VK_SPACE     = 0x20;
        const int VK_DELETE    = 0x2E;
        const int VK_LSHIFT    = 0xA0;
        const int VK_RSHIFT    = 0xA1;

        // ── Blocked processes ─────────────────────────────────────────────────
        // Mirrors FocusedFieldCapture.blockedProcesses — keep in sync.
        static readonly HashSet<string> BlockedProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            // Browsers — cannot distinguish private window/site at native layer
            "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "chromium", "iexplore",
            "tor", "waterfox", "floorp", "zen", "safari", "arc", "browser", "webview2", "msedgewebview2",
            // OS auth, credential, and system processes
            "credentialuibroker", "credentialui", "logonui", "consent", "lsass", "securityhealthsystray",
            "applicationframehost", "svchost", "systemsettings", "textinputhost", "explorer",
            "codex-computer-use", "taskmgr", "regedit",
            // Password managers
            "1password", "bitwarden", "keepass", "keepassxc", "lastpass", "dashlane",
            "nordpass", "protonpass", "enpass", "roboform"
        };

        // ── VK → char tables ─────────────────────────────────────────────────
        // Printable characters for unshifted and shifted VK codes.
        // Covers standard US QWERTY; non-Latin input goes through IME and won't
        // map here (those users will still get UIA field snapshots as backup).
        static readonly Dictionary<uint, char> UnshiftedMap = BuildUnshifted();
        static readonly Dictionary<uint, char> ShiftedMap   = BuildShifted();

        static Dictionary<uint, char> BuildUnshifted() {
            var m = new Dictionary<uint, char>();
            // A-Z (unshifted = lowercase)
            for (uint k = 0x41; k <= 0x5A; k++) m[k] = (char)('a' + (k - 0x41));
            // 0-9
            for (uint k = 0x30; k <= 0x39; k++) m[k] = (char)('0' + (k - 0x30));
            // Numpad 0-9
            for (uint k = 0x60; k <= 0x69; k++) m[k] = (char)('0' + (k - 0x60));
            // Punctuation and symbols (unshifted)
            m[0xBD] = '-'; m[0xBB] = '='; m[0xDB] = '['; m[0xDD] = ']';
            m[0xDC] = '\\'; m[0xBA] = ';'; m[0xDE] = '\''; m[0xBC] = ',';
            m[0xBE] = '.'; m[0xBF] = '/'; m[0xC0] = '`';
            m[VK_SPACE] = ' ';
            // Numpad operators
            m[0x6A] = '*'; m[0x6B] = '+'; m[0x6D] = '-'; m[0x6E] = '.'; m[0x6F] = '/';
            return m;
        }

        static Dictionary<uint, char> BuildShifted() {
            var m = new Dictionary<uint, char>();
            // A-Z (shifted = uppercase)
            for (uint k = 0x41; k <= 0x5A; k++) m[k] = (char)('A' + (k - 0x41));
            // 0-9 shifted symbols
            m[0x30] = ')'; m[0x31] = '!'; m[0x32] = '@'; m[0x33] = '#'; m[0x34] = '$';
            m[0x35] = '%'; m[0x36] = '^'; m[0x37] = '&'; m[0x38] = '*'; m[0x39] = '(';
            // Punctuation shifted
            m[0xBD] = '_'; m[0xBB] = '+'; m[0xDB] = '{'; m[0xDD] = '}';
            m[0xDC] = '|'; m[0xBA] = ':'; m[0xDE] = '"'; m[0xBC] = '<';
            m[0xBE] = '>'; m[0xBF] = '?'; m[0xC0] = '~';
            m[VK_SPACE] = ' ';
            return m;
        }

        // ── State ─────────────────────────────────────────────────────────────
        const int MaxBufferChars   = 50000;
        const int IdleFlushMs      = 2000;    // flush buffer after 2s of no typing in same app
        const int MaxTrackedWindows = 32;     // bound the per-window buffer map

        readonly LowLevelKeyboardProc hookProcDelegate; // keep alive to avoid GC
        readonly Action<KeystrokeChunk> onChunk;
        readonly Action<string> onGap;          // optional — called with gap code string
        readonly Timer idleTimer;
        readonly string ownProcessName;

        IntPtr hook = IntPtr.Zero;
        bool enabled;
        bool disposed;

        // Per-window key buffer: windowHandle → WindowBuffer
        sealed class WindowBuffer {
            internal string Source;
            internal readonly StringBuilder Buffer = new StringBuilder();
            internal WindowBuffer(string source) { Source = source; }
        }
        readonly Dictionary<IntPtr, WindowBuffer> windowBuffers
            = new Dictionary<IntPtr, WindowBuffer>();

        IntPtr lastWindow = IntPtr.Zero;
        string lastSource = null;

        /// <param name="onChunk">Called on the UI thread when a text chunk is ready.</param>
        /// <param name="onGap">Called on the UI thread with a gap code (may be null).</param>
        internal GlobalKeyboardCapture(Action<KeystrokeChunk> onChunk, Action<string> onGap = null) {
            if (onChunk == null) throw new ArgumentNullException("onChunk");
            this.onChunk = onChunk;
            this.onGap   = onGap;
            hookProcDelegate = HookCallback;
            idleTimer = new Timer { Interval = IdleFlushMs };
            idleTimer.Tick += OnIdleFlush;
            using (var p = Process.GetCurrentProcess()) ownProcessName = p.ProcessName;
        }

        internal bool Enabled { get { return enabled; } }

        /// <summary>
        /// Returns the current capture app name (foreground app being tracked),
        /// or null if not recording or foreground is blocked.
        /// </summary>
        internal string CurrentSource { get { return enabled ? lastSource : null; } }

        internal void Start() {
            if (disposed) throw new ObjectDisposedException("GlobalKeyboardCapture");
            if (enabled) return;
            var module = GetModuleHandle(null);
            hook = SetWindowsHookEx(WH_KEYBOARD_LL, hookProcDelegate, module, 0);
            if (hook == IntPtr.Zero) {
                int err = Marshal.GetLastWin32Error();
                throw new InvalidOperationException("Could not install global keyboard hook (Win32 error " + err + "). This is normal on locked desktops.");
            }
            enabled = true;
        }

        internal void Stop() {
            if (!enabled) return;
            enabled = false;
            idleTimer.Stop();
            var old = hook; hook = IntPtr.Zero;
            if (old != IntPtr.Zero) UnhookWindowsHookEx(old);
            FlushAll(isIdle: true);
            windowBuffers.Clear();
            lastWindow = IntPtr.Zero; lastSource = null;
        }

        // ── Hook callback (runs on UI/message-pump thread) ────────────────────
        IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (enabled && nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
                try { ProcessKey(lParam); } catch { /* hook must never throw */ }
            }
            return CallNextHookEx(hook, nCode, wParam, lParam);
        }

        void ProcessKey(IntPtr lParam) {
            var kbd = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            uint vk = kbd.vkCode;

            // ── Identify foreground process ───────────────────────────────────
            IntPtr window = GetForegroundWindow();
            if (window == IntPtr.Zero) return;

            string source;
            if (window == lastWindow) {
                source = lastSource; // cache hit — avoid process lookup on every key
            } else {
                source = GetProcessName(window);
                lastWindow = window;
                lastSource = source;
            }

            // Skip blocked or unknown processes
            if (source == null || IsBlocked(source)) {
                // If we have a buffer for a now-blocked window, flush it
                FlushWindow(window, isEnter: false);
                return;
            }

            // ── Ensure buffer exists for this window ──────────────────────────
            if (!windowBuffers.ContainsKey(window)) {
                if (windowBuffers.Count >= MaxTrackedWindows) PruneOldestBuffer();
                windowBuffers[window] = new WindowBuffer(source);
            }

            StringBuilder buf = windowBuffers[window].Buffer;

            // ── Map key to character or control action ────────────────────────
            if (vk == VK_BACK) {
                // Backspace — remove last char from buffer
                if (buf.Length > 0) buf.Remove(buf.Length - 1, 1);
                idleTimer.Stop(); idleTimer.Start();
                return;
            }

            if (vk == VK_DELETE) {
                // Delete key — we can't know cursor position so just mark a gap in flow.
                // Don't modify buffer; next UIA snapshot will correct it.
                idleTimer.Stop(); idleTimer.Start();
                return;
            }

            if (vk == VK_RETURN) {
                // Enter — append newline then flush this window's buffer as a chunk
                buf.Append('\n');
                FlushWindow(window, isEnter: true);
                idleTimer.Stop();
                return;
            }

            if (vk == VK_ESCAPE) {
                // Escape — discard buffer (user likely cancelled input)
                FlushWindow(window, isEnter: false);
                return;
            }

            // ── Map printable character ───────────────────────────────────────
            bool shifted = IsShifted();
            char ch;
            if (shifted) {
                if (!ShiftedMap.TryGetValue(vk, out ch)) return; // non-printable
            } else {
                if (!UnshiftedMap.TryGetValue(vk, out ch)) return; // non-printable
                // Apply CapsLock to letters
                if (ch >= 'a' && ch <= 'z' && IsCapsLockOn()) ch = (char)(ch - 32);
            }

            if (buf.Length >= MaxBufferChars) {
                // Buffer full — emit what we have before adding more
                FlushWindow(window, isEnter: false);
                if (!windowBuffers.ContainsKey(window))
                    windowBuffers[window] = new WindowBuffer(source);
                buf = windowBuffers[window].Buffer;
            }

            buf.Append(ch);

            // Restart idle flush timer
            idleTimer.Stop(); idleTimer.Start();
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        bool IsShifted() {
            return (GetKeyState(VK_LSHIFT) & 0x8000) != 0 ||
                   (GetKeyState(VK_RSHIFT) & 0x8000) != 0;
        }

        bool IsCapsLockOn() {
            return (GetKeyState(VK_CAPITAL) & 0x0001) != 0;
        }

        string GetProcessName(IntPtr window) {
            if (window == IntPtr.Zero) return null;
            uint pid; GetWindowThreadProcessId(window, out pid);
            if (pid == 0) return null;
            try {
                using (var p = Process.GetProcessById((int)pid)) {
                    var name = p.ProcessName;
                    // Never capture our own process
                    if (string.Equals(name, ownProcessName, StringComparison.OrdinalIgnoreCase)) return null;
                    return name;
                }
            } catch { return null; }
        }

        bool IsBlocked(string processName) {
            return BlockedProcesses.Contains(processName);
        }

        void FlushWindow(IntPtr window, bool isEnter) {
            WindowBuffer entry;
            if (!windowBuffers.TryGetValue(window, out entry)) return;
            string src = entry.Source;
            string text = entry.Buffer.ToString();
            entry.Buffer.Clear();
            if (string.IsNullOrWhiteSpace(text)) return;
            // Normalize: source already includes .exe suffix for non-.exe names;
            // avoid double-appending if process name already ends in .exe
            string sourceName = src.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? src : src + ".exe";
            onChunk(new KeystrokeChunk(sourceName, text, isEnter));
        }

        void FlushAll(bool isIdle) {
            // Snapshot keys to avoid modification during iteration
            var keys = new IntPtr[windowBuffers.Count];
            windowBuffers.Keys.CopyTo(keys, 0);
            foreach (var win in keys) FlushWindow(win, isEnter: false);
        }

        void OnIdleFlush(object sender, EventArgs e) {
            idleTimer.Stop();
            if (!enabled) return;
            // Only flush the last active window on idle
            if (lastWindow != IntPtr.Zero) FlushWindow(lastWindow, isEnter: false);
        }

        void PruneOldestBuffer() {
            // Remove the window buffer with the fewest characters (likely stale)
            IntPtr oldest = IntPtr.Zero; int min = int.MaxValue;
            foreach (KeyValuePair<IntPtr, WindowBuffer> kv in windowBuffers) {
                if (kv.Value.Buffer.Length < min) { min = kv.Value.Buffer.Length; oldest = kv.Key; }
            }
            if (oldest != IntPtr.Zero) windowBuffers.Remove(oldest);
        }

        public void Dispose() {
            if (disposed) return;
            disposed = true;
            Stop();
            idleTimer.Dispose();
        }
    }
}
