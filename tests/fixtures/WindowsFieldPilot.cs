// Synthetic, content-free Windows UI Automation pilot. Build only for manual
// acceptance tests; this is not part of the distributed application.
using System;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;

internal static class WindowsFieldPilot {
    [STAThread]
    static void Main() {
        var app = new Application();
        var window = new Window {
            Title = "Synthetic text-field pilot", Width = 650, Height = 380,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            Background = Brushes.White
        };
        var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(new TextBlock { Text = "Synthetic editable field (harmless test text only)", FontSize = 18, Margin = new Thickness(0, 0, 0, 12) });
        var editor = new TextBox { Name = "PilotEditor", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap,
            Height = 145, FontSize = 16, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        AutomationProperties.SetName(editor, "Pilot editor");
        panel.Children.Add(editor);
        panel.Children.Add(new TextBlock { Text = "Read-only field (must never be saved)", Margin = new Thickness(0, 10, 0, 5) });
        var readOnly = new TextBox { Name = "PilotReadOnly", Height = 35, FontSize = 16,
            Text = "Synthetic read-only canary: never archive this.", IsReadOnly = true };
        AutomationProperties.SetName(readOnly, "Read only example");
        panel.Children.Add(readOnly);
        panel.Children.Add(new TextBlock { Text = "Protected field (must never be saved)", Margin = new Thickness(0, 15, 0, 5) });
        var password = new PasswordBox { Name = "PilotPassword", Height = 35, FontSize = 16 };
        AutomationProperties.SetName(password, "Password");
        panel.Children.Add(password);
        window.Content = panel;
        app.Run(window);
    }
}
