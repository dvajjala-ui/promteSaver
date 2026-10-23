/** Bounded max-heap. Comparator orders best first; the worst retained candidate stays at root. */
export class BoundedTopK<T> {
  #heap: T[] = [];
  #compare: (left: T, right: T) => number;
  #capacity: number;
  constructor(capacity: number, compare: (left: T, right: T) => number) {
    if (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > 100_100) throw new Error('Invalid ranking capacity');
    this.#capacity = capacity; this.#compare = compare;
  }
  get size(): number { return this.#heap.length; }
  add(value: T): void {
    if (!this.#capacity) return;
    if (this.#heap.length < this.#capacity) {
      this.#heap.push(value);
      let index = this.#heap.length - 1;
      while (index > 0) {
        const parent = (index - 1) >>> 1;
        if (this.#compare(this.#heap[index]!, this.#heap[parent]!) <= 0) break;
        [this.#heap[index], this.#heap[parent]] = [this.#heap[parent]!, this.#heap[index]!];
        index = parent;
      }
      return;
    }
    if (this.#compare(value, this.#heap[0]!) >= 0) return;
    this.#heap[0] = value;
    let index = 0;
    for (;;) {
      let worse = index; const left = index * 2 + 1; const right = left + 1;
      if (left < this.#heap.length && this.#compare(this.#heap[left]!, this.#heap[worse]!) > 0) worse = left;
      if (right < this.#heap.length && this.#compare(this.#heap[right]!, this.#heap[worse]!) > 0) worse = right;
      if (worse === index) break;
      [this.#heap[index], this.#heap[worse]] = [this.#heap[worse]!, this.#heap[index]!];
      index = worse;
    }
  }
  sorted(): T[] { return this.#heap.slice().sort(this.#compare); }
}
