// Harmless WinForms editor fixture for a manual UI Automation capture pilot.
// Never distribute it with the application or enter real private data here.
using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Automation;
using System.Windows.Forms;

internal static class WindowsValueFieldPilot {
    [STAThread]
    static void Main(string[] args) {
        Application.EnableVisualStyles();
        var form = new Form { Text = "Synthetic value-field pilot", Width = 620, Height = 335,
            StartPosition = FormStartPosition.CenterScreen };
        var editor = new TextBox { Name = "PilotEditor", AccessibleName = "Pilot editor",
            Multiline = true, Location = new Point(20, 45), Size = new Size(560, 135) };
        var readOnly = new TextBox { Name = "PilotReadOnly", AccessibleName = "Read only example",
            ReadOnly = true, Text = "Synthetic read-only canary: never archive this.",
            Location = new Point(20, 205), Size = new Size(560, 28) };
        var password = new TextBox { Name = "PilotPassword", AccessibleName = "Password",
            UseSystemPasswordChar = true, Location = new Point(20, 258), Size = new Size(560, 28) };
        form.Controls.Add(new Label { Text = "Synthetic editable field (harmless text only)",
            Location = new Point(20, 20), AutoSize = true });
        form.Controls.Add(editor);
        form.Controls.Add(new Label { Text = "Read-only field", Location = new Point(20, 184), AutoSize = true });
        form.Controls.Add(readOnly);
        form.Controls.Add(new Label { Text = "Protected field", Location = new Point(20, 237), AutoSize = true });
        form.Controls.Add(password);
        if (args.Length == 1 && args[0] == "--probe") {
            form.Shown += async delegate {
                IntPtr editorHandle = editor.Handle;
                var result = await Task.Run(() => {
                    var element = AutomationElement.FromHandle(editorHandle);
                    object pattern;
                    bool text = element.TryGetCurrentPattern(TextPattern.Pattern, out pattern);
                    bool value = element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern);
                    return "TextPattern=" + text + " ValuePattern=" + value;
                });
                Console.WriteLine(result);
                form.Close();
            };
        }
        Application.Run(form);
    }
}
