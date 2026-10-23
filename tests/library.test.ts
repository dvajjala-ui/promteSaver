import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
import { record, temporaryArchive } from './helpers.ts';

test('local library CRUD, search, tags, pinning, templates, lock/reopen and captures coexist', () => {
  const temp = temporaryArchive(); let archive = new EncryptedArchive(temp.path, temp.key);
  try {
    archive.put(record('capture-record', 'Captured synthetic prompt'));
    let { item, redactions } = archive.saveLibrary({ title: 'Review PR', body: 'Find bugs in {{code}}', kind: 'template', tags: ['dev','review'], project: 'Sample', pinned: true });
    assert.equal(redactions, 0);
    const second = archive.saveLibrary({ title: 'Meeting summary', body: 'Summarize these notes', kind: 'prompt' }).item;
    assert.deepEqual(archive.libraryStats(), { all: 2, templates: 1, pinned: 1 });
    assert.deepEqual(archive.listLibrary('code').map(i => i.id), [item.id]);
    assert.equal(archive.listLibrary('dev').length, 1);
    assert.equal(archive.listLibrary('sample').length, 1);
    assert.deepEqual(archive.listLibrary('', 'pinned').map(i => i.id), [item.id]);
    assert.deepEqual(archive.listLibrary('', 'templates').map(i => i.id), [item.id]);
    assert.deepEqual(archive.listLibrary('', 'prompts').map(i => i.id), [second.id]);
    assert.equal(archive.recentCaptures()[0]?.id, 'capture-record');
    ({ item } = archive.saveLibrary({ title: 'Review PR improved', body: 'Inspect {{source}}', kind: 'template', project: 'Sample', tags: ['dev'], pinned: false }, item.id));
    assert.equal(item.title, 'Review PR improved');
    assert.equal(archive.listLibrary('', 'pinned').length, 0);
    assert.equal(archive.deleteLibrary(second.id), true);
    assert.equal(archive.deleteLibrary(second.id), false);
    assert.deepEqual(archive.libraryStats(), { all: 1, templates: 1, pinned: 0 });
    archive.close(); archive = new EncryptedArchive(temp.path, temp.key);
    assert.equal(archive.getLibrary(item.id)?.body, 'Inspect {{source}}');
    assert.equal(archive.stats().records, 1);
  } finally { archive.close(); temp.cleanup(); }
});

test('revision history is encrypted, can restore an earlier version, and is removed on delete', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    const original = archive.saveLibrary({ title:'v1', body:'one', pinned:false }).item;
    assert.equal(original.revision,1);
    const changed = archive.saveLibrary({ title:'v2', body:'two', pinned:false }, original.id).item;
    assert.equal(changed.revision,2);
    const pinned = archive.saveLibrary({ title:'v2', body:'two', pinned:true }, original.id).item;
    assert.equal(pinned.revision,2, 'pin toggle should not create noise in version history');
    const history = archive.libraryHistory(original.id);
    assert.equal(history.length,1);
    assert.equal(history[0]!.title,'v1');
    const restored = archive.restoreLibrary(original.id,1);
    assert.equal(restored.revision,3);
    assert.equal(restored.title,'v1');
    assert.equal(archive.libraryHistory(original.id).length,2);
    assert.throws(() => archive.restoreLibrary(original.id,88), /Revision not found/);
    assert.equal(archive.deleteLibrary(original.id), true);
    assert.equal(archive.libraryStats().all, 0);
    assert.equal(archive.trashCount(), 1);
    assert.equal(archive.libraryHistory(original.id).length, 2, 'trash preserves revision history');
    archive.undeleteLibrary(original.id);
    assert.equal(archive.libraryStats().all, 1);
    archive.deleteLibrary(original.id);
    assert.equal(archive.purgeLibrary(original.id), true);
    assert.throws(() => archive.libraryHistory(original.id), /not found/);
  } finally { archive.close(); temp.cleanup(); }
});

test('library encrypts sensitive fields; plaintext canaries absent in SQLite/WAL', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    const item = archive.saveLibrary({ title: 'PRIVATE_TITLE_CANARY_1234', body: 'PRIVATE_BODY_CANARY_5678', project: 'PRIVATE_PROJECT_CANARY', tags: ['PRIVATE_TAG_CANARY'] }).item;
    assert.match(archive.getLibrary(item.id)!.body, /PRIVATE_BODY_CANARY/);
    for (const filename of readdirSync(temp.directory)) {
      const bytes = readFileSync(join(temp.directory, filename));
      for (const canary of ['PRIVATE_TITLE_CANARY','PRIVATE_BODY_CANARY','PRIVATE_PROJECT_CANARY','PRIVATE_TAG_CANARY']) assert.equal(bytes.includes(Buffer.from(canary)), false, `${canary} leaked to ${filename}`);
    }
  } finally { archive.close(); temp.cleanup(); }
});

test('library redacts credential patterns and rejects malformed input and encryption tampering', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  const inspector = new DatabaseSync(temp.path);
  try {
    const { item, redactions } = archive.saveLibrary({ title: 'example', body: 'My api_key=ABCD1234567890xyz' });
    assert.equal(redactions, 1);
    assert.equal(item.body, 'My [REDACTED]');
    assert.throws(() => archive.saveLibrary({ title: 'x', body: '', tags: [] }), /Invalid library/);
    assert.throws(() => archive.saveLibrary({ title: 'x', body: 'y', tags: ['a'.repeat(40)] }), /Invalid library/);
    assert.throws(() => archive.saveLibrary({ title: 'x', body: 'y' }, 'not-found'), /not found/);
    assert.throws(() => archive.listLibrary('x', 'wrong' as 'all'), /Invalid library query/);
    const data = Buffer.from(inspector.prepare('SELECT payload FROM library WHERE id=?').get(item.id)!.payload as Uint8Array);
    data[data.length-1] = data[data.length-1]! ^ 1;
    inspector.prepare('UPDATE library SET payload=? WHERE id=?').run(data, item.id);
    assert.throws(() => archive.getLibrary(item.id), /authentication failed/);
  } finally { inspector.close(); archive.close(); temp.cleanup(); }
});
