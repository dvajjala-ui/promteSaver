// Writes captured text to human-readable Markdown, one file per day, and reads
// those files back for the library view. Everything stays on the local disk.
// Captured text is treated as untrusted data: it is wrapped in a fenced code
// block sized to be longer than any backtick run inside it, so no captured
// content can break out of the document structure.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace TypingRecorder {

    internal sealed class CaptureFile {
        internal readonly string Path;
        internal readonly string Name;   // "2026-11-04.md"
        internal CaptureFile(string path, string name) { Path = path; Name = name; }
        public override string ToString() { return Name; }
    }

    internal static class MarkdownStore {

        static readonly object Gate = new object();

        internal static string DataRoot {
            get {
                string docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                return System.IO.Path.Combine(docs, "TypingRecorder");
            }
        }

        internal static string CaptureDir {
            get { return System.IO.Path.Combine(DataRoot, "captures"); }
        }

        internal static void EnsureDirs() {
            Directory.CreateDirectory(CaptureDir);
        }

        static string FileForDay(DateTime whenLocal) {
            return System.IO.Path.Combine(CaptureDir, whenLocal.ToString("yyyy-MM-dd") + ".md");
        }

        /// <summary>Append one capture entry. Returns the single-line summary shown in the live feed.</summary>
        internal static string Append(DateTime whenLocal, string app, string title,
                                      string host, string path, string via, string text) {
            if (string.IsNullOrEmpty(text)) return null;
            app = string.IsNullOrEmpty(app) ? "unknown" : app;

            var sb = new StringBuilder();
            sb.Append("### ").Append(whenLocal.ToString("HH:mm:ss")).Append(" · ").Append(app);
            if (!string.IsNullOrEmpty(host)) {
                sb.Append(" · ").Append(host);
                if (!string.IsNullOrEmpty(path)) sb.Append(path);
            }
            sb.Append('\n');
            if (!string.IsNullOrEmpty(title)) sb.Append("- window: ").Append(OneLine(title)).Append('\n');
            sb.Append("- via: ").Append(via).Append('\n').Append('\n');
            AppendFenced(sb, text);
            sb.Append('\n');

            string file = FileForDay(whenLocal);
            lock (Gate) {
                EnsureDirs();
                bool isNew = !File.Exists(file);
                using (var w = new StreamWriter(file, true, new UTF8Encoding(false))) {
                    if (isNew) {
                        w.Write("# Typing captures — " + whenLocal.ToString("dddd, dd MMMM yyyy") + "\n\n");
                        w.Write("Saved locally by TypingRecorder. Each entry is one block of text you typed or pasted, with the app and website it belongs to. Nothing here was uploaded.\n\n");
                    }
                    w.Write(sb.ToString());
                }
            }

            string summary = whenLocal.ToString("HH:mm:ss") + "  " + app;
            if (!string.IsNullOrEmpty(host)) summary += "  " + host;
            summary += "  [" + via + "]  " + OneLine(Clip(text, 80));
            return summary;
        }

        internal static List<CaptureFile> ListFiles() {
            var list = new List<CaptureFile>();
            lock (Gate) {
                if (!Directory.Exists(CaptureDir)) return list;
                var files = Directory.GetFiles(CaptureDir, "*.md");
                Array.Sort(files, StringComparer.OrdinalIgnoreCase);
                Array.Reverse(files); // newest day first
                foreach (var f in files) list.Add(new CaptureFile(f, System.IO.Path.GetFileName(f)));
            }
            return list;
        }

        internal static string Read(string path) {
            try {
                lock (Gate) { return File.ReadAllText(path, Encoding.UTF8); }
            } catch (Exception e) {
                return "Could not read file: " + e.Message;
            }
        }

        // -- formatting helpers ------------------------------------------------

        static void AppendFenced(StringBuilder sb, string text) {
            int longestRun = 0, run = 0;
            foreach (char c in text) {
                if (c == '`') { run++; if (run > longestRun) longestRun = run; }
                else run = 0;
            }
            int fenceLen = Math.Max(3, longestRun + 1);
            string fence = new string('`', fenceLen);
            sb.Append(fence).Append("text\n");
            sb.Append(text);
            if (text.Length == 0 || text[text.Length - 1] != '\n') sb.Append('\n');
            sb.Append(fence).Append('\n');
        }

        static string OneLine(string s) {
            if (s == null) return "";
            return s.Replace("\r", " ").Replace("\n", " ").Trim();
        }

        static string Clip(string s, int max) {
            if (s == null) return "";
            s = s.Trim();
            return s.Length <= max ? s : s.Substring(0, max) + "…";
        }
    }
}
