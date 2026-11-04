// Global low-level keyboard hook that reconstructs typed text per foreground window.
// Compatible with .NET Framework 4.7.2 / C# 5 (csc.exe from Framework v4.0.30319).
// Requires no elevated permissions or UIAccess - WH_KEYBOARD_LL runs at normal user level.
// ToUnicodeEx is used for layout-correct character reconstruction (non-QWERTY safe).
// Emits text chunks on Enter/Return or after a configurable idle period.
// Ctrl+C / Ctrl+X / Ctrl+V are reported as clipboard gaps so the host can record
// the actual clipboard text (copy / cut / paste) as the user asked.
// All methods run on the UI/message-pump thread; no cross-thread mutation of buffers.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace TypingRecorder {

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

        // -- Win32 imports ----------------------------------------------------
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
        static extern IntPtr GetKeyboardLayout(uint idThread);

        [DllImport("user32.dll")]
        static extern int ToUnicodeEx(uint wVirtKey, uint wScanCode, byte[] lpKeyState, StringBuilder pwszBuff, int cchBuff, uint wFlags, IntPtr dwhkl);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool GetKeyboardState(byte[] lpKeyState);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
        static extern IntPtr GetModuleHandle(string lpModuleName);

        // Virtual-key codes we care about
        const int VK_BACK      = 0x08;
        const int VK_RETURN    = 0x0D;
        const int VK_ESCAPE    = 0x1B;
        const int VK_DELETE    = 0x2E;
        const int VK_LCONTROL  = 0xA2;
        const int VK_RCONTROL  = 0xA3;
        const int VK_C         = 0x43; // Ctrl+C (copy)
        const int VK_V         = 0x56; // Ctrl+V (paste)
        const int VK_X         = 0x58; // Ctrl+X (cut)

        // -- Blocked processes -------------------------------------------------
        // Browsers are intentionally NOT blocked - capturing typing in browsers
        // is a core product requirement. Only OS auth, credential, and password
        // manager processes stay blocked so secrets are never recorded.
        static readonly HashSet<string> BlockedProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "credentialuibroker", "credentialui", "logonui", "consent", "lsass", "securityhealthsystray",
            "applicationframehost", "svchost", "systemsettings", "textinputhost", "lockapp",
            "1password", "bitwarden", "keepass", "keepassxc", "lastpass", "dashlane",
            "nordpass", "protonpass", "enpass", "roboform"
        };

        // -- Tunables ----------------------------------------------------------
        const int MaxBufferChars    = 50000;
        const int IdleFlushMs       = 1500;    // flush buffer after idle in same app
        const int MaxTrackedWindows = 32;      // bound the per-window buffer map

        readonly LowLevelKeyboardProc hookProcDelegate; // keep alive to avoid GC
        readonly Action<KeystrokeChunk> onChunk;
        readonly Action<string> onGap;          // called with a gap code string
        readonly Timer idleTimer;
        readonly string ownProcessName;

        IntPtr hook = IntPtr.Zero;
        bool enabled;
        bool disposed;

        sealed class WindowBuffer {
            internal string Source;
            internal readonly StringBuilder Buffer = new StringBuilder();
            internal WindowBuffer(string source) { Source = source; }
        }
        readonly Dictionary<IntPtr, WindowBuffer> windowBuffers = new Dictionary<IntPtr, WindowBuffer>();
        readonly LinkedList<IntPtr> lruOrder = new LinkedList<IntPtr>();
        readonly Dictionary<IntPtr, LinkedListNode<IntPtr>> lruNodes = new Dictionary<IntPtr, LinkedListNode<IntPtr>>();

        IntPtr lastWindow = IntPtr.Zero;
        string lastSource = null;

        readonly byte[] keyboardState = new byte[256];
        readonly StringBuilder unicodeBuffer = new StringBuilder(4);

        internal GlobalKeyboardCapture(Action<KeystrokeChunk> onChunk, Action<string> onGap) {
            if (onChunk == null) throw new ArgumentNullException("onChunk");
            this.onChunk = onChunk;
            this.onGap   = onGap;
            hookProcDelegate = HookCallback;
            idleTimer = new Timer();
            idleTimer.Interval = IdleFlushMs;
            idleTimer.Tick += OnIdleFlush;
            using (var p = Process.GetCurrentProcess()) ownProcessName = p.ProcessName;
        }

        internal bool Enabled { get { return enabled; } }
        internal string CurrentSource { get { return enabled ? lastSource : null; } }

        internal void Start() {
            if (disposed) throw new ObjectDisposedException("GlobalKeyboardCapture");
            if (enabled) return;
            var module = GetModuleHandle(null);
            hook = SetWindowsHookEx(WH_KEYBOARD_LL, hookProcDelegate, module, 0);
            if (hook == IntPtr.Zero) {
                int err = Marshal.GetLastWin32Error();
                throw new InvalidOperationException("Could not install the global keyboard hook (Win32 error " + err + "). This is normal on a locked desktop.");
            }
            enabled = true;
        }

        internal void Stop() {
            if (!enabled) return;
            enabled = false;
            idleTimer.Stop();
            var old = hook; hook = IntPtr.Zero;
            if (old != IntPtr.Zero) UnhookWindowsHookEx(old);
            FlushAll();
            windowBuffers.Clear();
            lruOrder.Clear();
            lruNodes.Clear();
            lastWindow = IntPtr.Zero; lastSource = null;
        }

        // -- Hook callback (runs on UI/message-pump thread) -------------------
        IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (enabled && nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
                try { ProcessKey(lParam); } catch { /* a hook must never throw */ }
            }
            return CallNextHookEx(hook, nCode, wParam, lParam);
        }

        void ProcessKey(IntPtr lParam) {
            var kbd = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            uint vk = kbd.vkCode;

            IntPtr window = GetForegroundWindow();
            if (window == IntPtr.Zero) return;

            string source;
            if (window == lastWindow) {
                source = lastSource;
            } else {
                source = GetProcessName(window);
                lastWindow = window;
                lastSource = source;
            }

            if (source == null || IsBlocked(source)) {
                FlushWindow(window, false);
                return;
            }

            if (!windowBuffers.ContainsKey(window)) {
                if (windowBuffers.Count >= MaxTrackedWindows) PruneOldestBuffer();
                windowBuffers[window] = new WindowBuffer(source);
                lruNodes[window] = lruOrder.AddLast(window);
            } else if (lruNodes.ContainsKey(window)) {
                lruOrder.Remove(lruNodes[window]);
                lruNodes[window] = lruOrder.AddLast(window);
            }

            StringBuilder buf = windowBuffers[window].Buffer;

            // -- Ctrl-held: clipboard actions and shortcuts --------------------
            if (IsCtrlHeld()) {
                if (vk == VK_V) {
                    FlushWindow(window, false);
                    if (onGap != null) onGap("PASTE_EVENT");
                } else if (vk == VK_X) {
                    FlushWindow(window, false);
                    if (onGap != null) onGap("CUT_EVENT");
                } else if (vk == VK_C) {
                    if (onGap != null) onGap("COPY_EVENT");
                }
                idleTimer.Stop(); idleTimer.Start();
                return;
            }

            if (vk == VK_BACK) {
                if (buf.Length > 0) buf.Remove(buf.Length - 1, 1);
                idleTimer.Stop(); idleTimer.Start();
                return;
            }

            if (vk == VK_DELETE) {
                idleTimer.Stop(); idleTimer.Start();
                return;
            }

            if (vk == VK_RETURN) {
                buf.Append('\n');
                FlushWindow(window, true);
                idleTimer.Stop();
                return;
            }

            if (vk == VK_ESCAPE) {
                FlushWindow(window, false);
                return;
            }

            char ch = VkToChar(vk, kbd.scanCode);
            if (ch == '\0') return; // non-printable or dead key

            if (buf.Length >= MaxBufferChars) {
                FlushWindow(window, false);
                if (!windowBuffers.ContainsKey(window)) {
                    windowBuffers[window] = new WindowBuffer(source);
                    lruNodes[window] = lruOrder.AddLast(window);
                }
                buf = windowBuffers[window].Buffer;
            }

            buf.Append(ch);
            idleTimer.Stop(); idleTimer.Start();
        }

        // -- Helpers -----------------------------------------------------------
        bool IsCtrlHeld() {
            return (GetKeyState(VK_LCONTROL) & 0x8000) != 0 ||
                   (GetKeyState(VK_RCONTROL) & 0x8000) != 0;
        }

        char VkToChar(uint vk, uint scanCode) {
            uint threadId = 0;
            try {
                IntPtr fg = GetForegroundWindow();
                if (fg != IntPtr.Zero) GetWindowThreadProcessId(fg, out threadId);
            } catch { }
            IntPtr hkl = GetKeyboardLayout(threadId);
            if (!GetKeyboardState(keyboardState)) return '\0';
            unicodeBuffer.Length = 0;
            int result = ToUnicodeEx(vk, scanCode, keyboardState, unicodeBuffer, unicodeBuffer.Capacity, 0, hkl);
            if (result >= 1) return unicodeBuffer[0];
            return '\0'; // dead key (-1) or no mapping (0)
        }

        string GetProcessName(IntPtr window) {
            if (window == IntPtr.Zero) return null;
            uint pid; GetWindowThreadProcessId(window, out pid);
            if (pid == 0) return null;
            try {
                using (var p = Process.GetProcessById((int)pid)) {
                    var name = p.ProcessName;
                    if (string.Equals(name, ownProcessName, StringComparison.OrdinalIgnoreCase)) return null;
                    return name;
                }
            } catch { return null; }
        }

        bool IsBlocked(string processName) {
            return BlockedProcesses.Contains(processName);
        }

        /// <summary>
        /// True if a process (with or without a .exe suffix) is on the always-excluded
        /// list. Used by the UI's coverage view to explain why an app is skipped.
        /// </summary>
        internal static bool IsBlockedProcess(string processName) {
            if (string.IsNullOrEmpty(processName)) return true;
            string name = processName;
            if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                name = name.Substring(0, name.Length - 4);
            return BlockedProcesses.Contains(name);
        }

        void FlushWindow(IntPtr window, bool isEnter) {
            WindowBuffer entry;
            if (!windowBuffers.TryGetValue(window, out entry)) return;
            string src = entry.Source;
            string text = entry.Buffer.ToString();
            entry.Buffer.Length = 0;
            if (string.IsNullOrWhiteSpace(text)) return;
            string sourceName = src.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? src : src + ".exe";
            onChunk(new KeystrokeChunk(sourceName, text, isEnter));
        }

        void FlushAll() {
            var keys = new IntPtr[windowBuffers.Count];
            windowBuffers.Keys.CopyTo(keys, 0);
            foreach (var win in keys) FlushWindow(win, false);
        }

        void OnIdleFlush(object sender, EventArgs e) {
            idleTimer.Stop();
            if (!enabled) return;
            FlushAll();
        }

        void PruneOldestBuffer() {
            if (lruOrder.Count == 0) return;
            IntPtr oldest = lruOrder.First.Value;
            lruOrder.RemoveFirst();
            lruNodes.Remove(oldest);
            WindowBuffer entry;
            if (windowBuffers.TryGetValue(oldest, out entry)) {
                string text = entry.Buffer.ToString();
                if (!string.IsNullOrWhiteSpace(text)) {
                    string src = entry.Source.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                        ? entry.Source : entry.Source + ".exe";
                    onChunk(new KeystrokeChunk(src, text, false));
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
