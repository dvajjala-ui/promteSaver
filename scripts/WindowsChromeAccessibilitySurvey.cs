// Read-only feasibility survey for an explicitly focused Chrome/ChatGPT test tab.
// Prints fixed status labels only. It checks the address-bar host in memory,
// but never reads editor text or prints URLs, titles or account identifiers.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

namespace PromteSaver.Proof {
    public static class ChromeAccessibilitySurvey {
        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

        static bool HasPattern(AutomationElement element, AutomationPattern pattern) {
            object ignored;
            try { return element.TryGetCurrentPattern(pattern, out ignored); }
            catch (ElementNotAvailableException) { return false; }
        }
        static bool InsideWindow(AutomationElement element, AutomationElement window) {
            try {
                var cursor = element;
                for (int depth = 0; depth < 40 && cursor != null; depth++) {
                    if (Automation.Compare(cursor, window)) return true;
                    cursor = TreeWalker.ControlViewWalker.GetParent(cursor);
                }
            } catch (ElementNotAvailableException) { }
            return false;
        }
        static bool IsChatGptAddress(AutomationElement window, out bool temporaryRoute) {
            temporaryRoute = false;
            var editors = window.FindAll(TreeScope.Descendants,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
            if (editors.Count > 200) return false;
            foreach (AutomationElement editor in editors) {
                string name;
                try { name = editor.Current.Name; }
                catch (ElementNotAvailableException) { continue; }
                if (!String.Equals(name, "Address and search bar", StringComparison.OrdinalIgnoreCase)) continue;
                object pattern;
                if (!editor.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) return false;
                Uri uri;
                try {
                    var location = ((ValuePattern)pattern).Current.Value;
                    if (!location.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                        location = "https://" + location;
                    if (!Uri.TryCreate(location, UriKind.Absolute, out uri)) return false;
                } catch { return false; }
                temporaryRoute = uri.Query.IndexOf("temporary-chat", StringComparison.OrdinalIgnoreCase) >= 0;
                return uri.Scheme == "https" && String.Equals(uri.Host, "chatgpt.com", StringComparison.OrdinalIgnoreCase);
            }
            return false;
        }
        static string TemporaryMode(AutomationElement window) {
            var buttons = window.FindAll(TreeScope.Descendants,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button));
            if (buttons.Count > 1200) return "unverified";
            bool normalControl = false, privateControl = false;
            foreach (AutomationElement button in buttons) {
                string name;
                try { name = button.Current.Name; }
                catch (ElementNotAvailableException) { continue; }
                if (String.Equals(name, "Temporary chat", StringComparison.OrdinalIgnoreCase)) normalControl = true;
                if (String.Equals(name, "Turn off temporary chat", StringComparison.OrdinalIgnoreCase)) privateControl = true;
            }
            return ClassifyTemporaryControls(normalControl, privateControl);
        }
        static string ClassifyTemporaryControls(bool normalControl, bool privateControl) {
            if (normalControl == privateControl) return "unverified";
            return privateControl ? "on" : "off";
        }
        static int SelfTest() {
            if (ClassifyTemporaryControls(true, false) != "off" ||
                ClassifyTemporaryControls(false, true) != "on" ||
                ClassifyTemporaryControls(false, false) != "unverified" ||
                ClassifyTemporaryControls(true, true) != "unverified") return 1;
            Console.WriteLine("self-test=passed"); return 0;
        }
        static int ObserveEvents(AutomationElement window, AutomationElement composer, bool hasText) {
            int textEvents = 0, sendEvents = 0;
            AutomationEventHandler changed = (sender, eventArgs) => Interlocked.Increment(ref textEvents);
            AutomationEventHandler invoked = (sender, eventArgs) => {
                try {
                    var element = sender as AutomationElement;
                    if (element != null && String.Equals(element.Current.Name, "Send", StringComparison.OrdinalIgnoreCase))
                        Interlocked.Increment(ref sendEvents);
                } catch (ElementNotAvailableException) { }
            };
            bool textAttached = false, sendAttached = false;
            try {
                if (hasText) {
                    Automation.AddAutomationEventHandler(TextPattern.TextChangedEvent, composer, TreeScope.Element, changed);
                    textAttached = true;
                }
                Automation.AddAutomationEventHandler(InvokePattern.InvokedEvent, window, TreeScope.Descendants, invoked);
                sendAttached = true;
                Console.WriteLine("event-observation=15-seconds-no-text-read");
                Thread.Sleep(15000);
                Console.WriteLine("text-events=" + Volatile.Read(ref textEvents));
                Console.WriteLine("send-events=" + Volatile.Read(ref sendEvents));
                Console.WriteLine("text-read=no");
                return 0;
            } finally {
                if (textAttached) Automation.RemoveAutomationEventHandler(TextPattern.TextChangedEvent, composer, changed);
                if (sendAttached) Automation.RemoveAutomationEventHandler(InvokePattern.InvokedEvent, window, invoked);
            }
        }
        public static int Main(string[] args) {
            if (args.Length == 1 && args[0] == "--self-test") return SelfTest();
            if (args.Length > 1 || (args.Length == 1 && args[0] != "--observe")) return 2;
            try {
                var handle = GetForegroundWindow();
                if (handle == IntPtr.Zero) { Console.WriteLine("foreground=missing"); return 2; }
                uint processId; GetWindowThreadProcessId(handle, out processId);
                if (processId == 0 || !String.Equals(Process.GetProcessById((int)processId).ProcessName,
                    "chrome", StringComparison.OrdinalIgnoreCase)) {
                    Console.WriteLine("foreground=not-chrome"); return 2;
                }
                var window = AutomationElement.FromHandle(handle);
                bool temporaryRoute;
                if (window == null || !IsChatGptAddress(window, out temporaryRoute)) {
                    Console.WriteLine("approved-host=unverified"); return 2;
                }
                Console.WriteLine("approved-host=chatgpt.com");
                if (temporaryRoute || window.Current.Name.IndexOf("Incognito", StringComparison.OrdinalIgnoreCase) >= 0) {
                    Console.WriteLine("private-mode=on-or-browser-private");
                    Console.WriteLine("text-read=no"); return 2;
                }
                var focused = AutomationElement.FocusedElement;
                if (focused == null) { Console.WriteLine("focused-field=missing"); return 2; }
                if (!InsideWindow(focused, window)) { Console.WriteLine("focused-field=outside-approved-window"); return 2; }
                var current = focused.Current;
                if (current.IsPassword) { Console.WriteLine("focused-field=protected"); return 2; }
                bool namedComposer = String.Equals(current.Name, "Ask ChatGPT", StringComparison.OrdinalIgnoreCase);
                Console.WriteLine("focused-field=" + (namedComposer ? "known-composer" : "unknown"));
                if (!namedComposer) { Console.WriteLine("text-read=no"); return 2; }
                bool hasValue = HasPattern(focused, ValuePattern.Pattern);
                bool hasText = HasPattern(focused, TextPattern.Pattern);
                Console.WriteLine("focused-patterns=" + (hasValue ? "value" : "no-value") + "," +
                    (hasText ? "text" : "no-text"));
                // This label differed across both modes in the observed Chrome UI.
                // Ambiguous or missing controls fail closed; no text is read.
                var privateMode = TemporaryMode(window);
                Console.WriteLine("private-mode=" + privateMode);
                Console.WriteLine("text-read=no");
                if (privateMode != "off" || !(hasValue || hasText)) return 2;
                return args.Length == 1 ? ObserveEvents(window, focused, hasText) : 0;
            } catch (Exception error) {
                Console.WriteLine("survey=unavailable:" + error.GetType().Name);
                return 2;
            }
        }
    }
}
