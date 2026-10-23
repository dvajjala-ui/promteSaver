import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
import { CaptureEngine } from '../packages/capture-core/engine.ts';
import { event, policy, record, temporaryArchive } from './helpers.ts';

test('archive survives restart and preserves original text plus pending operations', () => {
  const temp = temporaryArchive(); let archive: EncryptedArchive | undefined;
  try {
    archive = new EncryptedArchive(temp.path, temp.key); const original = record(); archive.put(original);
    const operations = archive.pending(); archive.close(); archive = new EncryptedArchive(temp.path, temp.key);
    assert.deepEqual(archive.get(original.id), original); assert.deepEqual(archive.pending(), operations);
    assert.equal(archive.search('RESEARCH').length, 1);
  } finally { archive?.close(); temp.cleanup(); }
});
test('wrong key and malformed key fail without accepting new records', () => {
  const temp = temporaryArchive();
  try {
    const archive = new EncryptedArchive(temp.path, temp.key); archive.put(record()); archive.close();
    assert.throws(() => new EncryptedArchive(temp.path, randomBytes(32)), /could not be opened/);
    assert.throws(() => new EncryptedArchive(temp.path, randomBytes(31)), /32-byte/);
    const reopened = new EncryptedArchive(temp.path, temp.key); assert.equal(reopened.stats().records, 1); reopened.close();
  } finally { temp.cleanup(); }
});
test('plaintext SQLite is not silently adopted as an encrypted archive', () => {
  const temp = temporaryArchive();
  try {
    const db = new DatabaseSync(temp.path); db.exec('CREATE TABLE legacy(text TEXT)'); db.close();
    assert.throws(() => new EncryptedArchive(temp.path, temp.key), /could not be opened/);
  } finally { temp.cleanup(); }
});
test('database and active WAL contain no source-body or source-metadata canaries', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    const input = record('encrypted', 'SYNTHETIC_BODY_MARKER_028346'); input.surface.title = 'SYNTHETIC_TITLE_MARKER_873252'; archive.put(input);
    assert.equal(archive.get(input.id)!.text, input.text);
    for (const name of readdirSync(temp.directory)) {
      const bytes = readFileSync(join(temp.directory, name));
      for (const canary of [input.text, input.surface.title]) assert.equal(bytes.includes(Buffer.from(canary)), false, `Plaintext in ${name}`);
    }
  } finally { archive.close(); temp.cleanup(); }
});
test('replayed puts are idempotent but conflicting immutable source IDs fail', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    assert.equal(archive.put(record()), true); assert.equal(archive.put(record()), false);
    const reordered = Object.fromEntries(Object.entries(record()).reverse()) as ReturnType<typeof record>;
    assert.equal(archive.put(reordered), false);
    assert.throws(() => archive.put(record('record-1', 'different text')), /transaction failed/);
    assert.deepEqual(archive.stats(), { records: 1, pending: 1, tombstones: 0 });
  } finally { archive.close(); temp.cleanup(); }
});
test('record and outbox commit atomically when queue insertion fails', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  const inspector = new DatabaseSync(temp.path);
  try {
    inspector.exec("CREATE TRIGGER fail_enqueue BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    assert.throws(() => archive.put(record()), /transaction failed/);
    assert.deepEqual(archive.stats(), { records: 0, pending: 0, tombstones: 0 });
    inspector.exec('DROP TRIGGER fail_enqueue'); assert.equal(archive.put(record()), true);
  } finally { inspector.close(); archive.close(); temp.cleanup(); }
});
test('only explicitly acknowledged operations leave the offline queue', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    archive.put(record('a')); archive.put(record('b')); const operations = archive.pending();
    assert.equal(archive.acknowledge(['unknown-operation']), 0);
    assert.equal(archive.acknowledge([operations[0]!.operationId]), 1);
    assert.equal(archive.acknowledge([operations[0]!.operationId]), 0);
    assert.equal(archive.pending()[0]!.recordId, 'b'); assert.equal(archive.stats().records, 2);
  } finally { archive.close(); temp.cleanup(); }
});
test('delete removes queued content and tombstone prevents stale resurrection after restart', () => {
  const temp = temporaryArchive(); let archive = new EncryptedArchive(temp.path, temp.key);
  try {
    archive.put(record()); const oldOperation = archive.pending()[0]!.operationId; archive.delete('record-1');
    assert.equal(archive.get('record-1'), undefined); assert.equal(archive.search('research').length, 0);
    assert.equal(archive.pending()[0]!.kind, 'delete'); assert.equal(archive.acknowledge([oldOperation]), 0);
    archive.close(); archive = new EncryptedArchive(temp.path, temp.key);
    assert.equal(archive.put(record()), false); archive.delete('record-1');
    assert.deepEqual(archive.stats(), { records: 0, pending: 1, tombstones: 1 });
  } finally { archive.close(); temp.cleanup(); }
});
test('authenticated encryption rejects payload tampering and swapping record identities', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key); const inspector = new DatabaseSync(temp.path);
  try {
    archive.put(record('a')); archive.put(record('b', 'another synthetic prompt'));
    const payload = Buffer.from(inspector.prepare('SELECT payload FROM records WHERE id=?').get('a')!.payload as Uint8Array);
    inspector.prepare('UPDATE records SET payload=? WHERE id=?').run(payload, 'b');
    assert.throws(() => archive.get('b'), /authentication failed/);
    payload[payload.length - 1] = payload[payload.length - 1]! ^ 1;
    inspector.prepare('UPDATE records SET payload=? WHERE id=?').run(payload, 'a');
    assert.throws(() => archive.get('a'), /authentication failed/);
  } finally { inspector.close(); archive.close(); temp.cleanup(); }
});
test('excluded observations never reach durable records or queue, even with draft retention enabled', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    const engine = new CaptureEngine('test-device', { ...policy, retainDrafts: true }, archive);
    engine.ingest(event(1, { text: 'EXCLUDED_CANARY_8293', surface: { ...event(1).surface, protection: 'protected' } }));
    assert.equal(archive.stats().records, 0); assert.equal(archive.stats().pending, 0);
    for (const name of readdirSync(temp.directory)) assert.equal(readFileSync(join(temp.directory, name)).includes(Buffer.from('EXCLUDED_CANARY_8293')), false);
  } finally { archive.close(); temp.cleanup(); }
});
test('storage applies defense-in-depth redaction and rejects use after close', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    archive.put(record('redacted', 'password=SYNTHETIC_CREDENTIAL_123'));
    assert.equal(archive.get('redacted')!.text, '[REDACTED]'); assert.equal(archive.get('redacted')!.redactions, 1);
    archive.close(); assert.throws(() => archive.search('anything'), /closed/);
  } finally { archive.close(); temp.cleanup(); }
});
