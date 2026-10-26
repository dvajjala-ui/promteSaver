// Opt-in Windows text-field snapshots for individually approved desktop apps.
// Keyboard events carry no key values here. Accessibility text changes can
// also trigger a snapshot after paste or dictation when an app exposes them.
// Browsers, credential tools and protected fields are excluded at the producer.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Automation;
using System.Windows.Forms;

namespace PromteSaver.WindowsPreview {
    internal sealed class FocusedFieldCapture : IDisposable {
        const int KeyboardHook = 13, KeyDown = 0x0100, SystemKeyDown = 0x0104;
        const int MaxSnapshot = 50000;
        delegate IntPtr HookProcedure(int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int hook, HookProcedure procedure, IntPtr module, uint thread);
        [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string module);

        static readonly HashSet<string> blockedProcesses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            // Native collection cannot distinguish a private browser window or site.
            "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "chromium", "iexplore",
            "tor", "waterfox", "floorp", "zen", "safari", "arc", "browser", "webview2", "msedgewebview2",
            // Do not observe operating-system authentication or password managers.
            "credentialuibroker", "credentialui", "logonui", "consent", "lsass", "securityhealthsystray",
            "applicationframehost", "svchost", "systemsettings", "textinputhost", "explorer", "codex-computer-use",
            "1password", "bitwarden", "keepass", "keepassxc", "lastpass", "dashlane",
            "nordpass", "protonpass", "enpass", "roboform"
        };

        readonly Control owner;
        readonly Func<string, bool> isApprovedProcess;
        readonly Func<string, string, Task> onSnapshot;
        readonly Action<string> onGap;
        readonly Action<string> onTrace;
        readonly Timer settle = new Timer { Interval = 1300 };
        readonly HookProcedure keyboardProcedure;
        readonly AutomationFocusChangedEventHandler focusProcedure;
        readonly AutomationEventHandler textProcedure;
        readonly AutomationPropertyChangedEventHandler valueProcedure;
        IntPtr hook, pendingWindow, boundWindow, lastSavedWindow, cachedWindow;
        AutomationElement boundElement, lastSavedElement;
        string boundProcess, lastSavedText, lastGap, cachedProcess;
        bool enabled, busy, retryAfterBusy, textSubscribed, valueSubscribed;
        int generation;

        internal FocusedFieldCapture(Control owner, Func<string, bool> isApprovedProcess,
            Func<string, string, Task> onSnapshot, Action<string> onGap, Action<string> onTrace = null) {
            this.owner = owner; this.isApprovedProcess = isApprovedProcess;
            this.onSnapshot = onSnapshot; this.onGap = onGap; this.onTrace = onTrace;
            keyboardProcedure = KeyEvent;
            focusProcedure = FocusChanged;
            textProcedure = TextChanged;
            valueProcedure = ValueChanged;
            settle.Tick += async delegate {
                settle.Stop();
                if (!enabled) return;
                if (busy) { retryAfterBusy = true; return; }
                busy = true; int observedGeneration = generation;
                Trace("settled");
                try {
                    string process, text, gap;
                    if (!TryReadFocused(pendingWindow, out process, out text, out gap)) {
                        Trace("read-rejected-" + (gap ?? "unknown"));
                        if (enabled && observedGeneration == generation && gap != null) Gap(gap);
                        return;
                    }
                    Trace("read-limited");
                    if (ShouldSave(SameEditor(lastSavedElement, boundElement, lastSavedWindow, pendingWindow) ? lastSavedText : null, text)
                        && enabled && observedGeneration == generation) {
                        await onSnapshot(process, text);
                        Trace("submitted-to-vault");
                        if (enabled && observedGeneration == generation) {
                            lastSavedText = text; lastSavedElement = boundElement; lastSavedWindow = pendingWindow;
                            lastGap = null;
                        }
                    }
                } catch { if (enabled && observedGeneration == generation) Gap("SAVE_FAILED"); }
                finally {
                    busy = false;
                    if (retryAfterBusy && enabled) {
                        retryAfterBusy = false; settle.Start();
                    }
                }
            };
        }

        internal static bool IsEligibleProcess(string processName) {
            return !String.IsNullOrWhiteSpace(processName) && !blockedProcesses.Contains(processName);
        }
        internal static bool IsEligibleMetadata(bool isPassword, bool isEnabled, bool isOffscreen, string typeName) {
            return !isPassword && isEnabled && !isOffscreen &&
                (String.Equals(typeName, "Edit", StringComparison.Ordinal) ||
                 String.Equals(typeName, "Document", StringComparison.Ordinal) ||
                 String.Equals(typeName, "ControlType.Edit", StringComparison.Ordinal) ||
                 String.Equals(typeName, "ControlType.Document", StringComparison.Ordinal));
        }
        internal static bool IsEditableValue(bool valuePatternAvailable, bool valueReadOnly,
            bool textReadOnlyKnown, bool textReadOnly) {
            if ((valuePatternAvailable && valueReadOnly) || (textReadOnlyKnown && textReadOnly)) return false;
            return (valuePatternAvailable && !valueReadOnly) || (textReadOnlyKnown && !textReadOnly);
        }
        internal static bool ShouldSave(string previous, string current) {
            return !String.IsNullOrWhiteSpace(current) && current.Length <= MaxSnapshot &&
                !String.Equals(previous, current, StringComparison.Ordinal);
        }
        static bool SensitiveFieldName(string name) {
            if (String.IsNullOrEmpty(name)) return false;
            string lower = name.ToLowerInvariant();
            return lower.Contains("password") || lower.Contains("passcode") || lower.Contains("one-time code") ||
                lower.Contains("one time code") || lower.Contains("security code") || lower.Contains("card number") ||
                lower.Contains("credit card") || lower.Contains("cvv") || lower.Contains("otp") || lower.Contains("secret key");
        }
        internal bool Enabled { get { return enabled; } }
        internal void Start() {
            if (enabled) return;
            if (owner == null || owner.IsDisposed || !owner.IsHandleCreated) throw new InvalidOperationException("The desktop window is unavailable.");
            Automation.AddAutomationFocusChangedEventHandler(focusProcedure);
            hook = SetWindowsHookEx(KeyboardHook, keyboardProcedure, GetModuleHandle(null), 0);
            if (hook == IntPtr.Zero) {
                Automation.RemoveAutomationFocusChangedEventHandler(focusProcedure);
                throw new InvalidOperationException("Windows keyboard event access is unavailable.");
            }
            enabled = true; generation++;
            RefreshFocusBinding();
        }
        internal void Stop() {
            bool wasEnabled = enabled;
            enabled = false; generation++; retryAfterBusy = false;
            settle.Stop(); pendingWindow = IntPtr.Zero; cachedWindow = IntPtr.Zero; cachedProcess = null;
            var old = hook; hook = IntPtr.Zero;
            if (old != IntPtr.Zero) UnhookWindowsHookEx(old);
            if (wasEnabled) {
                try { Automation.RemoveAutomationFocusChangedEventHandler(focusProcedure); } catch { }
            }
            Unbind(); lastSavedElement = null; lastSavedText = null; lastSavedWindow = IntPtr.Zero; lastGap = null;
        }
        void Gap(string code) {
            if (lastGap == code) return;
            lastGap = code; onGap(code);
        }
        void Trace(string code) {
            if (onTrace == null || owner.IsDisposed || !owner.IsHandleCreated) return;
            if (owner.InvokeRequired) {
                try { owner.BeginInvoke((MethodInvoker)delegate { if (enabled) onTrace(code); }); } catch { }
            } else if (enabled) onTrace(code);
        }
        void Post(Action work) {
            if (!enabled || owner.IsDisposed || !owner.IsHandleCreated) return;
            int observedGeneration = generation;
            try { owner.BeginInvoke((MethodInvoker)delegate { if (enabled && observedGeneration == generation) work(); }); }
            catch (InvalidOperationException) { }
        }
        IntPtr KeyEvent(int code, IntPtr message, IntPtr data) {
            if (enabled && code >= 0 && (message.ToInt64() == KeyDown || message.ToInt64() == SystemKeyDown)) {
                Trace("keyboard-event");
                // The hook never dereferences data and cannot reconstruct keys.
                IntPtr foreground = GetForegroundWindow();
                if (foreground != cachedWindow) {
                    cachedWindow = foreground; cachedProcess = ProcessName(foreground);
                }
                if (cachedProcess != null && IsEligibleProcess(cachedProcess) && isApprovedProcess(cachedProcess)) {
                    Trace("key-approved");
                    pendingWindow = foreground; settle.Stop(); settle.Start();
                } else { pendingWindow = IntPtr.Zero; settle.Stop(); }
            }
            return CallNextHookEx(hook, code, message, data);
        }
        static string ProcessName(IntPtr window) {
            if (window == IntPtr.Zero) return null;
            uint id; GetWindowThreadProcessId(window, out id);
            if (id == 0) return null;
            try { using (var process = Process.GetProcessById((int)id)) return process.ProcessName; }
            catch { return null; }
        }
        void FocusChanged(object sender, AutomationFocusChangedEventArgs args) {
            Trace("focus-event");
            Post(RefreshFocusBinding);
        }
        void TextChanged(object sender, AutomationEventArgs args) {
            BoundChanged(sender);
        }
        void ValueChanged(object sender, AutomationPropertyChangedEventArgs args) {
            BoundChanged(sender);
        }
        void BoundChanged(object sender) {
            Post(delegate {
                if (boundElement == null || !(sender is AutomationElement)) return;
                try { if (!Automation.Compare((AutomationElement)sender, boundElement)) return; }
                catch { return; }
                Trace("field-change");
                pendingWindow = boundWindow; settle.Stop(); settle.Start();
            });
        }
        static bool SameEditor(AutomationElement a, AutomationElement b, IntPtr aWindow, IntPtr bWindow) {
            if (a == null || b == null || aWindow == IntPtr.Zero || aWindow != bWindow) return false;
            try { return Automation.Compare(a, b); } catch { return false; }
        }
        void Unbind() {
            if (boundElement != null) {
                if (textSubscribed) try { Automation.RemoveAutomationEventHandler(TextPattern.TextChangedEvent, boundElement, textProcedure); } catch { }
                if (valueSubscribed) try { Automation.RemoveAutomationPropertyChangedEventHandler(boundElement, valueProcedure); } catch { }
            }
            boundElement = null; boundWindow = IntPtr.Zero; boundProcess = null; textSubscribed = false; valueSubscribed = false;
        }
        static bool InsideWindow(AutomationElement element, AutomationElement window) {
            var cursor = element;
            for (int depth = 0; depth < 40 && cursor != null; depth++) {
                if (Automation.Compare(cursor, window)) return true;
                cursor = TreeWalker.ControlViewWalker.GetParent(cursor);
            }
            return false;
        }
        bool TryGetApprovedFocus(IntPtr expectedWindow, out string processName, out AutomationElement focused, out string reason) {
            processName = null; focused = null; reason = "window";
            IntPtr window = GetForegroundWindow();
            if (window == IntPtr.Zero || (expectedWindow != IntPtr.Zero && window != expectedWindow)) return false;
            uint processId; GetWindowThreadProcessId(window, out processId);
            reason = "process";
            if (processId == 0) return false;
            try {
                using (var own = Process.GetCurrentProcess()) if (processId == (uint)own.Id) { reason = "self"; return false; }
                using (var process = Process.GetProcessById((int)processId)) processName = process.ProcessName;
                if (!IsEligibleProcess(processName) || !isApprovedProcess(processName)) { reason = "source"; return false; }
                var windowElement = AutomationElement.FromHandle(window);
                focused = AutomationElement.FocusedElement;
                if (windowElement == null || focused == null || !InsideWindow(focused, windowElement)) { reason = "focus-tree"; return false; }
                var current = focused.Current;
                if (current.ProcessId != (int)processId) { reason = "field-process"; return false; }
                if (!IsEligibleMetadata(current.IsPassword, current.IsEnabled, current.IsOffscreen,
                        current.ControlType.ProgrammaticName)) { reason = "field-metadata"; return false; }
                if (SensitiveFieldName(current.Name) || SensitiveFieldName(current.AutomationId)) { reason = "protected"; return false; }
                object valuePattern, textPattern;
                bool hasValuePattern = focused.TryGetCurrentPattern(ValuePattern.Pattern, out valuePattern);
                bool hasTextPattern = focused.TryGetCurrentPattern(TextPattern.Pattern, out textPattern);
                if (!hasTextPattern && !hasValuePattern) { reason = "text-pattern-unsupported"; return false; }
                object readOnlyAttribute = null;
                if (hasTextPattern) {
                    try { readOnlyAttribute = ((TextPattern)textPattern).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute); }
                    catch { if (!hasValuePattern) throw; }
                }
                bool textReadOnlyKnown = readOnlyAttribute is bool;
                bool valueReadOnly = hasValuePattern && ((ValuePattern)valuePattern).Current.IsReadOnly;
                if (!IsEditableValue(hasValuePattern, valueReadOnly, textReadOnlyKnown,
                        textReadOnlyKnown && (bool)readOnlyAttribute)) {
                    reason = valueReadOnly || (textReadOnlyKnown && (bool)readOnlyAttribute) ? "read-only" : "editability-unknown";
                    return false;
                }
                reason = null;
                return true;
            } catch { processName = null; focused = null; reason = "uia-error"; return false; }
        }
        void RefreshFocusBinding() {
            if (!enabled) return;
            string process, reason; AutomationElement focused;
            IntPtr window = GetForegroundWindow();
            if (!TryGetApprovedFocus(window, out process, out focused, out reason)) { Trace("focus-rejected-" + reason); Unbind(); return; }
            if (SameEditor(boundElement, focused, boundWindow, window)) return;
            Unbind();
            try {
                string baseline;
                if (!TryReadEditorText(focused, out baseline)) { Trace("focus-no-readable-pattern"); Gap("FIELD_UNSUPPORTED"); return; }
                // Existing text predating approval/focus is a baseline, not a
                // newly observed draft. Keep it only in memory for comparison.
                lastSavedText = baseline != null && baseline.Length <= MaxSnapshot ? baseline : null;
                lastSavedElement = focused; lastSavedWindow = window;
                boundElement = focused; boundWindow = window; boundProcess = process;
                Trace("focus-bound");
                try { Automation.AddAutomationEventHandler(TextPattern.TextChangedEvent, focused, TreeScope.Element, textProcedure); textSubscribed = true; }
                catch { }
                try { Automation.AddAutomationPropertyChangedEventHandler(focused, TreeScope.Element, valueProcedure, ValuePattern.ValueProperty); valueSubscribed = true; }
                catch { }
            } catch { Unbind(); Gap("SOURCE_UNAVAILABLE"); }
        }
        bool TryReadFocused(IntPtr expectedWindow, out string processName, out string text, out string gap) {
            processName = null; text = null; gap = null;
            AutomationElement focused; string reason;
            if (!TryGetApprovedFocus(expectedWindow, out processName, out focused, out reason)) {
                Trace("read-rejected-" + reason);
                // Password, offscreen, non-editor, changed-focus and private
                // surfaces are expected exclusions, not capture failures.
                return false;
            }
            if (!SameEditor(boundElement, focused, boundWindow, expectedWindow)) {
                RefreshFocusBinding();
                return false;
            }
            try {
                if (!TryReadEditorText(focused, out text)) { gap = "FIELD_UNSUPPORTED"; return false; }
                if (text != null && text.Length > MaxSnapshot) { text = null; gap = "SOURCE_LIMIT"; return false; }
                if (!ShouldSave(null, text)) { text = null; return false; }
                return true;
            } catch { text = null; gap = "SOURCE_UNAVAILABLE"; return false; }
        }
        internal static bool TryReadEditorText(AutomationElement focused, out string text) {
            text = null;
            object pattern;
            if (focused.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
                try {
                    text = ((TextPattern)pattern).DocumentRange.GetText(MaxSnapshot + 1);
                    return true;
                } catch { text = null; }
            }
            if (focused.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
                text = ((ValuePattern)pattern).Current.Value;
                return true;
            }
            return false;
        }
        public void Dispose() { Stop(); settle.Dispose(); }
    }
}
