// In-worker UI Automation reader for the focused editable field.
//
// Lives inside the isolated field-worker child process (see FieldWorkerHost).
// It watches system-wide focus / text / value changes plus a cheap key-activity
// trigger, then, on an 800 ms settle, reads the CURRENT text of the focused
// editable field via UI Automation and hands (process, text, fieldId) to the
// host. Producer-side exclusions are enforced before any text is requested:
// password / credential windows, OS auth, password managers, protected field
// names (OTP / CVV / card / secret), read-only, off-screen and disabled fields
// are all rejected. Browsers stay eligible — UIA can read their edit fields.
//
// Near-verbatim port of apps/desktop/windows-host/FocusedFieldCapture.cs, with:
//   * namespace PromteSaver.WindowsPreview -> TypingRecorder
//   * the diagnostic onTrace channel removed (not in the agreed API)
//   * ValuePattern fallback permanently disabled (the worker must bound every
//     allocation; ValuePattern has no bounded getter)
//   * the low-level keyboard hook no longer resolves a process name inside the
//     callback (adversarial-review P2 #5): it does GetForegroundWindow + arms
//     the settle only, and never dereferences key data, so the system
//     LowLevelHooksTimeout cannot drop keystrokes on low-RAM machines
//   * the eligibility blocklist consolidated onto GlobalKeyboardCapture plus a
//     field-only noise set (adversarial-review P2 #9)
//
// All field reads and binding mutations happen on the owner Control's thread
// (the worker's message-pump thread). UI Automation delivers its focus / text /
// value events on its own threads, so those handlers marshal onto the owner
// thread with Control.BeginInvoke before touching any state. The parent app's
// UI thread never runs this code — isolation is the separate worker process.
//
// Targets .NET Framework 4.7.2 / C# 5 (in-box csc.exe). No external packages.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Automation;
using System.Windows.Forms;

namespace TypingRecorder {

    /// <summary>
    /// Reads the focused editable field on a debounced settle and emits a
    /// (process, text) snapshot plus a fieldId, de-duped against an in-memory
    /// baseline so an unchanged field is never re-emitted. Instances always run
    /// with the ValuePattern fallback disabled (bounded reads only).
    /// </summary>
    internal sealed class FocusedFieldReader : IDisposable {

        // -- Win32 (keyboard hook used only to arm the settle) ----------------
        const int KeyboardHook = 13, KeyDown = 0x0100, SystemKeyDown = 0x0104;
        const int MaxSnapshot = 50000;
        const int SettleMs = 800;

        delegate IntPtr HookProcedure(int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int hook, HookProcedure procedure, IntPtr module, uint thread);
        [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string module);

        // -- Consolidated eligibility (adversarial-review P2 #9) --------------
        // The session-level blocklist is GlobalKeyboardCapture.BlockedProcesses,
        // which already covers OS authentication, credential brokers and every
        // supported password manager. It does NOT list the Windows shell or the
        // UWP frame host, whose focused "fields" are pure noise for a text
        // recorder, so they are re-excluded here. Browsers are intentionally
        // absent — their edit fields are a core capture target.
        static readonly HashSet<string> FieldNoise = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "explorer", "applicationframehost"
        };

        readonly Control owner;
        // Session-level gate supplied by the host (e.g. "not this process").
        // NOTE: case-sensitively distinct from the static IsEligibleProcess below.
        readonly Func<string, bool> isEligibleProcess;
        readonly Func<string, string, Task> onSnapshot; // (process, text) -> awaited
        readonly Action<string> onGap;
        // Always false for this reader: ValuePattern cannot bound its returned
        // allocation, so the bounded worker reads via TextPattern only. Kept as a
        // field (not an inlined literal) so the gated value-event subscription
        // below compiles without an unreachable-code warning and can be re-armed
        // if a future, non-worker host ever wants it.
        readonly bool allowValuePatternFallback;
        readonly System.Windows.Forms.Timer settle = new System.Windows.Forms.Timer();
        readonly HookProcedure keyboardProcedure;
        readonly AutomationFocusChangedEventHandler focusProcedure;
        readonly AutomationEventHandler textProcedure;
        readonly AutomationPropertyChangedEventHandler valueProcedure;

        IntPtr hook, pendingWindow, boundWindow, lastSavedWindow;
        AutomationElement boundElement, lastSavedElement;
        string boundProcess, lastSavedText, lastGap, currentFieldId;
        bool enabled, busy, retryAfterBusy, textSubscribed, valueSubscribed;
        int generation;

        /// <summary>Fired (on the owner thread) when focus moves from one field/window
        /// to another. The argument is the process name that just lost focus (may be
        /// null). Subscribers flush any per-field buffers.</summary>
        internal event Action<string> FieldSwitched;

        internal FocusedFieldReader(Control owner, Func<string, bool> isEligibleProcess,
            Func<string, string, Task> onSnapshot, Action<string> onGap) {
            this.owner = owner;
            this.isEligibleProcess = isEligibleProcess;
            this.onSnapshot = onSnapshot;
            this.onGap = onGap;
            // Bounded worker contract: never use the unbounded ValuePattern getter.
            this.allowValuePatternFallback = false;
            settle.Interval = SettleMs;
            keyboardProcedure = KeyEvent;
            focusProcedure = FocusChanged;
            textProcedure = TextChanged;
            valueProcedure = ValueChanged;
            settle.Tick += async delegate {
                settle.Stop();
                if (!enabled) return;
                if (busy) { retryAfterBusy = true; return; }
                busy = true; int observedGeneration = generation;
                try {
                    string process, text, gap;
                    if (!TryReadFocused(pendingWindow, out process, out text, out gap)) {
                        if (enabled && observedGeneration == generation && gap != null) Gap(gap);
                        return;
                    }
                    // De-dupe against the in-memory baseline / last-saved text for the
                    // same editor so an unchanged field is never re-emitted.
                    if (ShouldSave(SameEditor(lastSavedElement, boundElement, lastSavedWindow, pendingWindow) ? lastSavedText : null, text)
                        && enabled && observedGeneration == generation) {
                        await onSnapshot(process, text);
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

        // -- Static eligibility / editability helpers (pure; no instance state) --

        /// <summary>Consolidated session-level process eligibility: not blank, not on
        /// GlobalKeyboardCapture's blocklist (OS auth / credential / password
        /// managers), and not field-only noise (shell, frame host). Accepts names
        /// with or without a ".exe" suffix.</summary>
        internal static bool IsEligibleProcess(string name) {
            if (String.IsNullOrWhiteSpace(name)) return false;
            if (GlobalKeyboardCapture.IsBlockedProcess(name)) return false;
            string bare = name;
            if (bare.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) bare = bare.Substring(0, bare.Length - 4);
            return !FieldNoise.Contains(bare);
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

        /// <summary>Bounded read of the focused editor's text. Prefers TextPattern,
        /// which supports a length-capped GetText; the unbounded ValuePattern getter
        /// is used only when <paramref name="allowValuePatternFallback"/> is true
        /// (never in the worker).</summary>
        internal static bool TryReadEditorText(AutomationElement focused, out string text, bool allowValuePatternFallback) {
            text = null;
            object pattern;
            if (focused.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
                try {
                    text = ((TextPattern)pattern).DocumentRange.GetText(MaxSnapshot + 1);
                    return true;
                } catch { text = null; }
            }
            // ValuePattern cannot bound its returned allocation. The isolated
            // monitoring worker deliberately reports these editors unsupported.
            if (allowValuePatternFallback && focused.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
                text = ((ValuePattern)pattern).Current.Value;
                return true;
            }
            return false;
        }

        static bool SensitiveFieldName(string name) {
            if (String.IsNullOrEmpty(name)) return false;
            string lower = name.ToLowerInvariant();
            return lower.Contains("password") || lower.Contains("passcode") || lower.Contains("one-time code") ||
                lower.Contains("one time code") || lower.Contains("security code") || lower.Contains("card number") ||
                lower.Contains("credit card") || lower.Contains("cvv") || lower.Contains("otp") || lower.Contains("secret key");
        }

        // -- Lifecycle --------------------------------------------------------

        internal bool Enabled { get { return enabled; } }

        /// <summary>An opaque binding-episode id (a Guid), not a stable Windows control
        /// identity. The host reads it when <c>onSnapshot</c> fires to link evidence to
        /// one focus episode.</summary>
        internal string CurrentFieldId { get { return currentFieldId; } }

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
            settle.Stop(); pendingWindow = IntPtr.Zero;
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

        // Marshal 'work' onto the owner thread, dropping it if the reader was
        // stopped or re-generation'd in the meantime.
        void Post(Action work) {
            if (!enabled || owner.IsDisposed || !owner.IsHandleCreated) return;
            int observedGeneration = generation;
            try { owner.BeginInvoke((MethodInvoker)delegate { if (enabled && observedGeneration == generation) work(); }); }
            catch (InvalidOperationException) { }
        }

        // -- Keyboard hook: arms the settle only ------------------------------
        IntPtr KeyEvent(int code, IntPtr message, IntPtr data) {
            if (enabled && code >= 0 && (message.ToInt64() == KeyDown || message.ToInt64() == SystemKeyDown)) {
                // The hook never dereferences 'data' (no key values are ever read)
                // and never resolves a process name here. Resolving one would call
                // Process.GetProcessById — an allocating, tens-of-ms operation —
                // inside the low-level hook, doubling per-keystroke latency and
                // risking the system LowLevelHooksTimeout silently dropping keys on
                // 4-8 GiB machines. All process/field eligibility is deferred to the
                // settle callback (TryGetApprovedFocus), which re-resolves from the
                // foreground window it validates.
                IntPtr foreground = GetForegroundWindow();
                if (foreground != IntPtr.Zero) {
                    pendingWindow = foreground; settle.Stop(); settle.Start();
                } else {
                    pendingWindow = IntPtr.Zero; settle.Stop();
                }
            }
            return CallNextHookEx(hook, code, message, data);
        }

        // -- UI Automation event handlers (arrive off the owner thread) -------
        void FocusChanged(object sender, AutomationFocusChangedEventArgs args) {
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
                pendingWindow = boundWindow; settle.Stop(); settle.Start();
            });
        }

        // -- Binding ----------------------------------------------------------
        static bool SameEditor(AutomationElement a, AutomationElement b, IntPtr aWindow, IntPtr bWindow) {
            if (a == null || b == null || aWindow == IntPtr.Zero || aWindow != bWindow) return false;
            try { return Automation.Compare(a, b); } catch { return false; }
        }

        void Unbind() {
            string previousProcess = boundProcess;
            if (boundElement != null) {
                if (textSubscribed) try { Automation.RemoveAutomationEventHandler(TextPattern.TextChangedEvent, boundElement, textProcedure); } catch { }
                if (valueSubscribed) try { Automation.RemoveAutomationPropertyChangedEventHandler(boundElement, valueProcedure); } catch { }
            }
            boundElement = null; boundWindow = IntPtr.Zero; boundProcess = null; currentFieldId = null; textSubscribed = false; valueSubscribed = false;
            // Tell subscribers focus left a field; pass the process that just left.
            var ev = FieldSwitched;
            if (ev != null) ev(previousProcess);
        }

        static bool InsideWindow(AutomationElement element, AutomationElement window) {
            var cursor = element;
            // Depth 80 handles deep WPF and Electron UI trees.
            for (int depth = 0; depth < 80 && cursor != null; depth++) {
                if (Automation.Compare(cursor, window)) return true;
                cursor = TreeWalker.ControlViewWalker.GetParent(cursor);
            }
            return false;
        }

        // The whole producer-side privacy contract lives here, ported verbatim:
        // foreground is the expected window, not our own process, process is
        // eligible, the focused element is inside the window and owned by that
        // process, its metadata is an editable Edit/Document that is enabled,
        // on-screen and not a password, its Name/AutomationId are not sensitive,
        // and the field is not read-only.
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
                if (!IsEligibleProcess(processName) || !isEligibleProcess(processName)) { reason = "source"; return false; }
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
            if (!TryGetApprovedFocus(window, out process, out focused, out reason)) { Unbind(); return; }
            if (SameEditor(boundElement, focused, boundWindow, window)) return;
            Unbind();
            try {
                string baseline;
                if (!TryReadEditorText(focused, out baseline, allowValuePatternFallback)) { Gap("FIELD_UNSUPPORTED"); return; }
                // Text that predates this focus is a baseline, not a newly observed
                // draft. Keep it in memory for comparison only; never emit it.
                lastSavedText = baseline != null && baseline.Length <= MaxSnapshot ? baseline : null;
                lastSavedElement = focused; lastSavedWindow = window;
                boundElement = focused; boundWindow = window; boundProcess = process;
                currentFieldId = Guid.NewGuid().ToString("D");
                try { Automation.AddAutomationEventHandler(TextPattern.TextChangedEvent, focused, TreeScope.Element, textProcedure); textSubscribed = true; }
                catch { }
                // ValueChanged can allocate the full value before our callback runs.
                // The bounded worker uses text events + key activity only, never this
                // payload-bearing event (allowValuePatternFallback is always false).
                if (allowValuePatternFallback) {
                    try { Automation.AddAutomationPropertyChangedEventHandler(focused, TreeScope.Element, valueProcedure, ValuePattern.ValueProperty); valueSubscribed = true; }
                    catch { }
                }
            } catch { Unbind(); Gap("SOURCE_UNAVAILABLE"); }
        }

        bool TryReadFocused(IntPtr expectedWindow, out string processName, out string text, out string gap) {
            processName = null; text = null; gap = null;
            AutomationElement focused; string reason;
            if (!TryGetApprovedFocus(expectedWindow, out processName, out focused, out reason)) {
                // Password, off-screen, non-editor, changed-focus and private
                // surfaces are expected exclusions, not capture failures.
                return false;
            }
            if (!SameEditor(boundElement, focused, boundWindow, expectedWindow)) {
                RefreshFocusBinding();
                return false;
            }
            try {
                if (!TryReadEditorText(focused, out text, allowValuePatternFallback)) { gap = "FIELD_UNSUPPORTED"; return false; }
                // Providers can change the foreground / focus / protection while the
                // getter runs. Revalidate after reading before releasing any text.
                string verifiedProcess, verifiedReason; AutomationElement verified;
                if (!enabled || !TryGetApprovedFocus(expectedWindow, out verifiedProcess, out verified, out verifiedReason) ||
                    !String.Equals(processName, verifiedProcess, StringComparison.OrdinalIgnoreCase) ||
                    !SameEditor(focused, verified, expectedWindow, GetForegroundWindow())) {
                    text = null; processName = null; return false;
                }
                if (text != null && text.Length > MaxSnapshot) { text = null; gap = "SOURCE_LIMIT"; return false; }
                if (!ShouldSave(null, text)) { text = null; return false; }
                return true;
            } catch { text = null; gap = "SOURCE_UNAVAILABLE"; return false; }
        }

        public void Dispose() { Stop(); settle.Dispose(); }
    }
}
