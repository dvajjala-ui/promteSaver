// Owned synthetic provider: prove monitoring mode never calls Value.Value.
// No keyboard hook or global capture is started by this fixture.
using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Automation.Provider;
using System.Windows.Controls;
using System.Windows.Interop;
using PromteSaver.WindowsPreview;

internal sealed class BoundedValueBox : Control {
    internal int Reads;
    protected override AutomationPeer OnCreateAutomationPeer() { return new BoundedValuePeer(this); }
}
internal sealed class BoundedValuePeer : FrameworkElementAutomationPeer, IValueProvider {
    internal BoundedValuePeer(BoundedValueBox owner) : base(owner) { }
    protected override AutomationControlType GetAutomationControlTypeCore() { return AutomationControlType.Edit; }
    protected override string GetNameCore() { return "Bounded monitoring synthetic editor"; }
    public override object GetPattern(PatternInterface pattern) { return pattern == PatternInterface.Value ? this : null; }
    public bool IsReadOnly { get { return false; } }
    public string Value { get { ((BoundedValueBox)Owner).Reads++; return "harmless fixture text"; } }
    public void SetValue(string value) { }
}
internal static class MonitoringBoundedValuePeer {
    [STAThread]
    static int Main() {
        var app = new Application();
        var editor = new BoundedValueBox { Focusable = true, Width = 300, Height = 60 };
        var window = new Window { Title = "Synthetic bounded value provider", Width = 400, Height = 150,
            ShowInTaskbar = false, Content = editor };
        int result = 1;
        window.Loaded += async delegate {
            IntPtr handle = new WindowInteropHelper(window).Handle;
            try {
                await Task.Run(() => {
                    var element = AutomationElement.FromHandle(handle).FindFirst(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.NameProperty, "Bounded monitoring synthetic editor"));
                    if (element == null) throw new Exception("Owned fixture provider was unavailable.");
                    string text;
                    if (FocusedFieldCapture.TryReadEditorText(element, out text, false) || text != null)
                        throw new Exception("Value-only provider must be unsupported in bounded mode.");
                });
                if (editor.Reads != 0) throw new Exception("Bounded mode invoked the allocating value getter.");
                Console.WriteLine("PASS bounded monitoring excludes ValuePattern getter; no capture started"); result = 0;
            } catch (Exception error) { Console.Error.WriteLine(error); }
            window.Close();
        };
        app.Run(window); return result;
    }
}
