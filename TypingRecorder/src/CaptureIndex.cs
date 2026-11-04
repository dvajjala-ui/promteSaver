// The thread-safe library engine behind the Library tab.
//
// CaptureIndex builds a derived, in-memory index from the daily capture .md
// files (produced by MarkdownStore / CaptureWriter), answers filtered, sorted
// and grouped queries, lazily loads bodies, and applies an encrypted "overlay"
// of per-entry user actions (pin / soft-delete / restore / open / purge) that
// lives apart from the immutable captured evidence. The .md files are never
// rewritten by this class; pins and deletions only ever touch the overlay.
//
// Threading model (see PLAN / spec):
//   * All shared state is guarded by one lock (gate).
//   * Day arrays are published copy-on-write: a refresh builds a brand-new
//     EntryMeta[] for a day and swaps the reference; existing readers keep a
//     consistent old snapshot. EntryMeta instances are treated as immutable.
//   * The overlay dictionary is also copy-on-write: a mutation clones the dict
//     (and the one EntryState it edits) and swaps the field, so a lock-free
//     reader that captured the old reference is never torn.
//   * Query() snapshots the ordered day arrays + the overlay reference under
//     the lock, releases it, then evaluates lock-free.
//   * Refreshes are debounced onto a System.Threading.Timer; overlay saves are
//     debounced onto a second timer. IndexChanged is raised for the host
//     (LibraryPanel) to marshal to the UI thread.
//
// INTEGRATOR NOTES (shapes the sibling CaptureQuery.cs must agree with — these
// fields were NOT spelled out in interfaces.txt and are inferred from the spec):
//   CaptureQuery : string Text, App, Host, DayKey, Via; bool AiOnly, PinnedOnly,
//                  Trash; SortMode Sort; GroupMode Group; int MaxResults.
//   Facets       : Dictionary<string,int> Apps, Sites, Days; int Ai, Pinned,
//                  Trash, Total.   (dictionaries chosen to add no extra type.)
//   QueryResult  : List<Row> Rows; int Total; bool Truncated.   (per interfaces)
//   Row          : bool IsHeader; string HeaderLabel; int HeaderCount;
//                  EntryMeta Entry; EntryState State.            (per interfaces)
// All of the above are assumed to expose public, settable members and a
// parameterless constructor. If the real definitions differ, only the small,
// clearly marked construction/read sites below need adjusting.
//
// Purge tombstone (the spec's "open question"): EntryState has no Purged flag
// and CaptureOverlayStore only persists EntryState, so a purge is encoded as an
// EntryState whose DeletedAt == DateTime.MinValue. A normal soft-delete uses
// DateTime.Now and never collides with that sentinel. A purged entry is hidden
// from every view and from facets; the .md evidence is left untouched.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace TypingRecorder {

    internal sealed class CaptureIndex : IDisposable {

        // ---- configuration ------------------------------------------------
        const int DefaultMaxResults = 5000;
        const int HardMaxResults = 100000;   // mirrors the ported BoundedTopK cap
        const int RefreshDebounceMs = 400;
        const int SaveDebounceMs = 600;

        // Ported recall tokenizer: letter then two-plus letter/mark/number runs,
        // so Telugu/Hindi vowel signs and combining marks stay inside the word.
        static readonly Regex TermRx =
            new Regex("\\p{L}[\\p{L}\\p{M}\\p{N}]{2,}", RegexOptions.CultureInvariant);

        // Ported stopword set (archive.ts recallLibrary).
        static readonly HashSet<string> Stop = new HashSet<string>(StringComparer.Ordinal) {
            "about","after","again","also","another","before","could","from","have",
            "into","need","only","please","prompt","project","should","some","that",
            "them","there","these","this","using","want","what","when","where","which",
            "with","would","your"
        };

        // Scoring weights: metadata fields are high, body is 1 (spec). Exact
        // values are not load-bearing; only "metadata >> body" matters.
        const double WTitle = 8.0;
        const double WHost = 6.0;
        const double WApp = 5.0;
        const double WVia = 3.0;
        const double WBody = 1.0;

        static readonly DateTime PurgeTombstone = DateTime.MinValue;

        // ---- shared state (guarded by gate) -------------------------------
        readonly object gate = new object();
        readonly string captureDir;
        readonly string indexDir;

        Dictionary<string, EntryMeta[]> byDay;      // dayKey -> immutable array
        List<string> days;                          // dayKeys, newest first
        Dictionary<string, EntryMeta> byId;         // entryId -> meta (mutations)
        Dictionary<string, EntryState> overlay;     // entryId -> state (COW)
        Facets cachedFacets;
        readonly HashSet<string> dirtyDays = new HashSet<string>(StringComparer.Ordinal);
        int version;
        volatile bool isBuilding;
        bool disposed;

        readonly Timer refreshTimer;
        readonly Timer saveTimer;

        internal event EventHandler IndexChanged;

        internal CaptureIndex(string captureDir, string indexDir) {
            this.captureDir = string.IsNullOrEmpty(captureDir) ? MarkdownStore.CaptureDir : captureDir;
            this.indexDir = indexDir;

            byDay = new Dictionary<string, EntryMeta[]>(StringComparer.Ordinal);
            days = new List<string>();
            byId = new Dictionary<string, EntryMeta>(StringComparer.Ordinal);

            Dictionary<string, EntryState> loaded = null;
            try { loaded = CaptureOverlayStore.Load(indexDir); } catch { loaded = null; }
            overlay = (loaded != null)
                ? new Dictionary<string, EntryState>(loaded, StringComparer.Ordinal)
                : new Dictionary<string, EntryState>(StringComparer.Ordinal);

            refreshTimer = new Timer(new TimerCallback(OnRefreshTimer), null, Timeout.Infinite, Timeout.Infinite);
            saveTimer = new Timer(new TimerCallback(OnSaveTimer), null, Timeout.Infinite, Timeout.Infinite);
        }

        internal bool IsBuilding { get { return isBuilding; } }

        // ---- build / refresh ---------------------------------------------

        internal void BeginBuild() {
            lock (gate) { if (disposed) return; }
            isBuilding = true;
            Thread t = new Thread(new ThreadStart(BuildThread));
            t.IsBackground = true;
            t.Name = "CaptureIndexBuild";
            t.Start();
        }

        void BuildThread() {
            try { RebuildCore(); } catch { }
            finally { isBuilding = false; }
            RaiseIndexChanged();
        }

        internal void Rebuild() {
            isBuilding = true;
            try { RebuildCore(); } catch { }
            finally { isBuilding = false; }
            RaiseIndexChanged();
        }

        // Full enumeration of every capture file, then an atomic publish.
        void RebuildCore() {
            Dictionary<string, EntryMeta[]> newByDay = new Dictionary<string, EntryMeta[]>(StringComparer.Ordinal);
            List<string> newDays = new List<string>();

            List<CaptureFile> files = null;
            try { files = MarkdownStore.ListFiles(); } catch { files = null; }
            if (files != null) {
                foreach (CaptureFile f in files) {
                    if (f == null) continue;
                    string dayKey;
                    if (!CaptureParser.TryDayKeyFromFileName(f.Name, out dayKey) || string.IsNullOrEmpty(dayKey))
                        dayKey = StripMd(f.Name);
                    if (string.IsNullOrEmpty(dayKey) || newByDay.ContainsKey(dayKey)) continue;
                    EntryMeta[] arr;
                    try {
                        string text = MarkdownStore.Read(f.Path);
                        List<ParsedEntry> parsed = CaptureParser.Parse(dayKey, text);
                        List<EntryMeta> metas = CaptureParser.ToMeta(dayKey, parsed);
                        arr = (metas == null) ? new EntryMeta[0] : metas.ToArray();
                    } catch { continue; }
                    newByDay[dayKey] = arr;
                    newDays.Add(dayKey);
                }
            }
            newDays.Sort(StringComparer.Ordinal);
            newDays.Reverse(); // newest day first

            lock (gate) {
                if (disposed) return;
                byDay = newByDay;
                days = newDays;
                RebuildByIdLocked();
                ReconcileOverlayLocked();
                version++;
                cachedFacets = null;
            }
            ScheduleOverlaySave();
        }

        internal void NotifyWrite(DateTime whenLocal) {
            string dayKey = whenLocal.ToString("yyyy-MM-dd");
            lock (gate) {
                if (disposed) return;
                dirtyDays.Add(dayKey);
            }
            try { refreshTimer.Change(RefreshDebounceMs, Timeout.Infinite); } catch { }
        }

        void OnRefreshTimer(object state) {
            string[] dirty;
            lock (gate) {
                if (disposed) return;
                if (dirtyDays.Count == 0) return;
                dirty = new string[dirtyDays.Count];
                dirtyDays.CopyTo(dirty);
                dirtyDays.Clear();
            }
            for (int i = 0; i < dirty.Length; i++) RefreshDay(dirty[i]);
            RaiseIndexChanged();
        }

        internal void RefreshToday() {
            RefreshDay(DateTime.Now.ToString("yyyy-MM-dd"));
            RaiseIndexChanged();
        }

        // Rebuilds exactly one day's array and swaps it in (copy-on-write). The
        // overlay is reconciled against current fingerprints only on a full
        // Rebuild(); a stale overlay record left here is ignored at query time.
        void RefreshDay(string dayKey) {
            if (string.IsNullOrEmpty(dayKey)) return;
            lock (gate) {
                if (disposed) return;
                EntryMeta[] metas = LoadDay(dayKey);
                EntryMeta[] old;
                byDay.TryGetValue(dayKey, out old);

                if (old != null) {
                    foreach (EntryMeta e in old) {
                        if (e == null || string.IsNullOrEmpty(e.EntryId)) continue;
                        EntryMeta cur;
                        if (byId.TryGetValue(e.EntryId, out cur) && cur != null &&
                            string.Equals(cur.DayKey, dayKey, StringComparison.Ordinal))
                            byId.Remove(e.EntryId);
                    }
                }

                if (metas == null || metas.Length == 0) {
                    byDay.Remove(dayKey);
                    days.Remove(dayKey);
                } else {
                    byDay[dayKey] = metas;
                    if (!days.Contains(dayKey)) {
                        days.Add(dayKey);
                        days.Sort(StringComparer.Ordinal);
                        days.Reverse();
                    }
                    foreach (EntryMeta e in metas)
                        if (e != null && !string.IsNullOrEmpty(e.EntryId)) byId[e.EntryId] = e;
                }
                version++;
                cachedFacets = null;
            }
        }

        EntryMeta[] LoadDay(string dayKey) {
            try {
                string path = PathForDay(dayKey);
                if (!File.Exists(path)) return new EntryMeta[0];
                string text = MarkdownStore.Read(path);
                List<ParsedEntry> parsed = CaptureParser.Parse(dayKey, text);
                List<EntryMeta> metas = CaptureParser.ToMeta(dayKey, parsed);
                return (metas == null) ? new EntryMeta[0] : metas.ToArray();
            } catch { return new EntryMeta[0]; }
        }

        void RebuildByIdLocked() {
            byId = new Dictionary<string, EntryMeta>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, EntryMeta[]> kv in byDay) {
                EntryMeta[] arr = kv.Value;
                if (arr == null) continue;
                foreach (EntryMeta e in arr)
                    if (e != null && !string.IsNullOrEmpty(e.EntryId)) byId[e.EntryId] = e;
            }
        }

        // Fingerprint-first attach with ordinal fallback and a fail-safe drop:
        // a record whose entry was hand-edited (fingerprint no longer matches)
        // is dropped so a stale pin/delete cannot mis-apply; a record whose
        // entry merely shifted ordinal is re-homed by fingerprint.
        void ReconcileOverlayLocked() {
            if (overlay == null || overlay.Count == 0) return;

            Dictionary<string, string> fpToId = new Dictionary<string, string>(StringComparer.Ordinal);
            HashSet<string> dupFp = new HashSet<string>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, EntryMeta[]> kv in byDay) {
                EntryMeta[] arr = kv.Value;
                if (arr == null) continue;
                foreach (EntryMeta e in arr) {
                    if (e == null || string.IsNullOrEmpty(e.Fingerprint)) continue;
                    if (fpToId.ContainsKey(e.Fingerprint)) dupFp.Add(e.Fingerprint);
                    else fpToId[e.Fingerprint] = e.EntryId;
                }
            }

            Dictionary<string, EntryState> next = new Dictionary<string, EntryState>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, EntryState> kv in overlay) {
                string id = kv.Key;
                EntryState st = kv.Value;
                if (st == null) continue;

                EntryMeta m;
                bool haveId = byId.TryGetValue(id, out m) && m != null;
                bool fpMatch = haveId && (string.IsNullOrEmpty(st.Fingerprint) ||
                    string.Equals(st.Fingerprint, m.Fingerprint, StringComparison.Ordinal));

                if (fpMatch) {
                    EntryState keep = CloneState(st);
                    if (string.IsNullOrEmpty(keep.Fingerprint)) keep.Fingerprint = m.Fingerprint;
                    next[id] = keep;
                } else if (!string.IsNullOrEmpty(st.Fingerprint) && !dupFp.Contains(st.Fingerprint)) {
                    string newId;
                    if (fpToId.TryGetValue(st.Fingerprint, out newId))
                        next[newId] = CloneState(st);     // re-home across ordinal shift
                    // else: vanished entry -> drop
                }
                // else: hand-edited (fingerprint changed) -> drop (fail-safe)
            }
            overlay = next;
        }

        // ---- queries ------------------------------------------------------

        internal QueryResult Query(CaptureQuery q) {
            QueryResult empty = new QueryResult();
            empty.Rows = new List<Row>();
            empty.Total = 0;
            empty.Truncated = false;
            if (q == null) return empty;

            // Snapshot the ordered day arrays + overlay reference under the lock,
            // then evaluate lock-free.
            string[] dayKeys;
            EntryMeta[][] dayArrays;
            Dictionary<string, EntryState> ov;
            lock (gate) {
                dayKeys = days.ToArray();
                dayArrays = new EntryMeta[dayKeys.Length][];
                for (int i = 0; i < dayKeys.Length; i++) {
                    EntryMeta[] a;
                    byDay.TryGetValue(dayKeys[i], out a);
                    dayArrays[i] = a;
                }
                ov = overlay;
            }

            int cap = q.MaxResults;
            if (cap <= 0) cap = DefaultMaxResults;
            if (cap > HardMaxResults) cap = HardMaxResults;

            bool textMode = !string.IsNullOrEmpty(q.Text);
            List<string> terms = textMode ? Tokenize(q.Text) : new List<string>();
            Comparison<Candidate> cmp = ComparerFor(q.Sort);
            BoundedTopK<Candidate> heap = new BoundedTopK<Candidate>(cap, cmp);
            int total = 0;

            for (int d = 0; d < dayArrays.Length; d++) {
                EntryMeta[] arr = dayArrays[d];
                if (arr == null || arr.Length == 0) continue;

                if (!textMode) {
                    foreach (EntryMeta e in arr) {
                        if (e == null) continue;
                        EntryState st = ResolveFrom(ov, e);
                        if (!Passes(e, st, q)) continue;
                        total++;
                        heap.Add(new Candidate(e, st, 0.0));
                    }
                    continue;
                }

                // Text mode: collect the day's metadata-passing entries, then
                // read + parse that one day file once to score against bodies.
                List<Candidate> dayPass = new List<Candidate>();
                foreach (EntryMeta e in arr) {
                    if (e == null) continue;
                    EntryState st = ResolveFrom(ov, e);
                    if (!Passes(e, st, q)) continue;
                    dayPass.Add(new Candidate(e, st, 0.0));
                }
                if (dayPass.Count == 0) continue;

                Dictionary<int, string> bodies = ReadBodies(dayKeys[d]);
                foreach (Candidate c in dayPass) {
                    string body;
                    if (!bodies.TryGetValue(c.Entry.Ordinal, out body) || body == null) body = "";
                    double score;
                    if (!ScoreText(terms, c.Entry, body, out score)) continue; // AND: every term must hit
                    c.Score = score;
                    total++;
                    heap.Add(c);
                }
            }

            List<Candidate> ranked = heap.Sorted();
            QueryResult result = new QueryResult();
            result.Rows = BuildRows(ranked, q.Group);
            result.Total = total;
            result.Truncated = total > ranked.Count;
            return result;
        }

        Comparison<Candidate> ComparerFor(SortMode sort) {
            if (sort == SortMode.Oldest) return new Comparison<Candidate>(CompareOldest);
            if (sort == SortMode.Relevance) return new Comparison<Candidate>(CompareRelevance);
            return new Comparison<Candidate>(CompareNewest);
        }

        // Comparison returns < 0 when 'a' should rank before 'b' (BoundedTopK
        // keeps the best 'cap' by this order and returns them best-first).
        static int CompareNewest(Candidate a, Candidate b) {
            bool pa = a.State != null && a.State.Pinned;
            bool pb = b.State != null && b.State.Pinned;
            if (pa != pb) return pa ? -1 : 1;                 // pinned first
            int w = b.Entry.When.CompareTo(a.Entry.When);     // newer first
            if (w != 0) return w;
            return string.CompareOrdinal(SafeId(a), SafeId(b));
        }

        static int CompareOldest(Candidate a, Candidate b) {
            int w = a.Entry.When.CompareTo(b.Entry.When);     // older first
            if (w != 0) return w;
            return string.CompareOrdinal(SafeId(a), SafeId(b));
        }

        static int CompareRelevance(Candidate a, Candidate b) {
            int s = b.Score.CompareTo(a.Score);               // higher score first
            if (s != 0) return s;
            int w = b.Entry.When.CompareTo(a.Entry.When);     // newer tiebreak
            if (w != 0) return w;
            return string.CompareOrdinal(SafeId(a), SafeId(b));
        }

        static string SafeId(Candidate c) {
            if (c == null || c.Entry == null || c.Entry.EntryId == null) return "";
            return c.Entry.EntryId;
        }

        // Metadata-only predicate (no body needed; EntryMeta already carries
        // app/host/title/via/ai, the overlay carries pin/delete).
        bool Passes(EntryMeta e, EntryState st, CaptureQuery q) {
            if (IsPurgedState(st)) return false;              // purged: hidden everywhere
            bool deleted = st != null && st.DeletedAt.HasValue && !IsPurgedState(st);
            if (q.Trash) { if (!deleted) return false; }
            else { if (deleted) return false; }

            if (!string.IsNullOrEmpty(q.App) && !EqI(e.App, q.App)) return false;
            if (!string.IsNullOrEmpty(q.Host) && !EqI(e.Host, q.Host)) return false;
            if (!string.IsNullOrEmpty(q.DayKey) && !EqI(e.DayKey, q.DayKey)) return false;
            if (!string.IsNullOrEmpty(q.Via) && !EqI(e.Via, q.Via)) return false;
            if (q.AiOnly && !e.IsAi) return false;
            if (q.PinnedOnly && !(st != null && st.Pinned)) return false;
            return true;
        }

        // score accumulates; a term that hits no field fails the AND and the
        // candidate is rejected. Zero terms is a vacuous match (score 0).
        static bool ScoreText(List<string> terms, EntryMeta e, string body, out double score) {
            score = 0.0;
            if (terms.Count == 0) return true;
            string nTitle = Norm(e.Title);
            string nHost = Norm(e.Host);
            string nApp = Norm(e.App);
            string nVia = Norm(e.Via);
            string nBody = Norm(body);
            double s = 0.0;
            for (int i = 0; i < terms.Count; i++) {
                string term = terms[i];
                double w = 0.0;
                if (nTitle.IndexOf(term, StringComparison.Ordinal) >= 0) w += WTitle;
                if (nHost.IndexOf(term, StringComparison.Ordinal) >= 0) w += WHost;
                if (nApp.IndexOf(term, StringComparison.Ordinal) >= 0) w += WApp;
                if (nVia.IndexOf(term, StringComparison.Ordinal) >= 0) w += WVia;
                if (nBody.IndexOf(term, StringComparison.Ordinal) >= 0) w += WBody;
                if (w == 0.0) return false;
                s += w;
            }
            score = s;
            return true;
        }

        // Group ranked entries by App/Host/Day, preserving each group's first
        // appearance in rank order, and insert a header row (label + count)
        // before each group. HeaderCount is the number shown in this result.
        List<Row> BuildRows(List<Candidate> ranked, GroupMode group) {
            List<Row> rows = new List<Row>();
            if (group == GroupMode.None) {
                foreach (Candidate c in ranked) rows.Add(EntryRow(c));
                return rows;
            }
            List<string> order = new List<string>();
            Dictionary<string, List<Candidate>> buckets = new Dictionary<string, List<Candidate>>(StringComparer.Ordinal);
            foreach (Candidate c in ranked) {
                string key = GroupKey(c.Entry, group);
                List<Candidate> b;
                if (!buckets.TryGetValue(key, out b)) { b = new List<Candidate>(); buckets[key] = b; order.Add(key); }
                b.Add(c);
            }
            foreach (string key in order) {
                List<Candidate> b = buckets[key];
                Row h = new Row();
                h.IsHeader = true;
                h.HeaderLabel = key;
                h.HeaderCount = b.Count;
                rows.Add(h);
                foreach (Candidate c in b) rows.Add(EntryRow(c));
            }
            return rows;
        }

        static Row EntryRow(Candidate c) {
            Row r = new Row();
            r.IsHeader = false;
            r.Entry = c.Entry;
            r.State = c.State;
            return r;
        }

        static string GroupKey(EntryMeta e, GroupMode group) {
            if (group == GroupMode.Site)
                return string.IsNullOrEmpty(e.Host) ? "(no website)" : e.Host;
            if (group == GroupMode.Day)
                return string.IsNullOrEmpty(e.DayKey) ? "(no date)" : e.DayKey;
            return string.IsNullOrEmpty(e.App) ? "(unknown app)" : e.App; // App
        }

        Dictionary<int, string> ReadBodies(string dayKey) {
            Dictionary<int, string> map = new Dictionary<int, string>();
            try {
                string text = MarkdownStore.Read(PathForDay(dayKey));
                List<ParsedEntry> parsed = CaptureParser.Parse(dayKey, text);
                if (parsed != null)
                    foreach (ParsedEntry p in parsed)
                        if (p != null) map[p.Ordinal] = p.Body;
            } catch { }
            return map;
        }

        // ---- body hydration ----------------------------------------------

        internal string GetBody(EntryMeta e) {
            if (e == null) return "";
            try {
                string text = MarkdownStore.Read(PathForDay(e.DayKey));
                string body = CaptureParser.ReadBody(text, e.Ordinal);
                return body == null ? "" : body;
            } catch { return ""; }
        }

        // ---- facets -------------------------------------------------------

        internal Facets GetFacets() {
            lock (gate) {
                if (cachedFacets != null) return cachedFacets;

                Dictionary<string, int> apps = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                Dictionary<string, int> sites = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                Dictionary<string, int> daysF = new Dictionary<string, int>(StringComparer.Ordinal);
                int ai = 0, pinned = 0, trash = 0, total = 0;

                foreach (KeyValuePair<string, EntryMeta[]> kv in byDay) {
                    EntryMeta[] arr = kv.Value;
                    if (arr == null) continue;
                    foreach (EntryMeta e in arr) {
                        if (e == null) continue;
                        EntryState st = ResolveFrom(overlay, e);
                        if (IsPurgedState(st)) continue;             // purged: not counted
                        bool deleted = st != null && st.DeletedAt.HasValue && !IsPurgedState(st);
                        if (deleted) { trash++; continue; }
                        total++;
                        Inc(apps, string.IsNullOrEmpty(e.App) ? "unknown" : e.App);
                        if (!string.IsNullOrEmpty(e.Host)) Inc(sites, e.Host);
                        if (!string.IsNullOrEmpty(e.DayKey)) Inc(daysF, e.DayKey);
                        if (e.IsAi) ai++;
                        if (st != null && st.Pinned) pinned++;
                    }
                }

                Facets f = new Facets();
                f.Apps = ToFacets(apps);
                f.Sites = ToFacets(sites);
                f.Days = ToFacets(daysF);
                f.AiCount = ai;
                f.PinnedCount = pinned;
                f.TrashCount = trash;
                f.Total = total;
                cachedFacets = f;
                return f;
            }
        }

        static void Inc(Dictionary<string, int> d, string key) {
            int c;
            d.TryGetValue(key, out c);
            d[key] = c + 1;
        }

        // Turn a {value -> count} tally into facet rows, highest count first.
        static List<Facet> ToFacets(Dictionary<string, int> d) {
            List<Facet> list = new List<Facet>(d.Count);
            foreach (KeyValuePair<string, int> kv in d) {
                Facet f = new Facet();
                f.Key = kv.Key;
                f.Label = kv.Key;
                f.Count = kv.Value;
                list.Add(f);
            }
            list.Sort(delegate(Facet a, Facet b) {
                int c = b.Count - a.Count;
                if (c != 0) return c;
                return string.Compare(a.Label, b.Label, StringComparison.OrdinalIgnoreCase);
            });
            return list;
        }

        // ---- overlay mutations (copy-on-write) ---------------------------

        internal void SetPinned(string entryId, bool pinned) {
            if (string.IsNullOrEmpty(entryId)) return;
            lock (gate) {
                if (disposed) return;
                Dictionary<string, EntryState> next = CloneOverlay();
                EntryState st = GetOrCreateLocked(next, entryId);
                st.Pinned = pinned;
                overlay = next;
                version++;
                cachedFacets = null;
            }
            AfterMutate();
        }

        internal void SoftDelete(string entryId) {
            if (string.IsNullOrEmpty(entryId)) return;
            bool changed = false;
            lock (gate) {
                if (disposed) return;
                Dictionary<string, EntryState> next = CloneOverlay();
                EntryState st = GetOrCreateLocked(next, entryId);
                if (!IsPurgedState(st)) { st.DeletedAt = DateTime.Now; overlay = next; version++; cachedFacets = null; changed = true; }
            }
            if (changed) AfterMutate();
        }

        internal void Restore(string entryId) {
            if (string.IsNullOrEmpty(entryId)) return;
            bool changed = false;
            lock (gate) {
                if (disposed) return;
                EntryState cur;
                if (overlay.TryGetValue(entryId, out cur) && cur != null &&
                    cur.DeletedAt.HasValue && !IsPurgedState(cur)) {
                    Dictionary<string, EntryState> next = CloneOverlay();
                    EntryState st = CloneState(cur);
                    st.DeletedAt = null;
                    next[entryId] = st;
                    overlay = next;
                    version++;
                    cachedFacets = null;
                    changed = true;
                }
            }
            if (changed) AfterMutate();
        }

        // Permanent overlay tombstone: hides the entry from every view and from
        // facets. The captured .md evidence is deliberately left untouched.
        internal bool Purge(string entryId) {
            if (string.IsNullOrEmpty(entryId)) return false;
            bool changed = false;
            lock (gate) {
                if (disposed) return false;
                Dictionary<string, EntryState> next = CloneOverlay();
                EntryState st = GetOrCreateLocked(next, entryId);
                if (!IsPurgedState(st)) {
                    st.DeletedAt = PurgeTombstone;
                    overlay = next;
                    version++;
                    cachedFacets = null;
                    changed = true;
                }
            }
            if (changed) AfterMutate();
            return changed;
        }

        internal void RecordOpen(string entryId) {
            if (string.IsNullOrEmpty(entryId)) return;
            lock (gate) {
                if (disposed) return;
                Dictionary<string, EntryState> next = CloneOverlay();
                EntryState st = GetOrCreateLocked(next, entryId);
                st.OpenCount = st.OpenCount + 1;
                overlay = next;
                version++;
                cachedFacets = null;
            }
            AfterMutate();
        }

        Dictionary<string, EntryState> CloneOverlay() {
            return (overlay == null)
                ? new Dictionary<string, EntryState>(StringComparer.Ordinal)
                : new Dictionary<string, EntryState>(overlay, StringComparer.Ordinal);
        }

        // Returns a writable EntryState inside 'dict' for entryId: either a
        // fresh one or a clone of the existing (so a reader holding the old
        // overlay never sees an in-place mutation). Stamps the current
        // fingerprint when known, so later reconciliation can detect edits.
        EntryState GetOrCreateLocked(Dictionary<string, EntryState> dict, string entryId) {
            EntryState st;
            if (dict.TryGetValue(entryId, out st) && st != null) st = CloneState(st);
            else st = new EntryState();
            if (string.IsNullOrEmpty(st.Fingerprint)) {
                EntryMeta m;
                if (byId != null && byId.TryGetValue(entryId, out m) && m != null)
                    st.Fingerprint = m.Fingerprint;
            }
            dict[entryId] = st;
            return st;
        }

        void AfterMutate() {
            ScheduleOverlaySave();
            RaiseIndexChanged();
        }

        // ---- overlay persistence (debounced) -----------------------------

        void ScheduleOverlaySave() {
            try { saveTimer.Change(SaveDebounceMs, Timeout.Infinite); } catch { }
        }

        void OnSaveTimer(object state) {
            SaveOverlayNow();
        }

        void SaveOverlayNow() {
            Dictionary<string, EntryState> snap;
            lock (gate) { snap = overlay; }
            if (snap == null) return;
            try { CaptureOverlayStore.Save(indexDir, snap); } catch { }
        }

        // ---- helpers ------------------------------------------------------

        static bool IsPurgedState(EntryState st) {
            return st != null && st.DeletedAt.HasValue && st.DeletedAt.Value == PurgeTombstone;
        }

        // Resolve the overlay state for an entry, honoring the fingerprint
        // fail-safe: a record whose stored fingerprint no longer matches the
        // current entry is ignored (a hand-edit must not inherit a pin/delete).
        static EntryState ResolveFrom(Dictionary<string, EntryState> ov, EntryMeta e) {
            if (ov == null || e == null || string.IsNullOrEmpty(e.EntryId)) return null;
            EntryState st;
            if (!ov.TryGetValue(e.EntryId, out st) || st == null) return null;
            if (!string.IsNullOrEmpty(st.Fingerprint) && !string.IsNullOrEmpty(e.Fingerprint) &&
                !string.Equals(st.Fingerprint, e.Fingerprint, StringComparison.Ordinal))
                return null;
            return st;
        }

        static EntryState CloneState(EntryState s) {
            EntryState c = new EntryState();
            if (s != null) {
                c.Pinned = s.Pinned;
                c.DeletedAt = s.DeletedAt;
                c.OpenCount = s.OpenCount;
                c.Fingerprint = s.Fingerprint;
            }
            return c;
        }

        static bool EqI(string a, string b) {
            return string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        }

        static string Norm(string s) {
            if (string.IsNullOrEmpty(s)) return "";
            try { return s.Normalize(NormalizationForm.FormKC).ToLowerInvariant(); }
            catch { return s.ToLowerInvariant(); }
        }

        static List<string> Tokenize(string text) {
            List<string> result = new List<string>();
            if (string.IsNullOrEmpty(text)) return result;
            string n = Norm(text);
            HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (Match m in TermRx.Matches(n)) {
                string term = m.Value;
                if (Stop.Contains(term)) continue;
                if (seen.Add(term)) {
                    result.Add(term);
                    if (result.Count >= 12) break;
                }
            }
            return result;
        }

        string PathForDay(string dayKey) {
            return System.IO.Path.Combine(captureDir, dayKey + ".md");
        }

        static string StripMd(string name) {
            if (string.IsNullOrEmpty(name)) return name;
            if (name.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                return name.Substring(0, name.Length - 3);
            return name;
        }

        void RaiseIndexChanged() {
            EventHandler h = IndexChanged;
            if (h != null) {
                try { h(this, EventArgs.Empty); } catch { }
            }
        }

        public void Dispose() {
            lock (gate) {
                if (disposed) return;
                disposed = true;
            }
            try { refreshTimer.Dispose(); } catch { }
            try { saveTimer.Dispose(); } catch { }
            SaveOverlayNow(); // final flush of the overlay to disk
        }

        // One ranked candidate: the entry, its resolved overlay state, and the
        // relevance score (0 outside text mode). Private to the engine.
        sealed class Candidate {
            public EntryMeta Entry;
            public EntryState State;
            public double Score;
            public Candidate(EntryMeta entry, EntryState state, double score) {
                Entry = entry;
                State = state;
                Score = score;
            }
        }
    }
}
