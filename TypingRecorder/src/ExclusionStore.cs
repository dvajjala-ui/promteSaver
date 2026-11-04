// Holds and persists the user's ADDITIVE exclusions — apps and websites the
// user chose never to record — layered on top of the built-in secret exclusions
// that GlobalKeyboardCapture already enforces at the producer. This store never
// sees or writes any captured text; it only keeps two small allow-lists of
// process names and website hosts.
//
// Hot-path safety: the state is two immutable HashSets wrapped in one immutable
// Snapshot held behind a single 'volatile' reference. IsAppExcluded / IsSiteExcluded
// read that reference once and consult the frozen sets with NO lock, so they are
// safe to call from GlobalKeyboardCapture.ProcessKey (the keyboard hook thread)
// and from the capture/clipboard path without blocking typing. Mutations are rare
// (the user clicking in the Exclusions dialog): they take a gate lock, build a new
// Snapshot, swap the volatile reference, persist, and then raise Changed.
//
// Persistence is a human-readable, hand-editable text file next to the daily
// captures (MarkdownStore.DataRoot\exclusions.txt). It is best-effort and
// self-healing: a missing or corrupt file simply yields an empty set.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace TypingRecorder {

    /// <summary>
    /// Thread-safe, lock-free-read store of the user's additive per-app and
    /// per-site capture exclusions. Reads are callable from the keyboard hook
    /// thread; mutations serialize behind a gate lock and persist to disk.
    /// </summary>
    internal sealed class ExclusionStore {

        const string FileName = "exclusions.txt";
        const string TempName = "exclusions.tmp";
        const int MaxEntries = 512; // bound each list so a corrupt/huge file can't exhaust memory

        // Built-in secret/credential processes that GlobalKeyboardCapture blocks at
        // the producer. Exposed here ONLY for the UI's read-only transparency view
        // (BuiltInApps); IsAppExcluded does not consult this list because these
        // apps are already excluded before any chunk is ever emitted.
        //
        // NOTE FOR INTEGRATOR: this array is a hand-kept copy of
        // GlobalKeyboardCapture.BlockedProcesses (that HashSet is private and
        // cannot be enumerated from here). Keep the two in lockstep. The clean
        // long-term fix is a shared accessor, e.g.
        //   internal static string[] GlobalKeyboardCapture.BuiltInBlocked()
        // and then BuiltInApps() delegating to it. Until that exists, update both.
        static readonly string[] BuiltIn = new string[] {
            "credentialuibroker", "credentialui", "logonui", "consent", "lsass", "securityhealthsystray",
            "applicationframehost", "svchost", "systemsettings", "textinputhost", "lockapp",
            "1password", "bitwarden", "keepass", "keepassxc", "lastpass", "dashlane",
            "nordpass", "protonpass", "enpass", "roboform"
        };

        // One immutable, frozen view of both exclusion lists. Never mutated after
        // construction, so it can be shared across threads without a lock.
        sealed class Snapshot {
            internal readonly HashSet<string> Apps;   // normalized process names (no ".exe")
            internal readonly HashSet<string> Sites;  // normalized website hosts
            internal readonly string[] AppList;       // sorted copy, for the Apps property
            internal readonly string[] SiteList;      // sorted copy, for the Sites property

            internal Snapshot(HashSet<string> apps, HashSet<string> sites) {
                Apps = apps;
                Sites = sites;
                AppList = ToSortedArray(apps);
                SiteList = ToSortedArray(sites);
            }

            static string[] ToSortedArray(HashSet<string> set) {
                string[] arr = new string[set.Count];
                set.CopyTo(arr);
                Array.Sort(arr, StringComparer.Ordinal);
                return arr;
            }
        }

        readonly object gate = new object();   // serializes mutations + file writes
        volatile Snapshot current;             // the live frozen view (read lock-free)

        /// <summary>Raised after an exclusion list actually changes. Fired on the
        /// thread that performed the mutation, outside the gate lock.</summary>
        internal event Action Changed;

        internal ExclusionStore() {
            // Load once at construction. Never throws: a missing or corrupt file
            // starts the store empty.
            current = Load();
        }

        // -- lock-free reads (safe from the keyboard hook thread) --------------

        /// <summary>True when the user has excluded this app. Built-in secret
        /// processes are NOT consulted here — they are blocked earlier, in
        /// GlobalKeyboardCapture, before any text is read.</summary>
        internal bool IsAppExcluded(string processName) {
            string n = NormalizeApp(processName);
            if (n == null) return false;
            Snapshot snap = current;            // single volatile read of a frozen view
            return snap.Apps.Contains(n);       // O(1)
        }

        /// <summary>True when the user has excluded this website host or a parent
        /// of it. Equivalent to "host == rule OR host endsWith '.'+rule": a rule
        /// like "bank.com" also covers "secure.bank.com". Implemented as a walk of
        /// the host's label-boundary suffixes, so it is a handful of O(1) hash
        /// lookups regardless of how many rules exist.</summary>
        internal bool IsSiteExcluded(string host) {
            string h = NormalizeSite(host);
            if (h == null) return false;
            Snapshot snap = current;            // single volatile read of a frozen view
            HashSet<string> sites = snap.Sites;
            if (sites.Count == 0) return false;
            if (sites.Contains(h)) return true;                 // exact host == rule
            int dot = h.IndexOf('.');
            while (dot >= 0 && dot + 1 < h.Length) {            // each parent domain
                if (sites.Contains(h.Substring(dot + 1))) return true;
                dot = h.IndexOf('.', dot + 1);
            }
            return false;
        }

        /// <summary>A sorted snapshot copy of the user's excluded apps (safe to
        /// keep and mutate; never aliases the live set).</summary>
        internal string[] Apps {
            get { Snapshot snap = current; return (string[])snap.AppList.Clone(); }
        }

        /// <summary>A sorted snapshot copy of the user's excluded sites (safe to
        /// keep and mutate; never aliases the live set).</summary>
        internal string[] Sites {
            get { Snapshot snap = current; return (string[])snap.SiteList.Clone(); }
        }

        // -- mutations (serialized behind the gate lock) -----------------------

        internal void AddApp(string processName) {
            string n = NormalizeApp(processName);
            if (n == null) return;
            bool changed = false;
            lock (gate) {
                Snapshot cur = current;
                if (!cur.Apps.Contains(n) && cur.Apps.Count < MaxEntries) {
                    HashSet<string> apps = Clone(cur.Apps);
                    apps.Add(n);
                    Commit(apps, cur.Sites);   // sites unchanged: reuse the frozen set
                    changed = true;
                }
            }
            if (changed) RaiseChanged();
        }

        internal void RemoveApp(string processName) {
            string n = NormalizeApp(processName);
            if (n == null) return;
            bool changed = false;
            lock (gate) {
                Snapshot cur = current;
                if (cur.Apps.Contains(n)) {
                    HashSet<string> apps = Clone(cur.Apps);
                    apps.Remove(n);
                    Commit(apps, cur.Sites);
                    changed = true;
                }
            }
            if (changed) RaiseChanged();
        }

        internal void AddSite(string host) {
            string h = NormalizeSite(host);
            if (h == null) return;
            bool changed = false;
            lock (gate) {
                Snapshot cur = current;
                if (!cur.Sites.Contains(h) && cur.Sites.Count < MaxEntries) {
                    HashSet<string> sites = Clone(cur.Sites);
                    sites.Add(h);
                    Commit(cur.Apps, sites);   // apps unchanged: reuse the frozen set
                    changed = true;
                }
            }
            if (changed) RaiseChanged();
        }

        internal void RemoveSite(string host) {
            string h = NormalizeSite(host);
            if (h == null) return;
            bool changed = false;
            lock (gate) {
                Snapshot cur = current;
                if (cur.Sites.Contains(h)) {
                    HashSet<string> sites = Clone(cur.Sites);
                    sites.Remove(h);
                    Commit(cur.Apps, sites);
                    changed = true;
                }
            }
            if (changed) RaiseChanged();
        }

        /// <summary>A copy of the built-in, always-excluded secret/credential app
        /// list, for the UI's read-only transparency view.</summary>
        internal static string[] BuiltInApps() {
            return (string[])BuiltIn.Clone();
        }

        // -- internals ---------------------------------------------------------

        // Swap in a new frozen view and persist it. MUST be called holding 'gate'.
        void Commit(HashSet<string> apps, HashSet<string> sites) {
            Snapshot snap = new Snapshot(apps, sites);
            current = snap;     // publish: subsequent volatile reads see the full view
            Persist(snap);      // best-effort; a disk error keeps the in-memory state
        }

        void RaiseChanged() {
            Action h = Changed;
            if (h != null) h();
        }

        static HashSet<string> Clone(HashSet<string> set) {
            return new HashSet<string>(set, StringComparer.Ordinal);
        }

        // -- normalization -----------------------------------------------------

        // App: trim, lower-case, strip a trailing ".exe". Returns null for empty
        // or line-breaking input (so it can never be stored or corrupt the file).
        static string NormalizeApp(string s) {
            if (s == null) return null;
            string n = s.Trim();
            if (n.Length == 0) return null;
            n = n.ToLowerInvariant();
            if (n.EndsWith(".exe", StringComparison.Ordinal))
                n = n.Substring(0, n.Length - 4);
            n = n.Trim();
            if (n.Length == 0) return null;
            if (HasLineBreak(n)) return null;
            return n;
        }

        // Site: trim, lower-case, and reduce a forgiving input (a pasted URL,
        // host:port, trailing dots) down to a bare host. Returns null for empty
        // or line-breaking input. The incoming host from the monitor is already a
        // bare host, so the URL/port stripping is a no-op on the read path.
        static string NormalizeSite(string s) {
            if (s == null) return null;
            string n = s.Trim();
            if (n.Length == 0) return null;
            n = n.ToLowerInvariant();
            if (n.StartsWith("http://", StringComparison.Ordinal)) n = n.Substring(7);
            else if (n.StartsWith("https://", StringComparison.Ordinal)) n = n.Substring(8);
            int slash = n.IndexOf('/');
            if (slash >= 0) n = n.Substring(0, slash);    // drop any path/query
            int colon = n.IndexOf(':');
            if (colon >= 0) n = n.Substring(0, colon);    // drop any :port
            // strip leading/trailing dots so ".bank.com." -> "bank.com"
            int start = 0, end = n.Length;
            while (start < end && n[start] == '.') start++;
            while (end > start && n[end - 1] == '.') end--;
            n = n.Substring(start, end - start);
            if (n.Length == 0) return null;
            if (HasLineBreak(n)) return null;
            return n;
        }

        static bool HasLineBreak(string s) {
            return s.IndexOf('\n') >= 0 || s.IndexOf('\r') >= 0;
        }

        // -- persistence -------------------------------------------------------

        // Rebuild the store from exclusions.txt. Never throws; a missing or
        // unreadable file yields an empty store. Blank lines and '#' comments are
        // ignored; each list is capped at MaxEntries.
        static Snapshot Load() {
            HashSet<string> apps = new HashSet<string>(StringComparer.Ordinal);
            HashSet<string> sites = new HashSet<string>(StringComparer.Ordinal);
            try {
                string path = Path.Combine(MarkdownStore.DataRoot, FileName);
                if (File.Exists(path)) {
                    string[] lines = File.ReadAllLines(path, Encoding.UTF8);
                    for (int i = 0; i < lines.Length; i++) {
                        string raw = lines[i];
                        if (raw == null) continue;
                        string line = raw.Trim();
                        if (line.Length == 0 || line[0] == '#') continue;
                        if (line.StartsWith("app:", StringComparison.OrdinalIgnoreCase)) {
                            if (apps.Count >= MaxEntries) continue;
                            string v = NormalizeApp(line.Substring(4));
                            if (v != null) apps.Add(v);
                        } else if (line.StartsWith("site:", StringComparison.OrdinalIgnoreCase)) {
                            if (sites.Count >= MaxEntries) continue;
                            string v = NormalizeSite(line.Substring(5));
                            if (v != null) sites.Add(v);
                        }
                        // any other line (unknown prefix) is ignored
                    }
                }
            } catch {
                // Corrupt or unreadable file: start empty rather than fail construction.
                apps = new HashSet<string>(StringComparer.Ordinal);
                sites = new HashSet<string>(StringComparer.Ordinal);
            }
            return new Snapshot(apps, sites);
        }

        // Atomically rewrite exclusions.txt from a frozen snapshot. Best-effort:
        // a failed write only loses this round of edits, never any captured text
        // (none is stored here) and never the in-memory state. Called under 'gate'.
        static void Persist(Snapshot snap) {
            try {
                string root = MarkdownStore.DataRoot;
                Directory.CreateDirectory(root);
                string final = Path.Combine(root, FileName);
                string temp = Path.Combine(root, TempName);

                StringBuilder sb = new StringBuilder();
                sb.Append("# TypingRecorder exclusions\n");
                sb.Append("# Apps and websites you chose never to record. Lines starting with # are ignored.\n");
                sb.Append("# Format:  app: <process>   or   site: <host>\n");
                string[] appList = snap.AppList;
                for (int i = 0; i < appList.Length; i++) {
                    if (!HasLineBreak(appList[i])) sb.Append("app: ").Append(appList[i]).Append('\n');
                }
                string[] siteList = snap.SiteList;
                for (int i = 0; i < siteList.Length; i++) {
                    if (!HasLineBreak(siteList[i])) sb.Append("site: ").Append(siteList[i]).Append('\n');
                }

                File.WriteAllText(temp, sb.ToString(), new UTF8Encoding(false));
                ReplaceFile(temp, final);
            } catch {
                // Never let a disk error reach the UI thread or the capture path.
            }
        }

        // Prefer an atomic in-place replace; fall back to delete+move on the first
        // write or when Replace is unavailable (e.g. a temp dir on another volume).
        static void ReplaceFile(string temp, string final) {
            if (File.Exists(final)) {
                try {
                    File.Replace(temp, final, null);
                    return;
                } catch {
                    // fall through to delete + move
                }
                try { File.Delete(final); } catch { }
            }
            File.Move(temp, final);
        }
    }
}
