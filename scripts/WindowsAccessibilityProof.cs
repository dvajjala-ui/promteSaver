// Native capability experiment, not a production collector. No hooks or other applications.
using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

namespace PromteSaver.Proof
{
    public static class Accessibility
    {
        public static string[] Run(string[] samples)
        {
            Form form = null;
            TextBox editor = null;
            TextBox password = null;
            IntPtr editorHandle = IntPtr.Zero;
            IntPtr passwordHandle = IntPtr.Zero;
            Exception uiError = null;
            var ready = new ManualResetEvent(false);
            var thread = new Thread(() =>
            {
                try
                {
                    form = new Form { Text = "promteSaver synthetic proof", ShowInTaskbar = false, Opacity = 0 };
                    editor = new TextBox { Multiline = true, Dock = DockStyle.Fill };
                    password = new TextBox { UseSystemPasswordChar = true };
                    form.Controls.Add(editor);
                    form.Controls.Add(password);
                    form.Shown += (sender, args) => { editorHandle = editor.Handle; passwordHandle = password.Handle; ready.Set(); };
                    Application.Run(form);
                }
                catch (Exception error) { uiError = error; ready.Set(); }
                finally { if (form != null) form.Dispose(); }
            });
            thread.IsBackground = true;
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            try
            {
                if (!ready.WaitOne(10000) || uiError != null || editorHandle == IntPtr.Zero)
                    throw new InvalidOperationException("Synthetic UI initialization failed");
                var methods = new List<string>();
                foreach (string sample in samples)
                {
                    form.Invoke(new Action(() => editor.Text = sample));
                    var element = AutomationElement.FromHandle(editorHandle);
                    object pattern;
                    string actual;
                    if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
                    { actual = ((ValuePattern)pattern).Current.Value; methods.Add("ValuePattern"); }
                    else if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern))
                    { actual = ((TextPattern)pattern).DocumentRange.GetText(-1); methods.Add("TextPattern"); }
                    else throw new InvalidOperationException("Synthetic editor exposes no readable accessibility pattern");
                    if (Normalize(actual) != Normalize(sample)) throw new InvalidOperationException("Synthetic editor snapshot mismatch");
                }
                // Do not request text from the protected control.
                if (!AutomationElement.FromHandle(passwordHandle).Current.IsPassword)
                    throw new InvalidOperationException("Synthetic password field was not identified");
                return methods.ToArray();
            }
            finally
            {
                if (form != null && form.IsHandleCreated) form.BeginInvoke(new Action(() => form.Close()));
                thread.Join(3000);
                ready.Dispose();
            }
        }
        private static string Normalize(string text) { return text.Replace("\r\n", "\n").Replace("\r", "\n"); }
    }
}
