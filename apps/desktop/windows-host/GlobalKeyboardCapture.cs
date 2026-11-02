// Global low-level keyboard hook that reconstructs typed text per foreground window.
// Compatible with .NET Framework 4.7.2 / C# 5 (csc.exe from Framework v4.0.30319).
// Requires no elevated permissions or UIAccess — WH_KEYBOARD_LL runs at normal user level.
// Browsers are NOT blocked — URL/site context is captured via the UIA worker.
// Ctrl-held keys are suppressed to avoid emitting wrong characters for shortcuts.
// ToUnicodeEx is used for layout-correct character reconstruction (non-QWERTY safe).
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

        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);

        [DllImport("user32.dll")]
        static extern IntPtr GetKeyboardLayout(uint idThread);

        // Converts a virtual key + scan code to a Unicode character using the thread's active keyboard layout.
        [DllImport("user32.dll")]
        static extern int ToUnicodeEx(uint wVirtKey, uint wScanCode, byte[] lpKeyState, StringBuilder pwszBuff, int cchBuff, uint wFlags, IntPtr dwhkl);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool GetKeyboardState(byte[] lpKeyState);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
        static extern IntPtr GetModuleHandle(string lpModuleName);

        // Virtual-key codes we care about
        const int VK_BACK      = 0x08;
        const int VK_TAB       = 0x09;
        const int VK_RETURN    = 0x0D;
        const int VK_ESCAPE    = 0x1B;
        const int VK_SPACE     = 0x20;
        const int VK_DELETE    = 0x2E;
        const int VK_LCONTROL  = 0xA2;
        const int VK_RCONTROL  = 0xA3;
        const int VK_V         = 0x56; // used to detect Ctrl+V (paste)

        // ── Blocked processes ─────────────────────────────────────────────────
        // Browsers are intentionally NOT blocked — capturing typing in browsers
        // is a core product requirement. Only OS auth, credential, and password
        // manager processes remain blocked to protect secrets.
        static readonly HashSet<string> BlockedProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            // OS authentication, credential, and system processes
            "credentialuibroker", "credentialui", "logonui", "consent", "lsass", "securityhealthsystray",
            "applicationframehost", "svchost", "systemsettings", "textinputhost", "explorer",
            "codex-computer-use", "taskmgr", "regedit",
            // Password managers
            "1password", "bitwarden", "keepass", "keepassxc", "lastpass", "dashlane",
            "nordpass", "protonpass", "enpass", "roboform"
        };

        // ── State ─────────────────────────────────────────────────────────────
        const int MaxBufferChars    = 50000;
        const int IdleFlushMs       = 2000;    // flush buffer after 2s of no typing in same app
        const int MaxTrackedWindows = 32;      // bound the per-window buffer map

        readonly LowLevelKeyboardProc hookProcDelegate; // keep alive to avoid GC
        readonly Action<KeystrokeChunk> onChunk;
        readonly Action<string> onGap;          // optional — called with gap code string
        readonly Timer idleTimer;
        readonly string ownProcessName;

        IntPtr hook = IntPtr.Zero;
        bool enabled;
        bool disposed;

        // Per-window key buffer: windowHandle → WindowBuffer
        // LRU order is maintained via a separate insertion-order list.
        sealed class WindowBuffer {
            internal string Source;
            internal readonly StringBuilder Buffer = new StringBuilder();
            internal WindowBuffer(string source) { Source = source; }
        }
        readonly Dictionary<IntPtr, WindowBuffer> windowBuffers
            = new Dictionary<IntPtr, WindowBuffer>();
        // LRU list — front = oldest, back = most recently used
        readonly LinkedList<IntPtr> lruOrder = new LinkedList<IntPtr>();
        readonly Dictionary<IntPtr, LinkedListNode<IntPtr>> lruNodes
            = new Dictionary<IntPtr, LinkedListNode<IntPtr>>();

        IntPtr lastWindow = IntPtr.Zero;
        string lastSource = null;

        // Reusable keyboard-state buffer for ToUnicodeEx
        readonly byte[] keyboardState = new byte[256];
        readonly StringBuilder unicodeBuffer = new StringBuilder(4);

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
                var node = lruOrder.AddLast(window);
                lruNodes[window] = node;
            } else {
                // Move to back (most recently used)
                if (lruNodes.ContainsKey(window)) {
                    lruOrder.Remove(lruNodes[window]);
                    lruNodes[window] = lruOrder.AddLast(window);
                }
            }

            StringBuilder buf = windowBuffers[window].Buffer;

            // ── Ctrl-held: suppress character reconstruction ──────────────────
            // When Ctrl is held the key produces a control action (shortcut), not text.
            // Ctrl+V (paste) is specially noted as a gap so downstream knows content
            // arrived via paste rather than keystroke reconstruction.
            if (IsCtrlHeld()) {
                if (vk == VK_V) {
                    // Paste: flush current buffer then emit a PASTE gap note so
                    // the UIA snapshot engine's next read is treated as authoritative.
                    FlushWindow(window, isEnter: false);
                    if (onGap != null) onGap("PASTE_EVENT");
                }
                // All other Ctrl+ combos are shortcuts — no character appended.
                idleTimer.Stop(); idleTimer.Start();
                return;
            }

            // ── Map key to character or control action ────────────────────────
            if (vk == VK_BACK) {
                // Backspace — remove last char from buffer
                if (buf.Length > 0) buf.Remove(buf.Length - 1, 1);
                idleTimer.Stop(); idleTimer.Start();
                return;
            }

            if (vk == VK_DELETE) {
                // Delete key — we can't know cursor position; UIA snapshot will correct.
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

            // ── Map printable character via ToUnicodeEx (layout-correct) ─────
            char ch = VkToChar(vk, kbd.scanCode);
            if (ch == '\0') return; // non-printable or dead key

            if (buf.Length >= MaxBufferChars) {
                // Buffer full — emit what we have before adding more
                FlushWindow(window, isEnter: false);
                if (!windowBuffers.ContainsKey(window)) {
                    windowBuffers[window] = new WindowBuffer(source);
                    var node = lruOrder.AddLast(window);
                    lruNodes[window] = node;
                }
                buf = windowBuffers[window].Buffer;
            }

            buf.Append(ch);

            // Restart idle flush timer
            idleTimer.Stop(); idleTimer.Start();
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        bool IsCtrlHeld() {
            return (GetKeyState(VK_LCONTROL) & 0x8000) != 0 ||
                   (GetKeyState(VK_RCONTROL) & 0x8000) != 0;
        }

        // Use ToUnicodeEx for layout-correct character mapping.
        // Returns '\0' for non-printable keys, dead keys, or mapping failures.
        char VkToChar(uint vk, uint scanCode) {
            uint threadId = 0;
            try {
                IntPtr fg = GetForegroundWindow();
                if (fg != IntPtr.Zero) GetWindowThreadProcessId(fg, out threadId);
            } catch { }
            IntPtr hkl = GetKeyboardLayout(threadId);
            if (!GetKeyboardState(keyboardState)) return '\0';
            unicodeBuffer.Clear();
            int result = ToUnicodeEx(vk, scanCode, keyboardState, unicodeBuffer, unicodeBuffer.Capacity, 0, hkl);
            if (result == 1) return unicodeBuffer[0];
            if (result > 1) return unicodeBuffer[0]; // ligature: take first char
            return '\0'; // dead key (result == -1) or no mapping (result == 0)
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
            // Normalize: ensure .exe suffix
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
            // Flush ALL buffered windows on idle — not just the last one — so no
            // in-flight text is lost when the user switches apps before pressing Enter.
            FlushAll(isIdle: true);
        }

        void PruneOldestBuffer() {
            // Remove the LRU (least recently used) window buffer.
            if (lruOrder.Count == 0) return;
            IntPtr oldest = lruOrder.First.Value;
            lruOrder.RemoveFirst();
            lruNodes.Remove(oldest);
            WindowBuffer entry;
            if (windowBuffers.TryGetValue(oldest, out entry)) {
                // Flush any remaining text before evicting so it isn't lost
                string text = entry.Buffer.ToString();
                if (!string.IsNullOrWhiteSpace(text)) {
                    string src = entry.Source.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                        ? entry.Source : entry.Source + ".exe";
                    onChunk(new KeystrokeChunk(src, text, isEnterFlush: false));
                }
                windowBuffers.Remove(oldest);
            }
        }

        public void Dispose() {
            if (disposed) return;
            disposed = true;
            Stop();
            idleTimer.Dispose();
        }
    }
}
