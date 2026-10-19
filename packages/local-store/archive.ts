import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { PromptRecord } from '../contracts/generated.ts';
import { assertPromptRecord } from '../contracts/validate.ts';
import { redactText } from '../capture-core/redact.ts';

export interface PendingOperation {
  operationId: string;
  recordId: string;
  kind: 'put' | 'delete';
}
const STORE_MARKER = Buffer.from('promteSaver-encrypted-records-v1');

/** M0 prototype: encrypted payloads in SQLite, not SQLCipher/full-file encryption. */
export class EncryptedArchive {
  #db: DatabaseSync;
  #key: Buffer;
  #closed = false;

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
    this.#db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.#db.exec('COMMIT'); return result; }
    catch { this.#db.exec('ROLLBACK'); throw new Error('Archive transaction failed'); }
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
      try { this.#db.close(); }
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
