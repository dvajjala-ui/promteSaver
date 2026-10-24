/** Experimental, opt-in local transcript producer. Construction never reads or watches a source.
 * The caller owns unlocked-vault consent and must recheck its session generation on persistence.
 * Session JSONL is an undocumented external format: only explicit user_message events qualify.
 */
import { watch, type FSWatcher } from 'node:fs';
import { lstat, opendir, realpath, open } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, join } from 'node:path';
import { createHash } from 'node:crypto';

export const CODEX_SOURCE_LIMITS = Object.freeze({
  files: 256, directories: 256, entries: 4096, depth: 8,
  lineBytes: 65_536, textBytes: 16_384, readBytes: 65_536,
  backlogBytes: 4 * 1024 * 1024, pendingPaths: 256,
});
export interface CodexSourceSnapshot {
  source: 'codex-local-session';
  quality: 'draft_snapshot';
  sourceMethod: 'local_transcript';
  text: string;
  observedAt: string;
  eventId: string;
}
export type CodexSourceCode = 'SOURCE_UNAVAILABLE' | 'SOURCE_LIMIT' | 'SOURCE_READ_FAILED' |
  'SOURCE_RECORD_LIMIT' | 'SOURCE_BACKLOG_LIMIT' | 'SOURCE_ROTATED' | 'SOURCE_DELIVERY_FAILED';
export interface CodexSourceStatus { state: 'running' | 'paused' | 'stopped' | 'error'; code?: CodexSourceCode }
export interface CodexSourceOptions {
  directory: string;
  onSnapshot: (snapshot: CodexSourceSnapshot) => void | Promise<void>;
  onStatus?: (status: CodexSourceStatus) => void;
}
interface Cursor { identity: string; offset: number; partial: Buffer; dropping: boolean }
class SourceLimitError extends Error {}

export class CodexTranscriptSource {
  readonly #options: CodexSourceOptions;
  #root = '';
  #watcher: FSWatcher | undefined;
  #generation = 0;
  #running = false;
  #starting = false;
  #draining = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending = new Set<string>();
  #scanPending = false;
  #cursors = new Map<string, Cursor>();
  #warned = new Set<CodexSourceCode>();
  #inFlightBuffers = new Set<Buffer>();

  constructor(options: CodexSourceOptions) { this.#options = options; }
  get running(): boolean { return this.#running; }

  /** Explicit caller action only. Every start baselines existing files at EOF; no history import. */
  async start(): Promise<void> {
    this.#halt('paused');
    const generation = ++this.#generation;
    this.#starting = true;
    this.#warned.clear();
    try {
      const requested = resolve(this.#options.directory);
      const stat = await lstat(requested);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('source');
      this.#root = await realpath(requested);
      if (generation !== this.#generation) return;
      // Subscribe before enumeration so creations during the baseline cannot be missed silently.
      this.#watcher = watch(this.#root, { recursive: true }, (_event, filename) => {
        if (generation !== this.#generation) return;
        if (!filename) this.#scanPending = true;
        else {
          const path = resolve(this.#root, filename.toString());
          if (!this.#inside(path)) return;
          if (extname(path).toLowerCase() === '.jsonl') this.#queue(path);
          else this.#scanPending = true;
        }
        this.#schedule();
      });
      this.#watcher.on('error', () => {
        if (generation !== this.#generation) return;
        this.#halt('error', 'SOURCE_UNAVAILABLE');
      });
      const files = await this.#enumerate(generation);
      for (const path of files) {
        if (generation !== this.#generation) return;
        const metadata = await this.#metadata(path);
        if (generation !== this.#generation) return;
        if (metadata) this.#cursors.set(path, { identity: metadata.identity, offset: metadata.size, partial: Buffer.alloc(0), dropping: false });
      }
      if (generation !== this.#generation) return;
      this.#starting = false;
      this.#running = true;
      this.#status({ state: 'running' });
      this.#schedule();
    } catch (error) {
      const code = error instanceof SourceLimitError ? 'SOURCE_LIMIT' : 'SOURCE_UNAVAILABLE';
      if (generation === this.#generation) this.#halt('error', code);
      throw new Error(code === 'SOURCE_LIMIT' ? 'Codex local source limit exceeded' : 'Codex local source is unavailable');
    }
  }

  async pause(): Promise<void> { this.#halt('paused'); }
  async stop(): Promise<void> { this.#halt('stopped'); }

  #status(status: CodexSourceStatus): void {
    try { this.#options.onStatus?.(status); } catch { /* Diagnostics must not interrupt lifecycle. */ }
  }
  #warn(code: CodexSourceCode): void {
    if (this.#warned.has(code)) return;
    this.#warned.add(code);
    this.#status({ state: this.#running ? 'running' : 'error', code });
  }
  #halt(state: 'paused' | 'stopped' | 'error', code?: CodexSourceCode): void {
    ++this.#generation;
    this.#running = false;
    this.#starting = false;
    this.#watcher?.close();
    this.#watcher = undefined;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending.clear();
    this.#scanPending = false;
    for (const cursor of this.#cursors.values()) cursor.partial.fill(0);
    for (const buffer of this.#inFlightBuffers) buffer.fill(0);
    this.#cursors.clear();
    this.#status({ state, ...(code ? { code } : {}) });
  }
  #inside(path: string): boolean {
    const part = relative(this.#root, path);
    return part !== '' && part !== '..' && !part.startsWith('..\\') && !part.startsWith('../') && !isAbsolute(part);
  }
  #queue(path: string): void {
    if (this.#pending.size >= CODEX_SOURCE_LIMITS.pendingPaths && !this.#pending.has(path)) {
      this.#halt('error', 'SOURCE_LIMIT'); return;
    }
    this.#pending.add(path);
  }
  #schedule(): void {
    if (!this.#running || this.#starting || this.#timer || this.#draining) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#drain(this.#generation);
    }, 20);
    this.#timer.unref();
  }
  async #enumerate(generation: number): Promise<string[]> {
    const files: string[] = [];
    const directories: Array<{ path: string; depth: number }> = [{ path: this.#root, depth: 0 }];
    let entries = 0;
    for (let index = 0; index < directories.length; index++) {
      const directory = directories[index]!;
      const metadata = await lstat(directory.path);
      const canonical = await realpath(directory.path);
      if (generation !== this.#generation) return [];
      if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== directory.path) continue;
      const children = await opendir(directory.path);
      for await (const child of children) {
        if (generation !== this.#generation) return [];
        if (++entries > CODEX_SOURCE_LIMITS.entries) throw new SourceLimitError();
        if (child.isSymbolicLink()) continue;
        const path = join(directory.path, child.name);
        if (child.isDirectory()) {
          if (directory.depth < CODEX_SOURCE_LIMITS.depth && directories.length < CODEX_SOURCE_LIMITS.directories)
            directories.push({ path, depth: directory.depth + 1 });
          else throw new SourceLimitError();
        } else if (child.isFile() && extname(child.name).toLowerCase() === '.jsonl') {
          if (files.length >= CODEX_SOURCE_LIMITS.files) throw new SourceLimitError();
          files.push(path);
        }
      }
    }
    return files;
  }
  async #metadata(path: string): Promise<{ identity: string; size: number } | undefined> {
    if (!this.#inside(path)) return;
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) return;
      const canonical = await realpath(path);
      if (!this.#inside(canonical)) return;
      // Reject a symlink/junction in any parent rather than following a watched path elsewhere.
      const comparable = (value: string) => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
      if (comparable(canonical) !== comparable(path)) return;
      return { identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, size: stat.size };
    } catch { return; }
  }
  async #drain(generation: number): Promise<void> {
    if (this.#draining || generation !== this.#generation || !this.#running) return;
    this.#draining = true;
    try {
      if (this.#scanPending) {
        this.#scanPending = false;
        const files = await this.#enumerate(generation);
        if (generation !== this.#generation) return;
        for (const path of files) this.#queue(path);
      }
      while (this.#pending.size && generation === this.#generation && this.#running) {
        const path = this.#pending.values().next().value!;
        this.#pending.delete(path);
        await this.#read(path, generation);
      }
    } catch (error) {
      if (generation === this.#generation) {
        if (error instanceof SourceLimitError) this.#halt('error', 'SOURCE_LIMIT');
        else this.#warn('SOURCE_READ_FAILED');
      }
    } finally {
      this.#draining = false;
      if (this.#pending.size || this.#scanPending) this.#schedule();
    }
  }
  async #read(path: string, generation: number): Promise<void> {
    const metadata = await this.#metadata(path);
    if (generation !== this.#generation) return;
    // Retain the old boundary across a remove/rename notification; a replacement at the
    // same path must be baselined as rotation rather than replayed from its beginning.
    if (!metadata) return;
    let cursor = this.#cursors.get(path);
    if (!cursor) {
      if (this.#cursors.size >= CODEX_SOURCE_LIMITS.files) { this.#halt('error', 'SOURCE_LIMIT'); return; }
      cursor = { identity: metadata.identity, offset: 0, partial: Buffer.alloc(0), dropping: false };
      this.#cursors.set(path, cursor);
    } else if (cursor.identity !== metadata.identity || metadata.size < cursor.offset) {
      // Replacement/truncation has no reliable boundary. Start at EOF and report the gap.
      cursor = { identity: metadata.identity, offset: metadata.size, partial: Buffer.alloc(0), dropping: false };
      this.#cursors.set(path, cursor);
      this.#warn('SOURCE_ROTATED'); return;
    }
    if (metadata.size - cursor.offset > CODEX_SOURCE_LIMITS.backlogBytes) {
      cursor.offset = metadata.size; cursor.partial = Buffer.alloc(0); cursor.dropping = false;
      this.#warn('SOURCE_BACKLOG_LIMIT'); return;
    }
    const handle = await open(path, 'r');
    try {
      const actual = await handle.stat();
      if (generation !== this.#generation || `${actual.dev}:${actual.ino}:${actual.birthtimeMs}` !== cursor.identity) return;
      // Verify the resolved pathname again after opening; never read through a replaced junction.
      const checked = await this.#metadata(path);
      if (generation !== this.#generation || checked?.identity !== cursor.identity) return;
      while (cursor.offset < metadata.size && generation === this.#generation && this.#running) {
        const buffer = Buffer.alloc(Math.min(CODEX_SOURCE_LIMITS.readBytes, metadata.size - cursor.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, cursor.offset);
        if (generation !== this.#generation || !bytesRead) return;
        cursor.offset += bytesRead;
        this.#inFlightBuffers.add(buffer);
        try { await this.#consume(cursor, buffer.subarray(0, bytesRead), generation); }
        finally { buffer.fill(0); this.#inFlightBuffers.delete(buffer); }
      }
    } finally { await handle.close(); }
  }
  async #consume(cursor: Cursor, input: Buffer, generation: number): Promise<void> {
    let start = 0;
    while (start < input.length && generation === this.#generation && this.#running) {
      const newline = input.indexOf(10, start);
      const end = newline === -1 ? input.length : newline;
      const part = input.subarray(start, end);
      if (!cursor.dropping) {
        if (cursor.partial.length + part.length > CODEX_SOURCE_LIMITS.lineBytes) {
          cursor.partial = Buffer.alloc(0); cursor.dropping = true; this.#warn('SOURCE_RECORD_LIMIT');
        } else {
          const previous = cursor.partial;
          cursor.partial = Buffer.concat([previous, part]);
          previous.fill(0);
        }
      }
      if (newline === -1) return;
      if (!cursor.dropping && cursor.partial.length) {
        const line = cursor.partial;
        cursor.partial = Buffer.alloc(0);
        this.#inFlightBuffers.add(line);
        try { await this.#deliver(line, cursor.identity, cursor.offset - input.length + newline, generation); }
        finally { line.fill(0); this.#inFlightBuffers.delete(line); }
      }
      cursor.dropping = false;
      cursor.partial = Buffer.alloc(0);
      start = newline + 1;
    }
  }
  async #deliver(line: Buffer, identity: string, endOffset: number, generation: number): Promise<void> {
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); } catch { return; }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('type' in value) || value.type !== 'event_msg' || !('payload' in value)) return;
    const payload = value.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('type' in payload) || payload.type !== 'user_message' || !('message' in payload) || typeof payload.message !== 'string') return;
    const text = payload.message;
    if (!text.trim() || Buffer.byteLength(text, 'utf8') > CODEX_SOURCE_LIMITS.textBytes) { this.#warn('SOURCE_RECORD_LIMIT'); return; }
    if (generation !== this.#generation || !this.#running) return;
    const eventId = createHash('sha256').update(identity).update(':').update(String(endOffset)).update(':').update(line).digest('hex');
    try {
      await this.#options.onSnapshot({ source: 'codex-local-session', quality: 'draft_snapshot', sourceMethod: 'local_transcript', text, observedAt: new Date().toISOString(), eventId });
    } catch {
      if (generation === this.#generation) this.#warn('SOURCE_DELIVERY_FAILED');
    }
  }
}
