// Moves redaction + disk writes off the keyboard-hook thread.
//
// The low-level keyboard hook runs on the UI thread; doing a synchronous file
// write there on every Enter/idle flush would block typing and, if the disk is
// slow, risk the hook exceeding the system LowLevelHooksTimeout and dropping
// keystrokes. Capture callbacks instead enqueue a record here; one background
// thread drains the queue in order, redacts, writes, and reports each result
// back to the UI. Ordering is preserved (single FIFO drain).
using System;
using System.Collections.Generic;
using System.Threading;

namespace TypingRecorder {

    /// <summary>One pending capture, as seen at capture time, before redaction.</summary>
    internal sealed class CaptureRecord {
        internal readonly DateTime When;
        internal readonly string App, Title, Host, Path, Via, Text;
        internal CaptureRecord(DateTime when, string app, string title, string host,
                               string path, string via, string text) {
            When = when; App = app; Title = title; Host = host; Path = path; Via = via; Text = text;
        }
    }

    internal sealed class CaptureWriter : IDisposable {
        readonly Queue<CaptureRecord> queue = new Queue<CaptureRecord>();
        readonly object gate = new object();
        readonly AutoResetEvent signal = new AutoResetEvent(false);
        readonly Action<string, string, int> onWritten; // summary, app, masked-char-count
        Thread worker;
        volatile bool running;

        /// <param name="onWritten">Called (on the writer thread) after each successful
        /// write with the live-feed summary, the app name, and the masked char count.</param>
        internal CaptureWriter(Action<string, string, int> onWritten) {
            this.onWritten = onWritten;
            running = true;
            worker = new Thread(Loop);
            worker.IsBackground = true;
            worker.Name = "CaptureWriter";
            worker.Start();
        }

        internal void Enqueue(CaptureRecord r) {
            if (r == null) return;
            lock (gate) { queue.Enqueue(r); }
            signal.Set();
        }

        void Loop() {
            while (running) {
                signal.WaitOne(500);
                Drain();
            }
            Drain(); // flush whatever remains at shutdown
        }

        void Drain() {
            while (true) {
                CaptureRecord r;
                lock (gate) {
                    if (queue.Count == 0) return;
                    r = queue.Dequeue();
                }
                try {
                    string text = Redaction.Mask(r.Text);
                    string summary = MarkdownStore.Append(r.When, r.App, r.Title, r.Host, r.Path, r.Via, text);
                    if (summary != null && onWritten != null)
                        onWritten(summary, r.App, text != null ? text.Length : 0);
                } catch {
                    // A single bad write must never kill the writer thread.
                }
            }
        }

        public void Dispose() {
            running = false;
            signal.Set();
            var t = worker; worker = null;
            if (t != null) { try { t.Join(1500); } catch { } }
        }
    }
}
