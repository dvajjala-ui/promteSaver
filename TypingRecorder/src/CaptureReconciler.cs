// CaptureReconciler - the single decision point that prevents double-recording
// and groups a contiguous edit of one field/window into one capture session.
//
// Keystroke chunks, verified clipboard events and UIA field snapshots are all
// fed here, on the WinForms UI thread only. The reconciler holds one current
// Session keyed by app + foreground-window identity, prefers the UIA field
// snapshot as the authoritative text (it alone carries paste / IME / autocomplete),
// and commits EXACTLY ONCE per session through the supplied writer, so Redaction
// still runs in the writer and no block is ever recorded twice.
//
// Field text is always labelled with a 'field' draft modifier, never a submitted
// or exact-submitted tag (v0.9 boundary). Everything here is single-threaded by
// contract, so there are no locks and no background work.
//
// C# 5 / .NET Framework 4.7.2. References only base types (CaptureRecord,
// ContextSnapshot) and the sibling AiSites helper by their agreed interfaces.
using System;
using System.Collections.Generic;
using System.Text;

namespace TypingRecorder {

    /// <summary>Running counters surfaced to the Diagnostics view. Live, mutable,
    /// read on the same UI thread that mutates them.</summary>
    internal sealed class ReconcilerStats {
        internal int SessionsCommitted;     // sessions that produced exactly one entry
        internal int FieldSuperseded;       // sessions where the UIA field text won
        internal int KeystrokeOnly;         // sessions where reconstructed typing won
        internal int PastesFolded;          // pending pastes absorbed by a field snapshot
        internal int StandaloneCopy;        // verified Ctrl+C entries
        internal int StandaloneCut;         // verified Ctrl+X entries
        internal int StandalonePaste;       // pastes written on their own (no field snapshot)
        internal int LateSnapshotsDropped;  // double-record guard hits (append-only evidence)
    }

    /// <summary>Groups keystroke chunks, clipboard events and field snapshots into
    /// one entry per contiguous edit, committing through an Action&lt;CaptureRecord&gt;.</summary>
    internal sealed class CaptureReconciler {

        // Idle long enough that any in-flight field snapshot has already arrived:
        // chosen > the keyboard 1.5s idle flush and > the worker 0.8s settle + IPC.
        const double IdleFinalizeMs   = 4000;
        // How long a verified paste waits to be folded into a field snapshot before
        // it is written on its own.
        const double PasteWindowMs    = 1500;
        // How long a finalized episode is remembered so a late snapshot for it can
        // be dropped instead of recorded a second time (>= the 4s finalize idle).
        const double FinalizeMemoryMs = 5000;

        const int MaxFieldCommitMemory = 256; // bound the per-field dedupe map
        const int MaxFinalizeMarks     = 64;  // bound the recently-finalized memory

        const char KeySep = '\u001F';       // unit separator between episode-key parts
        // Middle dot (U+00B7) built from its code point so the source stays pure ASCII
        // and compiles to the same character on any code page.
        static readonly string MidDot = " " + ((char) 0x00B7) + " ";

        /// <summary>One contiguous edit of a single field/window.</summary>
        sealed class Session {
            internal string EpisodeKey;
            internal string App;
            internal string Title;
            internal string Host;
            internal string Path;
            internal readonly StringBuilder Keystrokes = new StringBuilder();
            internal string FieldText;
            internal string FieldId;
            internal bool SawFieldSnapshot;
            internal bool SawPaste;
            internal bool SawIme;
            internal bool EndedByEnter;
            internal DateTime StartWhen;
            internal DateTime LastActivity;
            internal bool HasPendingPaste;
            internal string PendingPasteText;
            internal DateTime PendingPasteWhen;
            internal DateTime PendingPasteDeadline;
        }

        /// <summary>Short-lived memory of a just-finalized episode, so a late snapshot
        /// for the same window is dropped rather than committed again.</summary>
        sealed class FinalizeMark {
            internal string EpisodeKey;
            internal string FieldId;      // bound field id, when the session was field-bound
            internal string FieldText;    // committed field text, when field-superseded
            internal bool KeystrokeOnly;  // committed from reconstructed typing only
            internal DateTime Expiry;
        }

        readonly Action<CaptureRecord> commit;
        readonly ReconcilerStats stats = new ReconcilerStats();
        readonly Dictionary<string, string> lastFieldCommit =
            new Dictionary<string, string>(StringComparer.Ordinal);
        readonly List<FinalizeMark> finalized = new List<FinalizeMark>();

        Session current;
        bool pendingIme; // an IME signal that arrived before any session existed

        internal CaptureReconciler(Action<CaptureRecord> commit) {
            if (commit == null) throw new ArgumentNullException("commit");
            this.commit = commit;
        }

        internal ReconcilerStats Stats { get { return stats; } }

        // -- Feeds (all invoked on the UI thread) -----------------------------

        internal void FeedKeystroke(DateTime when, string app, string title, string host,
                                    string path, string text, bool isEnter) {
            string key = EpisodeKey(app, host, path);
            Session s = EnsureSession(key, app, title, host, path, when);

            if (!string.IsNullOrEmpty(text)) s.Keystrokes.Append(text);
            if (isEnter) {
                // The upstream Enter flush already ends its chunk with '\n'; add one
                // only when the feed did not carry it, so line breaks are preserved
                // but never doubled.
                if (string.IsNullOrEmpty(text) || text[text.Length - 1] != '\n')
                    s.Keystrokes.Append('\n');
                s.EndedByEnter = true;
            } else {
                s.EndedByEnter = false;
            }
            UpdateContext(s, app, title, host, path);
            s.LastActivity = when;

            // Send-on-enter for known AI prompt hosts (claude.ai, chatgpt.com, ...)
            // keeps one entry per message, matching the behaviour the owner relies on
            // for chat/prompt use. Everywhere else Enter is a soft break and the entry
            // lands on the ~4s idle finalize instead.
            if (isEnter && !string.IsNullOrEmpty(host) && AiSites.IsAiPrompt(host)) {
                Finalize(s, when);
                current = null;
            }
        }

        internal void FeedFieldSnapshot(DateTime when, string app, string text,
                                        string fieldId, ContextSnapshot ctx) {
            if (string.IsNullOrEmpty(text)) return;
            string host  = ctx != null ? ctx.Host : null;
            string path  = ctx != null ? ctx.Path : null;
            string title = ctx != null ? ctx.Title : null;
            string key = EpisodeKey(app, host, path);

            if (current != null && string.Equals(current.EpisodeKey, key, StringComparison.Ordinal)) {
                // Same episode: the field snapshot supersedes the reconstruction and
                // covers any pending paste that happened inside this field.
                current.FieldText = text;
                current.FieldId = fieldId;
                current.SawFieldSnapshot = true;
                if (current.HasPendingPaste) {
                    current.HasPendingPaste = false;
                    current.PendingPasteText = null;
                    current.SawPaste = true;
                    stats.PastesFolded++;
                }
                UpdateContext(current, app, title, host, path);
                current.LastActivity = when;
                return;
            }

            // A snapshot for a DIFFERENT (or no) open session would open a new one.
            // If that episode was just finalized - with the typed text, or the same
            // field text, already on disk - drop this late snapshot: Markdown evidence
            // is append-only, so it cannot be retro-merged, and recording it would
            // double the entry (the fast app/window-switch hole).
            if (ShouldDropLateSnapshot(key, text, when)) {
                stats.LateSnapshotsDropped++;
                return;
            }

            if (current != null) { Finalize(current, when); current = null; }
            Session s = NewSession(key, app, title, host, path, when);
            s.FieldText = text;
            s.FieldId = fieldId;
            s.SawFieldSnapshot = true;
            current = s;
        }

        internal void FeedClipboard(DateTime when, string op, string verifiedText, ContextSnapshot ctx) {
            if (string.IsNullOrEmpty(verifiedText) || op == null) return;

            if (string.Equals(op, "COPY", StringComparison.OrdinalIgnoreCase)) {
                // Copy / cut are committed immediately and independently of the typing
                // session: the source may be read-only content elsewhere on screen.
                CommitClipboard(when, "copy", verifiedText, ctx);
                stats.StandaloneCopy++;
                return;
            }
            if (string.Equals(op, "CUT", StringComparison.OrdinalIgnoreCase)) {
                CommitClipboard(when, "cut", verifiedText, ctx);
                stats.StandaloneCut++;
                return;
            }
            if (string.Equals(op, "PASTE", StringComparison.OrdinalIgnoreCase)) {
                // Paste is held briefly: a field snapshot for the same episode folds it
                // (so the pasted text is not recorded both on its own and inside the
                // field). If none arrives within the window it is written on its own.
                string host  = ctx != null ? ctx.Host : null;
                string path  = ctx != null ? ctx.Path : null;
                string title = ctx != null ? ctx.Title : null;
                string app   = ctx != null ? ctx.Process : null;

                Session s;
                if (string.IsNullOrEmpty(app) && current != null) {
                    s = current; // unknown paste target: attach to the open session
                } else {
                    s = EnsureSession(EpisodeKey(app, host, path), app, title, host, path, when);
                }
                // A second paste before the first was folded: emit the first on its own
                // so no verified paste is silently lost.
                if (s.HasPendingPaste) FlushPendingPaste(s);
                s.HasPendingPaste = true;
                s.PendingPasteText = verifiedText;
                s.PendingPasteWhen = when;
                s.PendingPasteDeadline = when.AddMilliseconds(PasteWindowMs);
                s.LastActivity = when;
            }
        }

        internal void NoteIme() {
            // IME-composed text cannot be reconstructed from raw keys, so prefer the
            // field path for this session. If no session exists yet, carry the hint to
            // the next one.
            if (current != null) current.SawIme = true;
            else pendingIme = true;
        }

        internal void Tick(DateTime now) {
            if (current != null) {
                if ((now - current.LastActivity).TotalMilliseconds > IdleFinalizeMs) {
                    Finalize(current, now);
                    current = null;
                } else if (current.HasPendingPaste && now >= current.PendingPasteDeadline) {
                    // No field snapshot folded this paste within the window: write it
                    // on its own as a verified paste (today's behaviour, but verified).
                    FlushPendingPaste(current);
                }
            }
            PruneFinalized(now);
        }

        internal void FlushAll() {
            if (current != null) {
                Finalize(current, DateTime.Now);
                current = null;
            }
        }

        // -- Session plumbing --------------------------------------------------

        Session EnsureSession(string key, string app, string title, string host, string path, DateTime when) {
            if (current != null && string.Equals(current.EpisodeKey, key, StringComparison.Ordinal)) {
                UpdateContext(current, app, title, host, path);
                return current;
            }
            if (current != null) { Finalize(current, when); current = null; }
            current = NewSession(key, app, title, host, path, when);
            return current;
        }

        Session NewSession(string key, string app, string title, string host, string path, DateTime when) {
            Session s = new Session();
            s.EpisodeKey = key;
            s.App = app;
            s.Title = title;
            s.Host = host;
            s.Path = path;
            s.StartWhen = when;
            s.LastActivity = when;
            if (pendingIme) { s.SawIme = true; pendingIme = false; }
            return s;
        }

        static void UpdateContext(Session s, string app, string title, string host, string path) {
            if (!string.IsNullOrEmpty(app)) s.App = app;
            if (!string.IsNullOrEmpty(title)) s.Title = title;
            // Host and path are only meaningful together; refresh them as a pair when a
            // host is present so a browser tab's latest site/path wins.
            if (!string.IsNullOrEmpty(host)) { s.Host = host; s.Path = path; }
        }

        void Finalize(Session s, DateTime now) {
            if (s == null) return;
            bool committed = false;
            bool keystrokeOnly = false;
            string committedFieldText = null;

            if (s.SawFieldSnapshot && !string.IsNullOrWhiteSpace(s.FieldText)) {
                // The UIA field snapshot is authoritative. Skip it only when it is
                // identical to this field's last commit, so re-reads do not duplicate.
                string prior;
                lastFieldCommit.TryGetValue(FieldKey(s), out prior);
                if (!string.Equals(prior, s.FieldText, StringComparison.Ordinal)) {
                    Emit(s.StartWhen, s.App, s.Title, s.Host, s.Path, FieldVia(s), s.FieldText);
                    RememberFieldCommit(s, s.FieldText);
                    stats.FieldSuperseded++;
                    committed = true;
                    committedFieldText = s.FieldText;
                }
            } else {
                string typed = s.Keystrokes.ToString();
                if (!string.IsNullOrWhiteSpace(typed)) {
                    Emit(s.StartWhen, s.App, s.Title, s.Host, s.Path,
                         s.EndedByEnter ? "typed (enter)" : "typed", typed);
                    stats.KeystrokeOnly++;
                    committed = true;
                    keystrokeOnly = true;
                }
            }

            if (committed) stats.SessionsCommitted++;

            // A paste still pending here was never folded into a field snapshot, so the
            // current field text (if any) predates it: write the verified paste on its own.
            if (s.HasPendingPaste) FlushPendingPaste(s);

            if (committed) RememberFinalize(s, keystrokeOnly, committedFieldText, now);
        }

        // -- Commit helpers ----------------------------------------------------

        void Emit(DateTime when, string app, string title, string host, string path, string via, string text) {
            if (string.IsNullOrEmpty(text)) return;
            string a = string.IsNullOrEmpty(app) ? "unknown" : app;
            commit(new CaptureRecord(when, a, title, host, path, via, text));
        }

        void CommitClipboard(DateTime when, string via, string text, ContextSnapshot ctx) {
            string app   = ctx != null ? ctx.Process : null;
            string title = ctx != null ? ctx.Title : null;
            string host  = ctx != null ? ctx.Host : null;
            string path  = ctx != null ? ctx.Path : null;
            Emit(when, app, title, host, path, via, text);
        }

        void FlushPendingPaste(Session s) {
            if (!s.HasPendingPaste) return;
            Emit(s.PendingPasteWhen, s.App, s.Title, s.Host, s.Path, "paste", s.PendingPasteText);
            stats.StandalonePaste++;
            s.HasPendingPaste = false;
            s.PendingPasteText = null;
        }

        static string FieldVia(Session s) {
            // 'field' plus honest draft modifiers. Never a submitted / exact-submitted tag.
            string via = "field";
            if (s.SawPaste) via = via + MidDot + "incl. paste";
            if (s.SawIme) via = via + MidDot + "IME";
            return via;
        }

        // -- Per-field dedupe --------------------------------------------------

        static string FieldKey(Session s) {
            // Dedupe field commits per binding episode; fall back to the episode key
            // when a field id is somehow absent.
            return !string.IsNullOrEmpty(s.FieldId) ? s.FieldId : s.EpisodeKey;
        }

        void RememberFieldCommit(Session s, string text) {
            if (lastFieldCommit.Count >= MaxFieldCommitMemory) lastFieldCommit.Clear();
            lastFieldCommit[FieldKey(s)] = text;
        }

        // -- Recently-finalized memory (double-record guard) -------------------

        void RememberFinalize(Session s, bool keystrokeOnly, string committedFieldText, DateTime now) {
            FinalizeMark m = new FinalizeMark();
            m.EpisodeKey = s.EpisodeKey;
            m.FieldId = s.SawFieldSnapshot ? s.FieldId : null;
            m.FieldText = committedFieldText;
            m.KeystrokeOnly = keystrokeOnly;
            m.Expiry = now.AddMilliseconds(FinalizeMemoryMs);
            finalized.Add(m);
            if (finalized.Count > MaxFinalizeMarks) finalized.RemoveAt(0);
        }

        bool ShouldDropLateSnapshot(string key, string text, DateTime now) {
            for (int i = finalized.Count - 1; i >= 0; i--) {
                FinalizeMark m = finalized[i];
                if (now >= m.Expiry) continue;
                if (!string.Equals(m.EpisodeKey, key, StringComparison.Ordinal)) continue;
                // Keystroke-only finalize: the typed text is already recorded and the
                // field snapshot deliberately differs from it, so it cannot be matched
                // by text - drop on the episode key alone.
                if (m.KeystrokeOnly) return true;
                // Field-superseded finalize: drop a re-read that carries the identical
                // field text already committed for this window.
                if (m.FieldText != null && string.Equals(m.FieldText, text, StringComparison.Ordinal))
                    return true;
            }
            return false;
        }

        void PruneFinalized(DateTime now) {
            int w = 0;
            for (int i = 0; i < finalized.Count; i++) {
                if (now < finalized[i].Expiry) {
                    finalized[w] = finalized[i];
                    w++;
                }
            }
            if (w < finalized.Count) finalized.RemoveRange(w, finalized.Count - w);
        }

        // -- Episode identity --------------------------------------------------

        static string EpisodeKey(string app, string host, string path) {
            // app + foreground-window identity, from the data the feeds carry. For a
            // browser the site (host + path) identifies the tab; for a desktop app the
            // process is the best available window key (two windows of one desktop app
            // share it - an accepted limitation without a window handle here).
            string a = app != null ? app.ToLowerInvariant() : "";
            if (!string.IsNullOrEmpty(host)) {
                string h = host.ToLowerInvariant();
                string p = path != null ? path : "";
                return a + KeySep + h + KeySep + p;
            }
            return a;
        }
    }
}
