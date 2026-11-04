// Request/response contracts for the capture index query engine.
//
// These are plain data carriers with no behaviour: CaptureIndex.Query builds a
// QueryResult, CaptureIndex.GetFacets builds a Facets, and LibraryPanel renders
// them into the virtual ListView. VirtualMode has no native grouping, so group
// headers are emulated as Row records (IsHeader = true) interleaved with the
// entry rows. Entry/State fields point at the shared evidence+overlay carriers
// defined in CaptureEntry.cs; nothing here parses, sorts or allocates.
using System.Collections.Generic;

namespace TypingRecorder {

    /// <summary>Row ordering requested by the library view.</summary>
    enum SortMode { Newest, Oldest, Relevance }

    /// <summary>How result rows are grouped (emulated header rows, not native groups).</summary>
    enum GroupMode { None, App, Site, Day }

    /// <summary>A single filter+sort+group+page request against the capture index.</summary>
    sealed class CaptureQuery {
        public string Text, App, Host, DayKey, Via;   // free-text and facet filters; null/empty means "any"
        public bool AiOnly, PinnedOnly, Trash;        // toggle filters; Trash shows soft-deleted entries
        public SortMode Sort;
        public GroupMode Group;
        public int Offset, Limit;                     // paging window the virtual list asks for
        public int MaxResults;                        // max matches to retain before paging (0 = engine default)
    }

    /// <summary>
    /// One rendered line. When IsHeader is true the row is an emulated group
    /// header (HeaderLabel + HeaderCount) and Entry/State are null; otherwise it
    /// is a capture row and HeaderLabel/HeaderCount are unused.
    /// </summary>
    sealed class Row {
        public bool IsHeader;
        public string HeaderLabel;
        public int HeaderCount;
        public EntryMeta Entry;    // shared metadata carrier (CaptureEntry.cs)
        public EntryState State;   // pinned/deleted/open-count overlay (CaptureEntry.cs)
    }

    /// <summary>A page of rows plus the full match total and whether it was capped.</summary>
    sealed class QueryResult {
        public List<Row> Rows;
        public int Total;       // total matching entries, independent of the returned page
        public bool Truncated;  // true when the match set was bounded before paging
    }

    /// <summary>One selectable value in a filter dropdown with its live count.</summary>
    sealed class Facet {
        public string Key, Label;   // Key is the filter value; Label is what the UI shows
        public int Count;
    }

    /// <summary>Facet counts for every filter dropdown in the library view.</summary>
    sealed class Facets {
        public List<Facet> Apps, Sites, Days;
        public int AiCount, PinnedCount, TrashCount, Total;
    }
}
