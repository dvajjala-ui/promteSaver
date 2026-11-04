// Tracks the active application and, for browsers, the active website.
// Runs on its own background thread and polls the foreground window a few times
// a second, so the UI Automation reads never block the typing hot path.
// The browser URL is read from the address bar via UI Automation (ValuePattern).
// Only scheme + host + path are kept; query strings and fragments are dropped so
// tokens that some sites put in the URL are never written to disk.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

namespace TypingRecorder {

    /// <summary>Immutable snapshot of what the user is currently looking at.</summary>
    internal sealed class ContextSnapshot {
        internal readonly string Process;   // "chrome.exe" (lower-case, with .exe)
        internal readonly string Title;     // foreground window title
        internal readonly string Host;      // "github.com" or null
        internal readonly string Path;      // "/owner/repo" or null
        internal ContextSnapshot(string process, string title, string host, string path) {
            Process = process; Title = title; Host = host; Path = path;
        }
        internal static readonly ContextSnapshot Empty = new ContextSnapshot(null, null, null, null);
    }

    /// <summary>Background poller for the active app + active website.</summary>
    internal sealed class ActiveContextMonitor : IDisposable {

        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

        // Chromium-family address bar exposes this exact accessible name.
        const string ChromiumAddressBar = "Address and search bar";

        static readonly HashSet<string> Browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "chrome", "msedge", "brave", "vivaldi", "opera", "opera_gx", "arc", "firefox", "chromium"
        };

        readonly int pollMs;
        volatile ContextSnapshot current = ContextSnapshot.Empty;
        Thread thread;
        volatile bool running;

        // Cache the last browser URL per window handle so a slow read is reused.
        IntPtr urlCacheWindow = IntPtr.Zero;
        string urlCacheHost, urlCachePath;

        internal ActiveContextMonitor(int pollMs) {
            this.pollMs = pollMs < 250 ? 250 : pollMs;
        }

        internal ContextSnapshot Current { get { return current; } }

        internal void Start() {
            if (running) return;
            running = true;
            thread = new Thread(Loop);
            thread.IsBackground = true;
            thread.Name = "ActiveContextMonitor";
            thread.Start();
        }

        internal void Stop() {
            running = false;
            var t = thread; thread = null;
            if (t != null) { try { t.Join(1000); } catch { } }
            current = ContextSnapshot.Empty;
        }

        void Loop() {
            while (running) {
                try { current = Read(); } catch { /* never let the poller die */ }
                for (int i = 0; i < pollMs && running; i += 50) Thread.Sleep(50);
            }
        }

        ContextSnapshot Read() {
            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return ContextSnapshot.Empty;

            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            if (pid == 0) return ContextSnapshot.Empty;

            string process = null;
            try {
                using (var p = Process.GetProcessById((int)pid)) process = p.ProcessName;
            } catch { return ContextSnapshot.Empty; }
            if (process == null) return ContextSnapshot.Empty;

            string title = GetTitle(hwnd);
            string exe = process.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? process : process + ".exe";

            if (!Browsers.Contains(process)) {
                urlCacheWindow = IntPtr.Zero; // leaving a browser clears the cache
                return new ContextSnapshot(exe, title, null, null);
            }

            string host, path;
            ReadBrowserUrl(hwnd, out host, out path);
            return new ContextSnapshot(exe, title, host, path);
        }

        static string GetTitle(IntPtr hwnd) {
            int len = GetWindowTextLength(hwnd);
            if (len <= 0) return null;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hwnd, sb, sb.Capacity);
            string s = sb.ToString();
            return string.IsNullOrWhiteSpace(s) ? null : s;
        }

        void ReadBrowserUrl(IntPtr hwnd, out string host, out string path) {
            host = null; path = null;
            string raw = null;
            try {
                AutomationElement root = AutomationElement.FromHandle(hwnd);
                if (root == null) return;

                // Primary: Chromium family, found by the exact address-bar name.
                var cond = new AndCondition(
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                    new PropertyCondition(AutomationElement.NameProperty, ChromiumAddressBar));
                AutomationElement bar = root.FindFirst(TreeScope.Descendants, cond);
                if (bar != null) raw = ReadValue(bar);

                // Fallback (Firefox and others): first Edit whose value looks like a URL.
                if (string.IsNullOrEmpty(raw)) {
                    var edits = root.FindAll(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
                    if (edits != null && edits.Count <= 80) {
                        foreach (AutomationElement e in edits) {
                            string v = ReadValue(e);
                            if (!string.IsNullOrEmpty(v) && LooksLikeUrl(v)) { raw = v; break; }
                        }
                    }
                }
            } catch { /* UIA can throw on teardown; fall through to cache */ }

            if (string.IsNullOrEmpty(raw)) {
                // Reuse the last good read for this window so transient misses don't blank the site.
                if (hwnd == urlCacheWindow) { host = urlCacheHost; path = urlCachePath; }
                return;
            }

            if (!SplitUrl(raw, out host, out path)) return;
            urlCacheWindow = hwnd; urlCacheHost = host; urlCachePath = path;
        }

        static string ReadValue(AutomationElement element) {
            try {
                object pattern;
                if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) return null;
                if (element.Current.IsPassword) return null;
                return ((ValuePattern)pattern).Current.Value;
            } catch { return null; }
        }

        static bool LooksLikeUrl(string v) {
            if (v.IndexOf(' ') >= 0) return false;
            return v.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                || v.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                || v.IndexOf('.') > 0;
        }

        // Keep scheme+host+path only; drop query and fragment (may carry secrets).
        static bool SplitUrl(string raw, out string host, out string path) {
            host = null; path = null;
            string candidate = raw.Trim();
            if (candidate.Length == 0) return false;
            if (candidate.IndexOf("://", StringComparison.Ordinal) < 0)
                candidate = "https://" + candidate;
            Uri uri;
            if (!Uri.TryCreate(candidate, UriKind.Absolute, out uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;
            host = uri.Host;
            path = (uri.AbsolutePath == "/") ? null : uri.AbsolutePath;
            return !string.IsNullOrEmpty(host);
        }

        public void Dispose() { Stop(); }
    }
}
