// Persists the ONLY derived, human-driven state for captured entries:
// pinned / soft-deleted / open-count. It lives in a tiny sidecar TSV next to
// the index so the immutable daily Markdown evidence files are never edited —
// that separation is a core product guardrail. The overlay is self-healing: a
// missing, truncated or hand-mangled file only loses pins and soft-deletes;
// the captured text itself is never touched or at risk.
//
// File: <indexDir>/overlay.tsv, one line per entry that has NON-default state.
// Columns (tab-separated):  entryId  pinned(0/1)  deletedAtIso|'-'  openCount  fingerprint
//
// No prompt bodies, titles, hosts, paths or secrets are ever written here —
// only an opaque entry id, three small flags and the entry's content fingerprint.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace TypingRecorder {

    internal static class CaptureOverlayStore {

        const string FileName = "overlay.tsv";
        const string TempName = "overlay.tmp";
        const string Null = "-"; // sentinel for "no deletedAt" / "no fingerprint"

        static readonly object Gate = new object();

        /// <summary>Load the overlay. Returns an empty map when the file is absent
        /// or unreadable; parse errors drop only the offending row.</summary>
        internal static Dictionary<string, EntryState> Load(string indexDir) {
            var map = new Dictionary<string, EntryState>(StringComparer.Ordinal);
            lock (Gate) {
                try {
                    if (string.IsNullOrEmpty(indexDir)) return map;
                    string path = Path.Combine(indexDir, FileName);
                    if (!File.Exists(path)) return map;
                    string[] lines = File.ReadAllLines(path, Encoding.UTF8);
                    for (int i = 0; i < lines.Length; i++) {
                        EntryState state;
                        string id = TryParseLine(lines[i], out state);
                        if (id != null) map[id] = state;
                    }
                } catch {
                    // A damaged overlay must never block the library; keep whatever parsed.
                }
            }
            return map;
        }

        /// <summary>Atomically rewrite the overlay. Only entries with non-default
        /// state are emitted, so the file stays small. A failed write loses at most
        /// this round of pins/soft-deletes, never any captured evidence.</summary>
        internal static void Save(string indexDir, IDictionary<string, EntryState> state) {
            lock (Gate) {
                try {
                    if (string.IsNullOrEmpty(indexDir)) return;
                    Directory.CreateDirectory(indexDir);
                    string final = Path.Combine(indexDir, FileName);
                    string temp = Path.Combine(indexDir, TempName);

                    var sb = new StringBuilder();
                    if (state != null) {
                        foreach (KeyValuePair<string, EntryState> kv in state) {
                            string line = FormatLine(kv.Key, kv.Value);
                            if (line != null) sb.Append(line).Append('\n');
                        }
                    }

                    File.WriteAllText(temp, sb.ToString(), new UTF8Encoding(false));
                    ReplaceFile(temp, final);
                } catch {
                    // Losing one overlay write only loses pins/soft-deletes, never evidence.
                }
            }
        }

        // -- formatting --------------------------------------------------------

        // Returns the encoded line, or null when the entry carries no state worth
        // persisting (or its id would corrupt the row layout).
        static string FormatLine(string entryId, EntryState st) {
            if (st == null) return null;
            if (string.IsNullOrEmpty(entryId)) return null;
            if (HasSeparator(entryId)) return null; // never let an id break the TSV grid
            bool deleted = st.DeletedAt.HasValue;
            if (!st.Pinned && !deleted && st.OpenCount <= 0) return null; // default: nothing to store

            string del = deleted
                ? st.DeletedAt.Value.ToString("o", CultureInfo.InvariantCulture)
                : Null;
            string fp = st.Fingerprint;
            if (string.IsNullOrEmpty(fp) || HasSeparator(fp)) fp = Null;

            var sb = new StringBuilder();
            sb.Append(entryId).Append('\t');
            sb.Append(st.Pinned ? '1' : '0').Append('\t');
            sb.Append(del).Append('\t');
            sb.Append(st.OpenCount.ToString(CultureInfo.InvariantCulture)).Append('\t');
            sb.Append(fp);
            return sb.ToString();
        }

        // Returns the entry id on success (with 'state' set), or null to skip the row.
        static string TryParseLine(string line, out EntryState state) {
            state = null;
            if (string.IsNullOrEmpty(line)) return null;
            string[] p = line.Split('\t');
            if (p.Length != 5) return null;
            string id = p[0];
            if (string.IsNullOrEmpty(id)) return null;

            var st = new EntryState();
            st.Pinned = (p[1] == "1");

            if (p[2] != Null && p[2].Length > 0) {
                DateTime when;
                if (DateTime.TryParse(p[2], CultureInfo.InvariantCulture,
                        DateTimeStyles.RoundtripKind, out when))
                    st.DeletedAt = when;
                else
                    st.DeletedAt = null;
            } else {
                st.DeletedAt = null;
            }

            int open;
            if (int.TryParse(p[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out open) && open > 0)
                st.OpenCount = open;
            else
                st.OpenCount = 0;

            st.Fingerprint = (p[4] == Null || p[4].Length == 0) ? null : p[4];

            // Drop rows that encode no real state (e.g. a hand-edited file).
            if (!st.Pinned && !st.DeletedAt.HasValue && st.OpenCount <= 0) return null;

            state = st;
            return id;
        }

        static bool HasSeparator(string s) {
            return s.IndexOf('\t') >= 0 || s.IndexOf('\n') >= 0 || s.IndexOf('\r') >= 0;
        }

        // Prefer an atomic in-place replace; fall back to delete+move when Replace
        // is unavailable (e.g. first write, or a temp dir on another volume).
        static void ReplaceFile(string temp, string final) {
            if (File.Exists(final)) {
                try {
                    File.Replace(temp, final, null);
                    return;
                } catch {
                    // Fall through to delete + move.
                }
                try { File.Delete(final); } catch { }
            }
            File.Move(temp, final);
        }
    }
}
