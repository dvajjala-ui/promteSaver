// A bounded max-heap that retains only the K best candidates seen so far.
//
// Used by relevance-ranked search: scanning a large capture library and keeping
// just the top window of matches, so a 100k-entry scan never fully sorts. Each
// Add is O(log K); only K items are ever held in memory.
//
// The comparator orders best-first (compare(a, b) < 0 means a is better than b,
// the same convention as List<T>.Sort). The heap keeps the WORST retained
// candidate at the root, so a new value only has to beat that one root to earn
// a place. Direct port of packages/local-store/top-k.ts.
using System;
using System.Collections.Generic;

namespace TypingRecorder {

    /// <summary>
    /// Keeps at most <c>capacity</c> values, discarding the worst as better ones
    /// arrive. Pure, allocation-light and independent of the rest of the app.
    /// </summary>
    sealed class BoundedTopK<T> {

        // Array-backed binary heap. The worst retained candidate is at index 0;
        // for any node i, children at 2i+1 and 2i+2 are never worse than it.
        readonly List<T> heap;
        readonly Comparison<T> compare;
        readonly int capacity;

        /// <param name="capacity">Maximum number of candidates to retain (0..100100).</param>
        /// <param name="compare">Best-first order; compare(a, b) &lt; 0 means a outranks b.</param>
        public BoundedTopK(int capacity, Comparison<T> compare) {
            if (compare == null) throw new ArgumentNullException("compare");
            // Matches the ported source's bound; it accommodates a ranking window
            // of offset+limit (offset up to 100000, limit up to 100).
            if (capacity < 0 || capacity > 100100)
                throw new ArgumentOutOfRangeException("capacity", "Invalid ranking capacity");
            this.capacity = capacity;
            this.compare = compare;
            // Grow on demand rather than reserving a slot per unit of capacity, so a
            // large window that only ever sees a handful of items stays cheap.
            this.heap = new List<T>(capacity < 64 ? capacity : 64);
        }

        /// <summary>Number of candidates currently retained.</summary>
        public int Size { get { return heap.Count; } }

        /// <summary>
        /// Offer a value. Kept if the heap is not yet full, or if it outranks the
        /// worst retained candidate (which is then dropped). O(log K).
        /// </summary>
        public void Add(T value) {
            if (capacity == 0) return;

            if (heap.Count < capacity) {
                // Room remains: append and sift the new value up toward the root
                // while it is worse than its parent.
                heap.Add(value);
                int index = heap.Count - 1;
                while (index > 0) {
                    int parent = (index - 1) >> 1;
                    if (compare(heap[index], heap[parent]) <= 0) break;
                    T swap = heap[index]; heap[index] = heap[parent]; heap[parent] = swap;
                    index = parent;
                }
                return;
            }

            // Full: the root is the worst kept candidate. A value no better than it
            // (compare >= 0) cannot make the top K, so drop it.
            if (compare(value, heap[0]) >= 0) return;

            // Otherwise replace the worst and sift the newcomer down to restore the
            // invariant that the worst sits at the root.
            heap[0] = value;
            int i = 0;
            int count = heap.Count;
            for (;;) {
                int worse = i;
                int left = i * 2 + 1;
                int right = left + 1;
                if (left < count && compare(heap[left], heap[worse]) > 0) worse = left;
                if (right < count && compare(heap[right], heap[worse]) > 0) worse = right;
                if (worse == i) break;
                T swap = heap[i]; heap[i] = heap[worse]; heap[worse] = swap;
                i = worse;
            }
        }

        /// <summary>
        /// A fresh copy of the retained candidates in best-first order. The heap is
        /// left untouched, so it may continue to accept more values afterward.
        /// </summary>
        public List<T> Sorted() {
            List<T> copy = new List<T>(heap);
            copy.Sort(compare);
            return copy;
        }
    }
}
