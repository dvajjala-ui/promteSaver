// Synthetic WPF accessibility provider for the ValuePattern-only fallback test.
// It carries only harmless text and is never bundled in the product.
using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Automation.Provider;
using System.Windows.Controls;
using System.Windows.Interop;
using PromteSaver.WindowsPreview;

internal sealed class ValueOnlyBox : Control {
    internal string Draft = "synthetic value-only draft";
    protected override AutomationPeer OnCreateAutomationPeer() { return new ValueOnlyPeer(this); }
}

internal sealed class ValueOnlyPeer : FrameworkElementAutomationPeer, IValueProvider {
    internal ValueOnlyPeer(ValueOnlyBox owner) : base(owner) { }
    protected override AutomationControlType GetAutomationControlTypeCore() { return AutomationControlType.Edit; }
    protected override string GetNameCore() { return "Value only pilot"; }
    public override object GetPattern(PatternInterface patternInterface) {
        return patternInterface == PatternInterface.Value ? this : null;
    }
    public bool IsReadOnly { get { return false; } }
    public string Value { get { return ((ValueOnlyBox)Owner).Draft; } }
    public void SetValue(string value) { ((ValueOnlyBox)Owner).Dispatcher.Invoke((Action)delegate { ((ValueOnlyBox)Owner).Draft = value; }); }
}

internal static class WindowsValueOnlyPeer {
    [STAThread]
    static int Main() {
        var app = new Application();
        var editor = new ValueOnlyBox { Focusable = true, Width = 360, Height = 80 };
        var window = new Window { Title = "Synthetic value-only provider", Width = 440, Height = 180,
            ShowInTaskbar = false, Content = editor };
        int result = 1;
        window.Loaded += async delegate {
            editor.Focus();
            IntPtr handle = new WindowInteropHelper(window).Handle;
            try {
                await Task.Run(() => {
                    var root = AutomationElement.FromHandle(handle);
                    var element = root.FindFirst(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.NameProperty, "Value only pilot"));
                    if (element == null) throw new Exception("synthetic editor was not exposed");
                    object pattern;
                    if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) throw new Exception("unexpected TextPattern");
                    if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) throw new Exception("ValuePattern missing");
                    if (((ValuePattern)pattern).Current.IsReadOnly) throw new Exception("provider was read-only");
                    string text;
                    if (!FocusedFieldCapture.TryReadEditorText(element, out text) ||
                        text != "synthetic value-only draft") throw new Exception("fallback read failed");
                });
                Console.WriteLine("ValuePattern-only UIA read passed");
                result = 0;
            } catch (Exception error) { Console.Error.WriteLine(error); }
            window.Close();
        };
        app.Run(window);
        return result;
    }
}
