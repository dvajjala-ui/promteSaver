// Plain data model shared by the whole Phase 3 capture engine. These are simple
// holders with no behaviour; the parser, index, query and library view all pass
// them around:
//
//   EntryMeta    - lightweight per-entry metadata kept in the long-lived index.
//                  Carries the stable identity plus everything the list view
//                  shows, but never the body itself.
//   EntryState   - the mutable per-entry overlay (pin / trash / open-count) that
//                  lives beside the immutable capture files, keyed by EntryId.
//   ParsedEntry  - the transient full parse result (every header field plus the
//                  full Body) produced by CaptureParser and consumed by the index
//                  and search; it is never retained in the long-lived index.
//
// Fingerprints.Of derives a cheap, deterministic FNV-1a hash used only to detect
// drift between an overlay record and the capture line it belongs to. It is not a
// security primitive, so no System.Security.Cryptography is required.
using System;
using System.Text;

namespace TypingRecorder {

    /// <summary>
    /// Lightweight per-entry metadata held in the index. The stable identity and
    /// everything rendered in the list, without the body.
    /// </summary>
    sealed class EntryMeta {
        public string EntryId;      // "<DayKey>#<Ordinal>", e.g. "2026-11-04#3"
        public string DayKey;       // "yyyy-MM-dd"
        public string App;          // process image name, e.g. "chrome.exe"
        public string Host;         // website host for browsers, else null
        public string PathTail;     // url path for browsers, else null
        public string Title;        // foreground window title, or null
        public string Via;          // how it was captured: "typed", "paste", ...
        public string AiLabel;      // friendly label when Host is a known AI site
        public string Preview;      // first ~200 chars of the body, single-lined
        public string Fingerprint;  // Fingerprints.Of(time, app, host, body)
        public DateTime When;       // local time, from DayKey + "HH:mm:ss"
        public int Ordinal;         // position within the day's file
        public bool IsAi;           // Host is a known AI prompt site
    }

    /// <summary>
    /// Overlay-only mutable state stored alongside the immutable captures, keyed
    /// by EntryId. Fingerprint is a snapshot of the capture at the time the
    /// overlay was written, so the loader can notice one that no longer matches.
    /// </summary>
    sealed class EntryState {
        public bool Pinned;
        public DateTime? DeletedAt;   // null unless soft-deleted (in trash)
        public int OpenCount;
        public string Fingerprint;    // drift check against the capture it points at
    }

    /// <summary>
    /// Transient full parse result from CaptureParser: every header field plus the
    /// complete Body. Consumed by the index/search and then discarded; the body is
    /// never kept in the long-lived index.
    /// </summary>
    sealed class ParsedEntry {
        public DateTime When;
        public string App;
        public string Host;
        public string PathTail;
        public string Title;
        public string Via;
        public string Body;
        public int Ordinal;
    }

    /// <summary>
    /// Deterministic, non-cryptographic fingerprint (FNV-1a, 32-bit) over the
    /// stable header fields and the leading body text. Cheap enough to compute for
    /// every entry during an index build, and stable so an overlay record can tell
    /// whether the capture it was written for still holds the same text.
    /// </summary>
    static class Fingerprints {
        const uint OffsetBasis = 2166136261u;  // FNV-1a 32-bit offset basis (0x811C9DC5)
        const uint Prime = 16777619u;          // FNV-1a 32-bit prime (0x01000193)
        const int BodyHeadChars = 64;          // only the first N body chars feed the hash

        /// <summary>
        /// Hex FNV-1a of "timeString|app|host|&lt;first 64 chars of body&gt;". Null
        /// parts are treated as empty so the result is always an 8-char lowercase
        /// hex string.
        /// </summary>
        internal static string Of(string timeString, string app, string host, string body) {
            string head = body;
            if (head == null) head = "";
            else if (head.Length > BodyHeadChars) head = head.Substring(0, BodyHeadChars);

            StringBuilder sb = new StringBuilder();
            sb.Append(timeString == null ? "" : timeString);
            sb.Append('|');
            sb.Append(app == null ? "" : app);
            sb.Append('|');
            sb.Append(host == null ? "" : host);
            sb.Append('|');
            sb.Append(head);

            byte[] bytes = Encoding.UTF8.GetBytes(sb.ToString());
            uint hash = OffsetBasis;
            unchecked {
                for (int i = 0; i < bytes.Length; i++) {
                    hash ^= bytes[i];
                    hash *= Prime;
                }
            }
            return hash.ToString("x8");
        }
    }
}
