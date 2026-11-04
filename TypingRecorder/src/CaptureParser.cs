// The single authority on the on-disk Markdown capture format produced by
// MarkdownStore.Append. It turns one day file's text into structured entries,
// used for the index build, per-day refresh, lazy single-body reads and search.
//
// It does NO disk access of its own: callers read the file through
// MarkdownStore.Read so the shared Gate lock is honoured and no partial read is
// ever seen during a concurrent append. Every method here is a pure, stateless
// function of its arguments, so Parse/ReadBody are safe to call from any thread
// (including a background indexer) without locking.
//
// On-disk shape of one entry (written by MarkdownStore.Append):
//   ### HH:mm:ss · app[ · host/path]
//   - window: <title>            (optional)
//   - via: <via>                 (optional, normally present)
//   <blank line>
//   ```text                      (opening fence; run is 3+ backticks + "text")
//   <body line(s)>               (may themselves contain ``` or "### ")
//   ```                          (closing fence; the SAME run, nothing else)
//   <blank line>
// The fence run is always longer than the longest backtick run inside the body
// (AppendFenced guarantees it), so a body containing ``` round-trips intact.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace TypingRecorder {

    internal static class CaptureParser {

        // Field separator written by MarkdownStore.Append: space, U+00B7
        // (MIDDLE DOT), space. Built from the code point so the exact byte is
        // emitted no matter how this source file is itself encoded on disk.
        const string Sep = " · ";
        const string HeaderPrefix = "### ";
        const string WindowPrefix = "- window: ";
        const string ViaPrefix = "- via: ";
        const string FenceInfo = "text";
        const string Ellipsis = "…";
        const int PreviewMax = 200;

        // ---- parsing --------------------------------------------------------

        /// <summary>Parse a whole day file into entries, in append (0-based) order.</summary>
        internal static List<ParsedEntry> Parse(string dayKey, string fileText) {
            var result = new List<ParsedEntry>();
            if (string.IsNullOrEmpty(fileText)) return result;

            // The producer writes '\n' only; splitting on it keeps any '\r' that
            // was part of captured (e.g. clipboard CRLF) body text intact, while
            // structural lines are matched with a trailing '\r' tolerated.
            string[] lines = fileText.Split('\n');
            int i = 0;
            int ordinal = 0;

            while (i < lines.Length) {
                string head = TrimCr(lines[i]);
                if (!head.StartsWith(HeaderPrefix, StringComparison.Ordinal)) {
                    // Skip the '# Typing captures' header, intro paragraph and any
                    // blank/separator lines between entries.
                    i++;
                    continue;
                }

                // --- header: "### HH:mm:ss · app[ · host/path]"
                string content = head.Substring(HeaderPrefix.Length);
                string[] fields = content.Split(new string[] { Sep }, 3, StringSplitOptions.None);
                string timeText = fields.Length > 0 ? fields[0] : "";
                string app = fields.Length > 1 ? fields[1] : "unknown";
                if (string.IsNullOrEmpty(app)) app = "unknown";

                string host, pathTail;
                SplitHostPath(fields.Length > 2 ? fields[2] : null, out host, out pathTail);
                DateTime when = CombineWhen(dayKey, timeText);
                i++;

                // --- optional metadata lines, in any order, until something else
                string title = null, via = null;
                while (i < lines.Length) {
                    string m = TrimCr(lines[i]);
                    if (m.StartsWith(WindowPrefix, StringComparison.Ordinal)) {
                        title = m.Substring(WindowPrefix.Length);
                        i++;
                    } else if (m.StartsWith(ViaPrefix, StringComparison.Ordinal)) {
                        via = m.Substring(ViaPrefix.Length);
                        i++;
                    } else {
                        break;
                    }
                }

                // --- locate the opening fence, skipping the blank separator
                // line. Stop before the next entry header so a truncated entry
                // with no fence simply yields a null body.
                string fenceRun = null;
                while (i < lines.Length) {
                    string f = TrimCr(lines[i]);
                    if (f.StartsWith(HeaderPrefix, StringComparison.Ordinal)) break;
                    if (TryOpeningFence(f, out fenceRun)) break;
                    i++;
                }

                string body = null;
                if (fenceRun != null) {
                    i++; // consume the opening fence line
                    var bodyLines = new List<string>();
                    while (i < lines.Length) {
                        string raw = lines[i];
                        if (TrimCr(raw) == fenceRun) { i++; break; } // exact closing fence
                        // Body lines are kept raw (including any '\r') and may
                        // safely start with '### ' or contain shorter ``` runs.
                        bodyLines.Add(raw);
                        i++;
                    }
                    // A missing closing fence (truncated last entry from a crash
                    // mid-write) leaves the remainder as the body, per spec.
                    body = string.Join("\n", bodyLines.ToArray());
                }

                var entry = new ParsedEntry();
                entry.When = when;
                entry.App = app;
                entry.Host = host;
                entry.PathTail = pathTail;
                entry.Title = title;
                entry.Via = via;
                entry.Body = body;
                entry.Ordinal = ordinal;
                result.Add(entry);
                ordinal++;
            }

            return result;
        }

        /// <summary>Build display metadata for a day's parsed entries.</summary>
        internal static List<EntryMeta> ToMeta(string dayKey, List<ParsedEntry> parsed) {
            var metas = new List<EntryMeta>();
            if (parsed == null) return metas;

            for (int k = 0; k < parsed.Count; k++) {
                ParsedEntry p = parsed[k];
                if (p == null) continue;

                var m = new EntryMeta();
                m.EntryId = MakeEntryId(dayKey, p.Ordinal);
                m.DayKey = dayKey;
                m.App = p.App;
                m.Host = p.Host;
                m.PathTail = p.PathTail;
                m.Title = p.Title;
                m.Via = p.Via;
                m.When = p.When;
                m.Ordinal = p.Ordinal;
                m.Preview = Preview(p.Body);

                bool isAi = !string.IsNullOrEmpty(p.Host) && AiSites.IsAiPrompt(p.Host);
                m.IsAi = isAi;
                m.AiLabel = isAi ? AiSites.Label(p.Host) : null;

                // Reproduce the original "HH:mm:ss" token from the parsed time so
                // the fingerprint is stable across rebuilds of the same file.
                string timeText = p.When.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
                m.Fingerprint = Fingerprints.Of(timeText, p.App, p.Host, p.Body);
                metas.Add(m);
            }
            return metas;
        }

        /// <summary>Return just the body of the entry at the given append ordinal.</summary>
        internal static string ReadBody(string fileText, int ordinal) {
            if (ordinal < 0) return null;
            List<ParsedEntry> all = Parse(null, fileText); // When is irrelevant here
            if (ordinal < all.Count) return all[ordinal].Body;
            return null;
        }

        /// <summary>Extract the "yyyy-MM-dd" day key from a capture file name.</summary>
        internal static bool TryDayKeyFromFileName(string name, out string dayKey) {
            dayKey = null;
            if (string.IsNullOrEmpty(name)) return false;

            string baseName = name;
            int slash = baseName.LastIndexOfAny(new char[] { '/', '\\' });
            if (slash >= 0) baseName = baseName.Substring(slash + 1);
            if (baseName.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                baseName = baseName.Substring(0, baseName.Length - 3);

            DateTime d;
            if (DateTime.TryParseExact(baseName, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                                       DateTimeStyles.None, out d)) {
                dayKey = baseName;
                return true;
            }
            return false;
        }

        // ---- helpers --------------------------------------------------------

        static string MakeEntryId(string dayKey, int ordinal) {
            string key = string.IsNullOrEmpty(dayKey) ? "?" : dayKey;
            return key + "#" + ordinal.ToString(CultureInfo.InvariantCulture);
        }

        // field2 is "host" or "host/path/tail"; host is up to the first '/', the
        // remainder (keeping its leading '/') is the path tail.
        static void SplitHostPath(string field, out string host, out string pathTail) {
            host = null;
            pathTail = null;
            if (string.IsNullOrEmpty(field)) return;
            int slash = field.IndexOf('/');
            if (slash < 0) {
                host = field;
            } else {
                host = field.Substring(0, slash);
                pathTail = field.Substring(slash);
            }
            if (host != null && host.Length == 0) host = null;
            if (pathTail != null && pathTail.Length == 0) pathTail = null;
        }

        static DateTime CombineWhen(string dayKey, string timeText) {
            DateTime when;
            if (!string.IsNullOrEmpty(dayKey) && !string.IsNullOrEmpty(timeText)) {
                if (DateTime.TryParseExact(dayKey + " " + timeText, "yyyy-MM-dd HH:mm:ss",
                                           CultureInfo.InvariantCulture, DateTimeStyles.None, out when))
                    return when;
            }
            // Degrade gracefully: keep the correct date even if the time is bad,
            // so Newest/Oldest sorting still groups the day sensibly.
            DateTime day;
            if (!string.IsNullOrEmpty(dayKey) &&
                DateTime.TryParseExact(dayKey, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                                       DateTimeStyles.None, out day)) {
                TimeSpan t;
                if (!string.IsNullOrEmpty(timeText) &&
                    TimeSpan.TryParse(timeText, CultureInfo.InvariantCulture, out t) &&
                    t >= TimeSpan.Zero && t < TimeSpan.FromDays(1))
                    return day.Add(t);
                return day;
            }
            return DateTime.MinValue;
        }

        // An opening fence is 3+ backticks followed by exactly the "text" info
        // string. On success, run receives the backtick run (no info string),
        // which is what the matching closing fence must equal exactly.
        static bool TryOpeningFence(string line, out string run) {
            run = null;
            if (line == null) return false;
            int n = 0;
            while (n < line.Length && line[n] == '`') n++;
            if (n < 3) return false;
            if (line.Length - n != FenceInfo.Length) return false;
            if (line.Substring(n) != FenceInfo) return false;
            run = line.Substring(0, n);
            return true;
        }

        // First ~200 characters of the body, collapsed to a single line.
        static string Preview(string body) {
            if (string.IsNullOrEmpty(body)) return "";
            var sb = new StringBuilder();
            bool lastSpace = true; // suppress any leading whitespace
            for (int idx = 0; idx < body.Length; idx++) {
                char c = body[idx];
                if (char.IsWhiteSpace(c)) {
                    if (!lastSpace) { sb.Append(' '); lastSpace = true; }
                } else {
                    sb.Append(c);
                    lastSpace = false;
                }
                if (sb.Length > PreviewMax + 4) break; // enough to detect overflow
            }
            string s = sb.ToString();
            if (s.Length > 0 && s[s.Length - 1] == ' ') s = s.Substring(0, s.Length - 1);
            if (s.Length > PreviewMax) s = s.Substring(0, PreviewMax) + Ellipsis;
            return s;
        }

        static string TrimCr(string line) {
            if (line == null) return "";
            int len = line.Length;
            if (len > 0 && line[len - 1] == '\r') return line.Substring(0, len - 1);
            return line;
        }
    }
}
