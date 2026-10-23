import { validateAISettings, type AISettings } from './ai-settings.ts';
import { BoundedTopK } from './top-k.ts';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { PromptRecord } from '../contracts/generated.ts';
import { assertPromptRecord } from '../contracts/validate.ts';
import { redactText } from '../capture-core/redact.ts';
import { DEFAULT_PREFERENCES, validatePreferences, type VaultPreferences } from './preferences.ts';
import { validateStyleProfile, type StyleProfile } from '../writing-style/profile.ts';

export interface PendingOperation {
  operationId: string;
  recordId: string;
  kind: 'put' | 'delete';
}
export type LibraryKind = 'prompt' | 'template';
export interface LibraryEntry {
  id: string;
  title: string;
  body: string;
  kind: LibraryKind;
  project: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  redactions: number;
  revision: number;
  notes?: string;
  source?: string;
  useCount?: number;
  lastUsedAt?: string | null;
  deletedAt?: string | null;
  captureId?: string;
}
/** Short-lived editing work, never a captured prompt or a committed library version. */
export interface EditorDraft {
  id: string;
  updatedAt: string;
  title: string;
  body: string;
  kind: LibraryKind;
  project: string;
  tags: string;
  pinned: boolean;
  notes: string;
  source: string;
}
export type DraftInput = Omit<EditorDraft, 'updatedAt'>;
export const MAX_EDITOR_DRAFTS = 8;
const DRAFT_PREFIX = 'editor-draft-v1:';
const DRAFT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export interface LibraryInput {
  title: string;
  body: string;
  kind?: LibraryKind;
  project?: string;
  tags?: string[];
  pinned?: boolean;
  notes?: string;
  source?: string;
}

export type LibraryFilter = 'all' | 'pinned' | 'templates' | 'prompts' | 'trash' | 'recent';
export interface LibraryQuery {
  query?: string;
  filter?: LibraryFilter;
  project?: string;
  tag?: string;
  sort?: 'updated' | 'popular' | 'relevance';
  limit?: number;
  offset?: number;
}
export interface LibraryPage { items: LibraryEntry[]; total: number; limit: number; offset: number; }
/** A user-approved style profile. Analysis samples are never kept apart from reviewed excerpts. */
export interface SavedStyle {
  id: string;
  name: string;
  profile: StyleProfile;
  createdAt: string;
  updatedAt: string;
  revision: number;
  redactions: number;
}
export type StyleSummary = Omit<SavedStyle, 'profile'> & { sampleCount: number; wordCount: number; tone: string };
export const MAX_WRITING_STYLES = 16;
export function styleETag(item: SavedStyle): string {
  return '"' + createHash('sha256').update(JSON.stringify({name:item.name,profile:item.profile,revision:item.revision})).digest('hex') + '"';
}
export class StyleConflictError extends Error {
  constructor() { super('This writing profile changed in another window. Reload it before editing.'); }
}

export interface ArchiveSnapshot {
  version: 1 | 2 | 3 | 4;
  tombstones?: string[];
  exportedAt: string;
  items: LibraryEntry[];
  histories: { id: string; revisions: LibraryEntry[] }[];
  captures: PromptRecord[];
  styles?: SavedStyle[];
}

export const MAX_SNAPSHOT_ITEMS = 10000;
export const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
/** A content precondition; usage-count changes deliberately do not cause edit conflicts. */
export function libraryETag(item: LibraryEntry): string {
  const content = { id: item.id, title: item.title, body: item.body, kind: item.kind,
    project: item.project, tags: item.tags, pinned: item.pinned, notes: item.notes ?? '',
    source: item.source ?? '', revision: item.revision, deletedAt: item.deletedAt ?? null };
  return '"' + createHash('sha256').update(JSON.stringify(content)).digest('hex') + '"';
}
export class LibraryConflictError extends Error {
  constructor() { super('This prompt changed in another window. Reopen it or save your draft as a new prompt.'); }
}
export interface BatchInput {
  operation: 'pin' | 'unpin' | 'move' | 'trash' | 'restore';
  entries: { id: string; etag: string }[];
  project?: string;
}
const STORE_MARKER = Buffer.from('promteSaver-encrypted-records-v1');

/** M0 prototype: encrypted payloads in SQLite, not SQLCipher/full-file encryption. */
export class EncryptedArchive {
  #db: DatabaseSync;
  #key: Buffer;
  #closed = false;
  #transactionDepth = 0;
  #dataVersion = 0;
  // Only IDs and counts are cached. Prompt bodies are never retained across queries.
  #queryCache = new Map<string, { ids: string[]; total: number }>();
  #cacheEntries = 8;
  #facetsCache: { projects:{name:string;count:number}[];tags:{name:string;count:number}[] } | undefined;

  constructor(path: string, key: Uint8Array) {
    if (key.byteLength !== 32) throw new Error('A 32-byte archive key is required');
    if (path !== ':memory:') {
      try { if (!lstatSync(path).isFile()) throw new Error('Archive path must be a regular file'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    this.#key = Buffer.from(key);
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec('PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON;');
      const tables = this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      if (tables.length === 0) this.#initialize();
      const marker = this.#db.prepare("SELECT payload FROM metadata WHERE name='key-check'").get();
      if (!marker) throw new Error('Invalid archive');
      const actual = this.#open('key-check', marker.payload as Uint8Array);
      if (actual.length !== STORE_MARKER.length || !timingSafeEqual(actual, STORE_MARKER)) throw new Error('Invalid archive');
      // Only alter journal mode after the existing key has been authenticated.
      this.#db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      // Additive migration only after authentication. Text, tags and project stay encrypted.
      this.#db.exec(`CREATE TABLE IF NOT EXISTS library (
        id TEXT PRIMARY KEY, payload BLOB NOT NULL, kind TEXT NOT NULL,
        pinned INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS library_recent ON library(pinned DESC, updated_at DESC);
      CREATE TABLE IF NOT EXISTS library_history (
        item_id TEXT NOT NULL, revision INTEGER NOT NULL, payload BLOB NOT NULL,
        PRIMARY KEY(item_id, revision)
      ) STRICT;`);
      const fields = this.#db.prepare('PRAGMA table_info(library)').all().map(row => row.name);
      if (!fields.includes('deleted_at')) this.#db.exec('ALTER TABLE library ADD COLUMN deleted_at TEXT');
      this.#db.exec('CREATE INDEX IF NOT EXISTS library_visible ON library(deleted_at, pinned DESC, updated_at DESC)');
      this.#db.exec('CREATE TABLE IF NOT EXISTS writing_styles(id TEXT PRIMARY KEY, payload BLOB NOT NULL) STRICT;');
      this.#applyResourceProfile(this.preferences().lowMemory);
    } catch {
      this.#db.close(); this.#key.fill(0); this.#closed = true;
      throw new Error('Archive could not be opened with this key or format');
    }
  }

  #initialize(): void {
    this.#db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE metadata(name TEXT PRIMARY KEY, payload BLOB NOT NULL) STRICT;
      CREATE TABLE records(id TEXT PRIMARY KEY, payload BLOB NOT NULL) STRICT;
      CREATE TABLE tombstones(id TEXT PRIMARY KEY) STRICT;
      CREATE TABLE outbox(sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT UNIQUE NOT NULL,
        record_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('put','delete'))) STRICT;`);
    try {
      this.#db.prepare('INSERT INTO metadata VALUES (?, ?)').run('key-check', this.#seal('key-check', STORE_MARKER));
      this.#db.exec('COMMIT');
    } catch { this.#db.exec('ROLLBACK'); throw new Error('Archive initialization failed'); }
  }
  #ensureOpen(): void { if (this.#closed) throw new Error('Archive is closed'); }
  #seal(context: string, plaintext: Uint8Array): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, nonce);
    cipher.setAAD(Buffer.from(`promteSaver:v1:${context}`));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]);
  }
  #open(context: string, envelope: Uint8Array): Buffer {
    const bytes = Buffer.from(envelope);
    if (bytes.length < 29 || bytes[0] !== 1) throw new Error('Invalid encrypted record');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(1, 13));
      decipher.setAAD(Buffer.from(`promteSaver:v1:${context}`));
      decipher.setAuthTag(bytes.subarray(13, 29));
      return Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]);
    } catch { throw new Error('Encrypted record authentication failed'); }
  }
  #transaction<T>(work: () => T): T {
    this.#ensureOpen();
    if (this.#transactionDepth) return work();
    this.#db.exec('BEGIN IMMEDIATE'); this.#transactionDepth++;
    try { const result = work(); this.#db.exec('COMMIT'); return result; }
    catch { this.#db.exec('ROLLBACK'); throw new Error('Archive transaction failed'); }
    finally { this.#transactionDepth--; }
  }
  /** Limit SQLite's page cache and temporary-sort footprint on constrained devices. */
  #applyResourceProfile(lowMemory: boolean): void {
    this.#cacheEntries = lowMemory ? 2 : 8;
    this.#db.exec(`PRAGMA cache_size=${lowMemory ? -1024 : -2048}; PRAGMA temp_store=${lowMemory ? 'FILE' : 'MEMORY'}; PRAGMA mmap_size=0`);
  }
  #invalidate(): void { this.#facetsCache = undefined; this.#queryCache.clear(); }
  #checkExternalWrites(): void {
    const version = Number(this.#db.prepare('PRAGMA data_version').get()!.data_version);
    if (version !== this.#dataVersion) { this.#invalidate(); this.#dataVersion = version; }
  }
  preferences(): VaultPreferences {
    this.#ensureOpen();
    const row = this.#db.prepare("SELECT payload FROM metadata WHERE name='preferences-v1'").get();
    if (!row) return { ...DEFAULT_PREFERENCES };
    return validatePreferences(JSON.parse(this.#open('preferences-v1', row.payload as Uint8Array).toString('utf8')));
  }
  setPreferences(input: unknown): VaultPreferences {
    this.#ensureOpen(); const preferences = validatePreferences(input);
    const payload = this.#seal('preferences-v1', Buffer.from(JSON.stringify(preferences)));
    this.#db.prepare("INSERT INTO metadata(name,payload) VALUES('preferences-v1',?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload").run(payload);
    this.#applyResourceProfile(preferences.lowMemory); this.#invalidate();
    return preferences;
  }
  /** Provider secrets stay encrypted and are deliberately excluded from portable snapshots. */
  aiSettings(): AISettings | undefined {
    this.#ensureOpen();
    const row=this.#db.prepare("SELECT payload FROM metadata WHERE name='groq-config-v1'").get();
    if(!row)return undefined;
    const plain=this.#open('groq-config-v1',row.payload as Uint8Array);
    try{return validateAISettings(JSON.parse(plain.toString('utf8')));}finally{plain.fill(0);}
  }
  setAISettings(value: unknown): void {
    this.#ensureOpen();const settings=validateAISettings(value);
    const plain=Buffer.from(JSON.stringify(settings));
    try{this.#db.prepare("INSERT INTO metadata(name,payload) VALUES('groq-config-v1',?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload")
      .run(this.#seal('groq-config-v1',plain));}finally{plain.fill(0);}
  }
  deleteAISettings(): void {
    this.#ensureOpen();this.#db.prepare("DELETE FROM metadata WHERE name='groq-config-v1'").run();
  }
  /** One transaction links immutable redacted evidence to an editable library copy. */
  saveBrowserCapture(record: PromptRecord): {saved:boolean;redactions:number} {
    this.#ensureOpen();assertPromptRecord(record);
    return this.#transaction(()=>{
      if(this.#db.prepare('SELECT 1 FROM tombstones WHERE id=?').get(record.id)||this.get(record.id))return {saved:false,redactions:0};
      this.put(record);
      const safe=this.get(record.id)!;
      const saved=this.saveLibrary({title:safe.text.trim().split('\n')[0]!.slice(0,100)||'Captured prompt',body:safe.text,
        kind:'prompt',project:'Browser inbox',source:safe.surface.appId,tags:['browser-capture','draft-snapshot'],
        notes:'Observed at a send action; delivery is not verified. Captured '+safe.recordedAt+'. Original evidence is separate from this editable copy.'});
      const item={...saved.item,captureId:record.id};
      this.#db.prepare('UPDATE library SET payload=? WHERE id=?').run(this.#seal(`library:${item.id}`,Buffer.from(JSON.stringify(item))),item.id);
      return {saved:true,redactions:safe.redactions+saved.redactions};
    });
  }
  /** Encrypted opt-in writing profiles. Only random IDs appear in SQLite columns. */
  #decodeStyle(id: string, payload: Uint8Array): SavedStyle {
    let value: SavedStyle;
    try { value = JSON.parse(this.#open(`writing-style:${id}`, payload).toString('utf8')) as SavedStyle; }
    catch { throw new Error('Encrypted writing profile authentication failed'); }
    if (value.id !== id || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
        !Number.isSafeInteger(value.redactions) || value.redactions < 0 ||
        typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
        typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
        typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))
      throw new Error('Invalid encrypted writing profile');
    value.profile = validateStyleProfile(value.profile);
    return value;
  }
  #safeStyle(profile: unknown): {profile:StyleProfile;redactions:number} {
    const source = validateStyleProfile(profile);
    let redactions=0;
    const clean = (text: string) => { const result=redactText(text); redactions+=result.count; return result.text; };
    const safe = { ...source, examples:source.examples.map(clean), preferredPhrases:source.preferredPhrases.map(clean),
      preferences:{tone:clean(source.preferences.tone), audience:clean(source.preferences.audience), avoid:source.preferences.avoid.map(clean)} };
    return {profile:validateStyleProfile(safe),redactions};
  }
  listStyles(): StyleSummary[] {
    this.#ensureOpen();
    return this.#db.prepare('SELECT id,payload FROM writing_styles ORDER BY id').all().map(row=>{
      const item=this.#decodeStyle(row.id as string,row.payload as Uint8Array);
      const {profile: _private, ...publicFields}=item;
      return {...publicFields, sampleCount:item.profile.sampleCount, wordCount:item.profile.wordCount, tone:item.profile.preferences.tone};
    }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
  }
  getStyle(id: string): SavedStyle | undefined {
    this.#ensureOpen();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid writing profile');
    const row=this.#db.prepare('SELECT payload FROM writing_styles WHERE id=?').get(id);
    return row ? this.#decodeStyle(id,row.payload as Uint8Array) : undefined;
  }
  checkStyleEdit(id: string, expected: string | undefined): SavedStyle {
    const existing=this.getStyle(id);
    if (!existing) throw new Error('Writing profile not found');
    if (expected !== undefined && expected !== styleETag(existing)) throw new StyleConflictError();
    return existing;
  }
  saveStyle(input: {name:string;profile:unknown}, id?:string): SavedStyle {
    this.#ensureOpen();
    if (!input || typeof input !== 'object' || Object.keys(input).some(k=>!['name','profile'].includes(k)) ||
        typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80)
      throw new Error('Invalid writing profile');
    const safe=this.#safeStyle(input.profile);
    const safeName=redactText(input.name.trim());
    const existing=id ? this.getStyle(id) : undefined;
    if (id && !existing) throw new Error('Writing profile not found');
    if (!id && this.listStyles().length >= MAX_WRITING_STYLES) throw new Error('Writing profile limit reached');
    const now=new Date().toISOString(); const key=id ?? randomUUID();
    const entry:SavedStyle={id:key,name:safeName.text,profile:safe.profile,
      createdAt:existing?.createdAt ?? now,updatedAt:now,revision:(existing?.revision??0)+1,
      redactions:(existing?.redactions??0)+safe.redactions+safeName.count};
    this.#db.prepare('INSERT INTO writing_styles(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload')
      .run(key,this.#seal(`writing-style:${key}`,Buffer.from(JSON.stringify(entry))));
    return entry;
  }
  deleteStyle(id: string): boolean {
    this.#ensureOpen();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid writing profile');
    return this.#db.prepare('DELETE FROM writing_styles WHERE id=?').run(id).changes>0;
  }
  /** Editor recovery is encrypted with the vault key. Never store draft bodies in web storage. */
  listDrafts(): EditorDraft[] {
    this.#ensureOpen();
    const rows = this.#db.prepare('SELECT name,payload FROM metadata WHERE name LIKE ? ORDER BY name LIMIT ?')
      .all(`${DRAFT_PREFIX}%`, MAX_EDITOR_DRAFTS + 1);
    if (rows.length > MAX_EDITOR_DRAFTS) throw new Error('Invalid editor draft count');
    return rows.map(row => {
      const name = row.name as string;
      const id = name.slice(DRAFT_PREFIX.length);
      if (!DRAFT_ID.test(id)) throw new Error('Invalid encrypted editor draft identity');
      let value: EditorDraft;
      try { value = JSON.parse(this.#open(name, row.payload as Uint8Array).toString('utf8')) as EditorDraft; }
      catch { throw new Error('Encrypted editor draft authentication failed'); }
      if (value.id !== id) throw new Error('Invalid encrypted editor draft identity');
      this.#validateDraft(value);
      if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))
        throw new Error('Invalid encrypted editor draft timestamp');
      return value;
    }).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  #validateDraft(input: DraftInput): void {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['id','updatedAt','title','body','kind','project','tags','pinned','notes','source'].includes(key)) ||
      !DRAFT_ID.test(input.id) || typeof input.title !== 'string' || input.title.length > 140 ||
      typeof input.body !== 'string' || input.body.length > 100_000 ||
      !['prompt','template'].includes(input.kind) || typeof input.project !== 'string' || input.project.length > 80 ||
      typeof input.tags !== 'string' || input.tags.length > 1000 || typeof input.pinned !== 'boolean' ||
      typeof input.notes !== 'string' || input.notes.length > 2000 ||
      typeof input.source !== 'string' || input.source.length > 80) throw new Error('Invalid editor draft');
  }
  saveDraft(input: DraftInput): EditorDraft {
    this.#ensureOpen(); this.#validateDraft(input);
    const name = DRAFT_PREFIX + input.id;
    if (!this.#db.prepare('SELECT 1 FROM metadata WHERE name=?').get(name) &&
        Number(this.#db.prepare('SELECT COUNT(*) AS total FROM metadata WHERE name LIKE ?').get(`${DRAFT_PREFIX}%`)!.total) >= MAX_EDITOR_DRAFTS)
      throw new Error('Editor draft limit reached; recover or discard an older draft');
    const draft: EditorDraft = { ...input, updatedAt: new Date().toISOString() };
    this.#db.prepare('INSERT INTO metadata(name,payload) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload')
      .run(name, this.#seal(name, Buffer.from(JSON.stringify(draft))));
    return draft;
  }
  deleteDraft(id: string): boolean {
    this.#ensureOpen();
    if (!DRAFT_ID.test(id)) throw new Error('Invalid editor draft');
    return this.#db.prepare('DELETE FROM metadata WHERE name=?').run(DRAFT_PREFIX + id).changes !== 0;
  }
  checkEdit(id: string, expected: string | undefined): LibraryEntry {
    const item = this.getLibrary(id);
    if (!item) throw new Error('Library item not found');
    if (expected !== undefined && expected !== libraryETag(item)) throw new LibraryConflictError();
    return item;
  }
  batchLibrary(input: BatchInput): { changed: number } {
    this.#ensureOpen();
    if (!input || !['pin','unpin','move','trash','restore'].includes(input.operation) ||
        !Array.isArray(input.entries) || input.entries.length < 1 || input.entries.length > 100 ||
        input.entries.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.etag !== 'string') ||
        new Set(input.entries.map(entry => entry.id)).size !== input.entries.length ||
        (input.operation === 'move' && (typeof input.project !== 'string' || input.project.length > 80))) throw new Error('Invalid library batch');
    const items = input.entries.map(entry => this.checkEdit(entry.id, entry.etag));
    if (items.some(item => input.operation === 'restore' ? !item.deletedAt : !!item.deletedAt)) throw new Error('Invalid library batch state');
    this.#transaction(() => {
      for (const item of items) {
        if (input.operation === 'trash') this.deleteLibrary(item.id);
        else if (input.operation === 'restore') this.undeleteLibrary(item.id);
        else this.saveLibrary({ title: item.title, body: item.body, kind: item.kind,
          tags: item.tags, project: input.operation === 'move' ? input.project! : item.project,
          pinned: input.operation === 'pin' ? true : input.operation === 'unpin' ? false : item.pinned,
          notes: item.notes ?? '', source: item.source ?? '' }, item.id);
      }
    });
    this.#invalidate(); return { changed: items.length };
  }
  put(input: PromptRecord): boolean {
    this.#ensureOpen(); assertPromptRecord(input);
    const record = sanitizeRecord(input);
    return this.#transaction(() => {
      if (this.#db.prepare('SELECT 1 FROM tombstones WHERE id=?').get(record.id)) return false;
      const existing = this.get(record.id);
      if (existing) {
        if (!isDeepStrictEqual(existing, record)) throw new Error('Conflicting source record');
        return false;
      }
      const payload = this.#seal(`record:${record.id}`, Buffer.from(JSON.stringify(record)));
      this.#db.prepare('INSERT INTO records VALUES (?, ?)').run(record.id, payload);
      this.#db.prepare('INSERT INTO outbox(operation_id,record_id,kind) VALUES (?,?,?)').run(randomUUID(), record.id, 'put');
      return true;
    });
  }
  get(id: string): PromptRecord | undefined {
    this.#ensureOpen();
    const row = this.#db.prepare('SELECT payload FROM records WHERE id=?').get(id);
    if (!row) return undefined;
    let value: unknown;
    try { value = JSON.parse(this.#open(`record:${id}`, row.payload as Uint8Array).toString('utf8')); }
    catch { throw new Error('Encrypted record authentication failed'); }
    assertPromptRecord(value);
    if (value.id !== id) throw new Error('Encrypted record identity mismatch');
    return value;
  }
  search(query: string, limit = 20): PromptRecord[] {
    this.#ensureOpen(); boundedLimit(limit, 100);
    const needle = query.normalize('NFKC').toLocaleLowerCase();
    if (!needle.trim()) return [];
    const results: PromptRecord[] = [];
    for (const row of this.#db.prepare('SELECT id FROM records ORDER BY rowid DESC').iterate()) {
      const record = this.get(row.id as string)!;
      if (record.text.normalize('NFKC').toLocaleLowerCase().includes(needle)) results.push(record);
      if (results.length >= limit) break;
    }
    return results;
  }
  /** Explicitly saved prompt/template library, separate from immutable capture evidence. */
  saveLibrary(input: LibraryInput, id?: string): { item: LibraryEntry; redactions: number } {
    this.#ensureOpen();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid library item');
    if (Object.keys(input).some(key => !['title','body','kind','project','tags','pinned','notes','source'].includes(key))) throw new Error('Invalid library item');
    const existing = id === undefined ? undefined : this.getLibrary(id);
    if (id !== undefined && !existing) throw new Error('Library item not found');
    if (existing?.deletedAt) throw new Error('Restore item before editing');
    const { title, body, kind = 'prompt', project = '', tags = [], pinned = false,
      notes = existing?.notes ?? '', source = existing?.source ?? '' } = input;
    if (typeof title !== 'string' || !title.trim() || title.length > 140 ||
        typeof body !== 'string' || !body.trim() || body.length > 100_000 ||
        !['prompt','template'].includes(kind) || typeof project !== 'string' || project.length > 80 ||
        typeof notes !== 'string' || notes.length > 2000 || typeof source !== 'string' || source.length > 80 ||
        typeof pinned !== 'boolean' || !Array.isArray(tags) || tags.length > 12 ||
        tags.some(tag => typeof tag !== 'string' || tag.length > 32 || !tag.trim())) throw new Error('Invalid library item');
    if (id !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid library item');
    const clean = [title.trim(), body.trim(), project.trim(), notes.trim(), source.trim(), ...tags].map(redactText);
    const redactions = clean.reduce((n, item) => n + item.count, 0);
    const safeTags = [...new Set(clean.slice(5).map(part => part.text.trim()).filter(Boolean))];
    const now = new Date().toISOString();
    const contentChanged = existing !== undefined && (
      existing.title !== clean[0]!.text || existing.body !== clean[1]!.text ||
      existing.kind !== kind || existing.project !== clean[2]!.text ||
      (existing.notes ?? '') !== clean[3]!.text || (existing.source ?? '') !== clean[4]!.text ||
      JSON.stringify(existing.tags) !== JSON.stringify(safeTags)
    );
    const item: LibraryEntry = {
      id: id ?? randomUUID(), title: clean[0]!.text, body: clean[1]!.text, kind, project: clean[2]!.text,
      notes: clean[3]!.text, source: clean[4]!.text, tags: safeTags, pinned,
      createdAt: existing?.createdAt ?? now, updatedAt: existing && !contentChanged ? existing.updatedAt : now,
      redactions: (existing?.redactions ?? 0) + redactions,
      revision: (existing?.revision ?? 1) + (contentChanged ? 1 : 0),
      useCount: existing?.useCount ?? 0, lastUsedAt: existing?.lastUsedAt ?? null, deletedAt: null,
      ...(existing?.captureId ? {captureId:existing.captureId} : {})
    };
    const envelope = this.#seal(`library:${item.id}`, Buffer.from(JSON.stringify(item)));
    this.#transaction(() => {
      if (existing && contentChanged) {
        this.#db.prepare('INSERT OR IGNORE INTO library_history(item_id,revision,payload) VALUES (?,?,?)')
          .run(existing.id, existing.revision, this.#seal(`history:${existing.id}:${existing.revision}`, Buffer.from(JSON.stringify(existing))));
        // Prevent unlimited encrypted revision history from consuming storage on long-lived low-spec devices.
        this.#db.prepare(`DELETE FROM library_history WHERE item_id=? AND revision NOT IN
          (SELECT revision FROM library_history WHERE item_id=? ORDER BY revision DESC LIMIT 25)`).run(existing.id, existing.id);
      }
      this.#db.prepare(`INSERT INTO library(id,payload,kind,pinned,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,NULL)
        ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, kind=excluded.kind,
        pinned=excluded.pinned, updated_at=excluded.updated_at, deleted_at=NULL`).run(item.id, envelope, item.kind,
        item.pinned ? 1 : 0, item.createdAt, item.updatedAt);
    });
    this.#invalidate();
    return { item, redactions };
  }
  #decodeLibrary(id: string, envelope: Uint8Array): LibraryEntry {
    let item: LibraryEntry;
    try { item = JSON.parse(this.#open(`library:${id}`, envelope).toString('utf8')) as LibraryEntry; }
    catch { throw new Error('Encrypted library item authentication failed'); }
    if (item.id !== id || typeof item.body !== 'string' || typeof item.title !== 'string') throw new Error('Invalid encrypted library item');
    item.revision ??= 1;
    item.notes ??= ''; item.source ??= ''; item.useCount ??= 0; item.lastUsedAt ??= null; item.deletedAt ??= null;
    return item;
  }
  getLibrary(id: string): LibraryEntry | undefined {
    this.#ensureOpen();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid library item');
    const row = this.#db.prepare('SELECT payload FROM library WHERE id=?').get(id);
    return row ? this.#decodeLibrary(id, row.payload as Uint8Array) : undefined;
  }
  listLibrary(query = '', filter: LibraryFilter = 'all', limit = 100): LibraryEntry[] {
    return this.queryLibrary({ query, filter, limit }).items;
  }
  /** Plaintext query is evaluated only while unlocked; no plaintext FTS table is persisted. */
  queryLibrary(input: LibraryQuery = {}): LibraryPage {
    this.#ensureOpen(); this.#checkExternalWrites();
    const { query = '', filter = 'all', project = '', tag = '', sort = 'updated', limit = 40, offset = 0 } = input;
    boundedLimit(limit, 100);
    if (typeof query !== 'string' || query.length > 200 || typeof project !== 'string' || project.length > 80 ||
        typeof tag !== 'string' || tag.length > 32 ||
        !['all','pinned','templates','prompts','trash','recent'].includes(filter) ||
        !['updated','popular','relevance'].includes(sort) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
      throw new Error('Invalid library query');
    const normalize = (value: string) => value.normalize('NFKC').toLowerCase();
    const terms = normalize(query).trim().split(/\s+/u).filter(Boolean).slice(0, 12);
    const wantProject = normalize(project); const wantTag = normalize(tag);
    const visible = filter === 'trash' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
    const condition = filter === 'pinned' ? ' AND pinned=1' : filter === 'templates' ? " AND kind='template'" : filter === 'prompts' ? " AND kind='prompt'" : '';
    const where = `WHERE ${visible}${condition}`;
    if (!terms.length && !wantProject && !wantTag && sort === 'updated' && filter !== 'recent') {
      const total = Number(this.#db.prepare(`SELECT COUNT(*) AS total FROM library ${where}`).get()!.total);
      const rows = this.#db.prepare(`SELECT id,payload FROM library ${where} ORDER BY pinned DESC, updated_at DESC, id ASC LIMIT ? OFFSET ?`).all(limit, offset);
      return { items: rows.map(row => this.#decodeLibrary(row.id as string, row.payload as Uint8Array)), total, limit, offset };
    }
    const cacheKey = JSON.stringify([query,filter,project,tag,sort,limit,offset]);
    const cached = this.#queryCache.get(cacheKey);
    if (cached) {
      this.#queryCache.delete(cacheKey); this.#queryCache.set(cacheKey, cached);
      return { items: cached.ids.map(id => this.getLibrary(id)!), total: cached.total, offset, limit };
    }
    type Ranked = { id: string; pinned: boolean; updatedAt: string; useCount?: number; lastUsedAt?: string | null };
    let total = 0;
    const windowSize = offset + limit;
    const compare = (a: {item: Ranked;score:number},b: {item: Ranked;score:number}): number => {
      if (filter === 'recent') return (b.item.lastUsedAt ?? '').localeCompare(a.item.lastUsedAt ?? '') || a.item.id.localeCompare(b.item.id);
      if (sort === 'popular') return (b.item.useCount ?? 0)-(a.item.useCount ?? 0) || b.item.updatedAt.localeCompare(a.item.updatedAt) || a.item.id.localeCompare(b.item.id);
      if (sort === 'relevance' && terms.length && a.score !== b.score) return b.score-a.score;
      return Number(b.item.pinned)-Number(a.item.pinned) || b.item.updatedAt.localeCompare(a.item.updatedAt) || a.item.id.localeCompare(b.item.id);
    };
    // Keep only ranking metadata. Heap insertion/replacement is O(log K), without O(K) splice moves.
    // Memory remains O(offset+limit); full-text decryption is still O(n), not an indexed search.
    const best = new BoundedTopK<{ item: Ranked; score: number }>(windowSize, compare);
    for (const row of this.#db.prepare(`SELECT id,payload FROM library ${where}`).iterate()) {
      const item = this.#decodeLibrary(row.id as string, row.payload as Uint8Array);
      if (filter === 'recent' && !(item.useCount ?? 0)) continue;
      if (wantProject && normalize(item.project) !== wantProject) continue;
      if (wantTag && !item.tags.some(t => normalize(t) === wantTag)) continue;
      // A project/reuse filter without text terms should never normalize 100k-character bodies.
      // Full-text remains a bounded-memory decrypting scan until a reviewed private index exists.
      const title = terms.length ? normalize(item.title) : '';
      const body = terms.length ? normalize(item.body) : '';
      const tags = terms.length ? normalize(item.tags.join(' ')) : '';
      const metadata = terms.length ? normalize(`${item.project} ${item.notes ?? ''} ${item.source ?? ''}`) : '';
      if (terms.some(term => ![title,body,tags,metadata].some(field => field.includes(term)))) continue;
      total++;
      const score = terms.length ? terms.reduce((sum,term) => sum + (title.includes(term)?10:0) +
        (tags.includes(term)?6:0) + (metadata.includes(term)?3:0) + (body.includes(term)?1:0),0) : 0;
      const candidate = { item: { id: item.id, pinned: item.pinned, updatedAt: item.updatedAt,
        useCount: item.useCount ?? 0, lastUsedAt: item.lastUsedAt ?? null }, score };
      best.add(candidate);
    }
    const ids = best.sorted().slice(offset).map(entry => entry.item.id);
    this.#queryCache.set(cacheKey, { ids, total });
    while (this.#queryCache.size > this.#cacheEntries) this.#queryCache.delete(this.#queryCache.keys().next().value!);
    return { items: ids.map(id => this.getLibrary(id)!), total, offset, limit };
  }
  libraryFacets(): { projects: {name:string;count:number}[]; tags: {name:string;count:number}[] } {
    this.#ensureOpen();
    this.#checkExternalWrites();
    if (this.#facetsCache) return structuredClone(this.#facetsCache);
    const projects = new Map<string,number>(); const tags = new Map<string,number>();
    for (const row of this.#db.prepare('SELECT id,payload FROM library WHERE deleted_at IS NULL').iterate()) {
      const item = this.#decodeLibrary(row.id as string, row.payload as Uint8Array);
      if (item.project) projects.set(item.project, (projects.get(item.project) ?? 0) + 1);
      for (const tag of item.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
    const ranked = (source: Map<string,number>) => [...source].map(([name,count]) => ({name,count}))
      .sort((a,b) => b.count-a.count || a.name.localeCompare(b.name));
    this.#facetsCache = { projects: ranked(projects), tags: ranked(tags) };
    return structuredClone(this.#facetsCache);
  }
  recordUse(id: string): LibraryEntry {
    this.#ensureOpen();
    const existing = this.getLibrary(id);
    if (!existing || existing.deletedAt) throw new Error('Library item not found');
    const item = { ...existing, useCount: Math.min((existing.useCount ?? 0) + 1, 1_000_000_000), lastUsedAt: new Date().toISOString() };
    this.#db.prepare('UPDATE library SET payload=? WHERE id=?').run(this.#seal(`library:${id}`, Buffer.from(JSON.stringify(item))), id);
    this.#invalidate();
    return item;
  }
  libraryHistory(id: string): LibraryEntry[] {
    this.#ensureOpen();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid library item');
    if (!this.getLibrary(id)) throw new Error('Library item not found');
    return this.#db.prepare('SELECT revision,payload FROM library_history WHERE item_id=? ORDER BY revision DESC LIMIT 25')
      .all(id).map(row => {
        const revision = row.revision as number;
        const item = JSON.parse(this.#open(`history:${id}:${revision}`, row.payload as Uint8Array).toString('utf8')) as LibraryEntry;
        if (item.id !== id || item.revision !== revision) throw new Error('Invalid encrypted history identity');
        return item;
      });
  }
  restoreLibrary(id: string, revision: number): LibraryEntry {
    this.#ensureOpen();
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid revision');
    const previous = this.libraryHistory(id).find(item => item.revision === revision);
    if (!previous) throw new Error('Revision not found');
    return this.saveLibrary({ title: previous.title, body: previous.body, kind: previous.kind,
      project: previous.project, tags: previous.tags, pinned: previous.pinned,
      notes: previous.notes ?? '', source: previous.source ?? '' }, id).item;
  }
  /** Move an item to an undoable trash instead of immediately destroying it. */
  deleteLibrary(id: string): boolean {
    this.#ensureOpen();
    const existing = this.getLibrary(id);
    if (!existing || existing.deletedAt) return false;
    const deletedAt = new Date().toISOString();
    const item = { ...existing, deletedAt };
    const deleted = Number(this.#db.prepare('UPDATE library SET payload=?,deleted_at=? WHERE id=? AND deleted_at IS NULL')
      .run(this.#seal(`library:${id}`, Buffer.from(JSON.stringify(item))), deletedAt, id).changes) > 0;
    if (deleted) this.#invalidate();
    return deleted;
  }
  undeleteLibrary(id: string): LibraryEntry {
    this.#ensureOpen();
    const existing = this.getLibrary(id);
    if (!existing?.deletedAt) throw new Error('Item is not in trash');
    const item = { ...existing, deletedAt: null };
    this.#db.prepare('UPDATE library SET payload=?,deleted_at=NULL WHERE id=?').run(this.#seal(`library:${id}`, Buffer.from(JSON.stringify(item))), id);
    this.#invalidate();
    return item;
  }
  purgeLibrary(id: string): boolean {
    this.#ensureOpen();
    const existing = this.getLibrary(id);
    if (!existing?.deletedAt) throw new Error('Item is not in trash');
    const result = this.#transaction(() => {
      this.#db.prepare('DELETE FROM library_history WHERE item_id=?').run(id);
      if(existing.captureId)this.delete(existing.captureId);
      return Number(this.#db.prepare('DELETE FROM library WHERE id=?').run(id).changes) > 0;
    });
    this.#invalidate();
    return result;
  }
  libraryStats(): { all: number; templates: number; pinned: number } {
    this.#ensureOpen();
    const row = this.#db.prepare(`SELECT COUNT(*) AS all_count,
      COALESCE(SUM(CASE WHEN kind='template' THEN 1 ELSE 0 END),0) AS templates,
      COALESCE(SUM(CASE WHEN pinned=1 THEN 1 ELSE 0 END),0) AS pinned FROM library WHERE deleted_at IS NULL`).get()!;
    return { all: Number(row.all_count), templates: Number(row.templates), pinned: Number(row.pinned) };
  }
  trashCount(): number {
    this.#ensureOpen();
    return Number(this.#db.prepare('SELECT COUNT(*) AS count FROM library WHERE deleted_at IS NOT NULL').get()!.count);
  }
  /** Portable export includes history and source evidence but deliberately excludes any session/master keys. */
  exportSnapshot(): ArchiveSnapshot {
    this.#ensureOpen();
    for (const table of ['library','records','tombstones','writing_styles']) {
      if (Number(this.#db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count) > MAX_SNAPSHOT_ITEMS)
        throw new Error('Backup exceeds the current 10,000-item per-table limit');
    }
    let bytes = 0;
    const budget = (value: unknown) => {
      bytes += Buffer.byteLength(JSON.stringify(value), 'utf8') + 2;
      if (bytes > MAX_SNAPSHOT_BYTES - 2048) throw new Error('Backup exceeds the current 12 MiB limit');
    };
    const items: LibraryEntry[] = [];
    const histories: ArchiveSnapshot['histories'] = [];
    for (const row of this.#db.prepare('SELECT id,payload FROM library ORDER BY id').iterate()) {
      const id = row.id as string;
      const item = this.#decodeLibrary(id, row.payload as Uint8Array);
      const history = { id, revisions: this.libraryHistory(id) };
      budget(item); budget(history); items.push(item); histories.push(history);
    }
    const captures: PromptRecord[] = [];
    for (const row of this.#db.prepare('SELECT id FROM records ORDER BY rowid').iterate()) {
      const record = this.get(row.id as string)!; budget(record); captures.push(record);
    }
    const tombstones = this.#db.prepare('SELECT id FROM tombstones ORDER BY id').all().map(row => row.id as string);
    budget(tombstones);
    const styles=this.#db.prepare('SELECT id,payload FROM writing_styles ORDER BY id').all().map(row=>this.#decodeStyle(row.id as string,row.payload as Uint8Array));
    styles.forEach(budget);
    return { version: items.some(item=>item.captureId) ? 4 : 3, exportedAt: new Date().toISOString(), items, histories, captures, tombstones, styles };
  }
  #validateSnapshot(snapshot: ArchiveSnapshot): void {
    if (!snapshot || ![1,2,3,4].includes(snapshot.version) || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.histories) || !Array.isArray(snapshot.captures) ||
        snapshot.items.length > MAX_SNAPSHOT_ITEMS || snapshot.histories.length > MAX_SNAPSHOT_ITEMS || snapshot.captures.length > MAX_SNAPSHOT_ITEMS ||
        (snapshot.version >= 3 && (!Array.isArray(snapshot.styles) || snapshot.styles.length > MAX_WRITING_STYLES)))
      throw new Error('Invalid backup contents');
    if (snapshot.version < 3 && snapshot.styles !== undefined) throw new Error('Invalid backup writing profiles');
    if (snapshot.version >= 3) {
      const styleIds=new Set<string>();
      for(const item of snapshot.styles ?? []) {
        try {
          if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
              styleIds.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 ||
              !Number.isSafeInteger(item.revision) || item.revision < 1 ||
              !Number.isSafeInteger(item.redactions) || item.redactions < 0 ||
              typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) ||
              typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt)))
            throw new Error('bad profile');
          validateStyleProfile(item.profile); styleIds.add(item.id);
        } catch { throw new Error('Invalid backup writing profiles'); }
      }
    }
    const identifiers = new Set<string>();
    const validItem = (item: LibraryEntry): boolean => !!item && typeof item === 'object' &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(item.id) && typeof item.title === 'string' && !!item.title.trim() && item.title.length <= 140 &&
      typeof item.body === 'string' && !!item.body.trim() && item.body.length <= 100000 && ['prompt','template'].includes(item.kind) &&
      typeof item.project === 'string' && item.project.length <= 80 && (item.notes === undefined || typeof item.notes === 'string' && item.notes.length <= 2000) &&
      (item.captureId === undefined || typeof item.captureId === 'string' && /^[a-f0-9-]{36}$/.test(item.captureId)) &&
      (item.source === undefined || typeof item.source === 'string' && item.source.length <= 80) && Array.isArray(item.tags) && item.tags.length <= 12 &&
      item.tags.every(t => typeof t === 'string' && t.length <= 32) && typeof item.pinned === 'boolean' &&
      typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) && typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)) &&
      Number.isSafeInteger(item.revision) && item.revision >= 1 && Number.isSafeInteger(item.redactions) && item.redactions >= 0 &&
      (item.useCount === undefined || Number.isSafeInteger(item.useCount) && item.useCount >= 0) &&
      (item.lastUsedAt == null || typeof item.lastUsedAt === 'string' && Number.isFinite(Date.parse(item.lastUsedAt))) &&
      (item.deletedAt == null || typeof item.deletedAt === 'string' && Number.isFinite(Date.parse(item.deletedAt)));
    if (!snapshot.items.every(item => validItem(item) && !identifiers.has(item.id) && !!identifiers.add(item.id))) throw new Error('Invalid backup contents');
    if (!snapshot.histories.every(entry => !!entry && typeof entry.id === 'string' && identifiers.has(entry.id) &&
      Array.isArray(entry.revisions) && entry.revisions.length <= 25 && entry.revisions.every(rev => validItem(rev) && rev.id === entry.id)))
      throw new Error('Invalid backup contents');
    const historyIds = new Set<string>();
    const current = new Map(snapshot.items.map(item => [item.id, item]));
    for (const group of snapshot.histories) {
      if (historyIds.has(group.id) || new Set(group.revisions.map(item => item.revision)).size !== group.revisions.length ||
          group.revisions.some(item => item.revision >= current.get(group.id)!.revision || item.captureId !== current.get(group.id)!.captureId)) throw new Error('Invalid backup history');
      historyIds.add(group.id);
    }
    const captures = new Set<string>();
    for (const capture of snapshot.captures) {
      try { assertPromptRecord(capture); } catch { throw new Error('Invalid backup capture'); }
      if (captures.has(capture.id)) throw new Error('Invalid backup duplicate capture');
      captures.add(capture.id);
    }
    const linked=new Set<string>();
    for(const item of snapshot.items)if(item.captureId){
      if(snapshot.version!==4 || !captures.has(item.captureId)||linked.has(item.captureId))throw new Error('Invalid backup capture link');
      linked.add(item.captureId);
    }
    if (snapshot.tombstones !== undefined && (!Array.isArray(snapshot.tombstones) ||
        snapshot.tombstones.length > MAX_SNAPSHOT_ITEMS || new Set(snapshot.tombstones).size !== snapshot.tombstones.length ||
        snapshot.tombstones.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || captures.has(id))))
      throw new Error('Invalid backup tombstones');
  }
  previewSnapshot(snapshot: ArchiveSnapshot): { imported: number; skipped: number; conflicts: number; captures: number; deletions: number; styles: number; legacy: boolean } {
    this.#ensureOpen(); this.#validateSnapshot(snapshot);
    let skipped = 0; let conflicts = 0; let captures = 0; let deletions = 0;
    for (const item of snapshot.items) {
      const existing = this.getLibrary(item.id);
      if (!existing && item.captureId && (this.#db.prepare('SELECT 1 FROM tombstones WHERE id=?').get(item.captureId) || snapshot.tombstones?.includes(item.captureId))) {skipped++;continue;}
      if (existing) { skipped++; if (libraryETag(existing) !== libraryETag(this.#sanitizeImportedItem(item))) conflicts++; }
    }
    for (const capture of snapshot.captures) {
      if (!this.get(capture.id) && !this.#db.prepare('SELECT 1 FROM tombstones WHERE id=?').get(capture.id)) captures++;
    }
    for (const id of snapshot.tombstones ?? []) if (this.get(id)) deletions++;
    const styles=(snapshot.styles ?? []).filter(style=>!this.getStyle(style.id)).length;
    return { imported: snapshot.items.length - skipped, skipped, conflicts, captures, deletions, styles, legacy: snapshot.version < 3 };
  }
  importSnapshot(snapshot: ArchiveSnapshot): { imported: number; skipped: number; captures: number } {
    this.#ensureOpen();
    this.#validateSnapshot(snapshot);
    let imported = 0; let skipped = 0; let captures = 0;
    const histories = new Map(snapshot.histories.map(group => [group.id, group.revisions]));
    if ((snapshot.styles ?? []).filter(style=>!this.getStyle(style.id)).length + this.listStyles().length > MAX_WRITING_STYLES)
      throw new Error('Writing profile limit reached');
    this.#transaction(() => {
      // Deletion evidence survives restore. A later older backup cannot resurrect these captures.
      const deletedCaptures = new Set(snapshot.tombstones ?? []);
      // Apply linked deletions in one bounded scan rather than scanning the archive per tombstone.
      if (deletedCaptures.size) for (const row of this.#db.prepare('SELECT id FROM library').all()) {
        const item = this.getLibrary(row.id as string);
        if (item?.captureId && deletedCaptures.has(item.captureId)) {
          this.#db.prepare('DELETE FROM library_history WHERE item_id=?').run(item.id);
          this.#db.prepare('DELETE FROM library WHERE id=?').run(item.id);
        }
      }
      for (const id of deletedCaptures) this.delete(id);
      for (const item of snapshot.items) {
        if (this.#db.prepare('SELECT 1 FROM library WHERE id=?').get(item.id) || (item.captureId && this.#db.prepare('SELECT 1 FROM tombstones WHERE id=?').get(item.captureId))) { skipped++; continue; }
        const sanitized = this.#sanitizeImportedItem(item);
        this.#db.prepare('INSERT INTO library(id,payload,kind,pinned,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?)')
          .run(item.id, this.#seal(`library:${item.id}`, Buffer.from(JSON.stringify(sanitized))), sanitized.kind, sanitized.pinned ? 1 : 0, sanitized.createdAt, sanitized.updatedAt, sanitized.deletedAt ?? null);
        for (const revision of histories.get(item.id) ?? []) {
          const safe = this.#sanitizeImportedItem(revision);
          this.#db.prepare('INSERT INTO library_history(item_id,revision,payload) VALUES(?,?,?)')
            .run(item.id, revision.revision, this.#seal(`history:${item.id}:${revision.revision}`, Buffer.from(JSON.stringify(safe))));
        }
        imported++;
      }
      for (const style of snapshot.styles ?? []) {
        if (this.#db.prepare('SELECT 1 FROM writing_styles WHERE id=?').get(style.id)) continue;
        const cleaned=this.#safeStyle(style.profile);
        const safeName=redactText(style.name);
        const safe: SavedStyle={...style,name:safeName.text,profile:cleaned.profile,redactions:style.redactions+cleaned.redactions+safeName.count};
        this.#db.prepare('INSERT INTO writing_styles(id,payload) VALUES(?,?)')
          .run(style.id,this.#seal(`writing-style:${style.id}`,Buffer.from(JSON.stringify(safe))));
      }
      for (const capture of snapshot.captures) {
        if (this.#db.prepare('SELECT 1 FROM records WHERE id=?').get(capture.id) || this.#db.prepare('SELECT 1 FROM tombstones WHERE id=?').get(capture.id)) continue;
        const safe = sanitizeRecord(capture);
        this.#db.prepare('INSERT INTO records(id,payload) VALUES(?,?)').run(safe.id, this.#seal(`record:${safe.id}`, Buffer.from(JSON.stringify(safe))));
        captures++;
      }
    });
    this.#invalidate();
    return { imported, skipped, captures };
  }
  #sanitizeImportedItem(item: LibraryEntry): LibraryEntry {
    const clean = [item.title, item.body, item.project, item.notes ?? '', item.source ?? '', ...item.tags].map(redactText);
    const values = clean.map(value => value.text);
    return { id: item.id, title: values[0]!, body: values[1]!, kind: item.kind,
      project: values[2]!, notes: values[3]!, source: values[4]!, tags: [...new Set(values.slice(5))],
      pinned: item.pinned, createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString(),
      revision: item.revision, redactions: item.redactions + clean.reduce((count,value) => count + value.count, 0),
      useCount: Math.min(item.useCount ?? 0, 1_000_000_000), lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt).toISOString() : null,
      deletedAt: item.deletedAt ? new Date(item.deletedAt).toISOString() : null, ...(item.captureId ? {captureId:item.captureId} : {}) };
  }
  /** Deleting evidence from Captured also removes its linked editable copy and history. */
  deleteCaptureWithCopies(id: string): void {
    this.#ensureOpen();
    this.#transaction(()=>{
      for(const row of this.#db.prepare('SELECT id FROM library').all()) {
        const item=this.getLibrary(row.id as string);
        if(item?.captureId===id){this.#db.prepare('DELETE FROM library_history WHERE item_id=?').run(item.id);this.#db.prepare('DELETE FROM library WHERE id=?').run(item.id);}
      }
      this.delete(id);
    });
    this.#invalidate();
  }
  recentCaptures(limit = 20): PromptRecord[] {
    this.#ensureOpen(); boundedLimit(limit, 100);
    return this.#db.prepare('SELECT id FROM records ORDER BY rowid DESC LIMIT ?').all(limit).map(row => this.get(row.id as string)!);
  }

  pending(limit = 100): PendingOperation[] {
    this.#ensureOpen(); boundedLimit(limit, 1000);
    return this.#db.prepare('SELECT operation_id,record_id,kind FROM outbox ORDER BY sequence LIMIT ?').all(limit).map(row => ({
      operationId: row.operation_id as string, recordId: row.record_id as string, kind: row.kind as 'put' | 'delete'
    }));
  }
  acknowledge(operationIds: readonly string[]): number {
    if (operationIds.length > 1000 || operationIds.some(id => typeof id !== 'string' || id.length > 100)) throw new Error('Invalid acknowledgment batch');
    return this.#transaction(() => {
      const statement = this.#db.prepare('DELETE FROM outbox WHERE operation_id=?');
      return operationIds.reduce((total, id) => total + Number(statement.run(id).changes), 0);
    });
  }
  delete(id: string): void {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid record identifier');
    this.#transaction(() => {
      if (this.#db.prepare('SELECT 1 FROM tombstones WHERE id=?').get(id)) return;
      this.#db.prepare('INSERT INTO tombstones VALUES (?)').run(id);
      this.#db.prepare('DELETE FROM records WHERE id=?').run(id);
      this.#db.prepare('DELETE FROM outbox WHERE record_id=?').run(id);
      this.#db.prepare('INSERT INTO outbox(operation_id,record_id,kind) VALUES (?,?,?)').run(randomUUID(), id, 'delete');
    });
  }
  stats(): { records: number; pending: number; tombstones: number } {
    this.#ensureOpen();
    const count = (table: string) => Number(this.#db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count);
    return { records: count('records'), pending: count('outbox'), tombstones: count('tombstones') };
  }
  close(): void {
    if (!this.#closed) {
      try { this.#invalidate(); try { this.#db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } finally { this.#db.close(); } }
      finally { this.#key.fill(0); this.#closed = true; }
    }
  }
}

function boundedLimit(limit: number, max: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new Error('Invalid result limit');
}
function sanitizeRecord(input: PromptRecord): PromptRecord {
  const result = structuredClone(input);
  const clean = redactText(result.text); result.text = clean.text; result.redactions += clean.count;
  for (const key of ['surfaceId', 'appId', 'editorId', 'title'] as const) {
    const value = result.surface[key];
    if (value !== undefined) { const cleanValue = redactText(value); result.surface[key] = cleanValue.text; result.redactions += cleanValue.count; }
  }
  if (result.sourceMessageId !== undefined) { const cleanId = redactText(result.sourceMessageId); result.sourceMessageId = cleanId.text; result.redactions += cleanId.count; }
  return result;
}
