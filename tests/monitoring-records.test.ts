import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PromptRecord } from '../packages/contracts/generated.ts';
import { assertPromptRecord } from '../packages/contracts/validate.ts';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
import { fieldSnapshot, notepadSnapshot } from '../apps/local-web/keyboard-capture.ts';
import { encryptBackup, decryptBackup } from '../apps/local-web/backup.ts';
import { record, temporaryArchive } from './helpers.ts';

function monitoringRecord(sessionId: string = randomUUID(), fieldId: string = randomUUID(), sourceSequence = 1): PromptRecord {
  return { schemaVersion: 1, id: randomUUID(), deviceId: 'windows-monitoring-session', sourceSequence,
    recordedAt: '2026-10-31T00:00:00.000Z',
    surface: {surfaceId: sessionId, appId: 'syntheticeditor.exe', editorId: fieldId,
      classification: 'unknown', protection: 'normal', privateMode: false},
    text: '\nSYNTHETIC_MONITORING_PARAGRAPH_CANARY_78143\r\n\r\nSecond paragraph.\n第三段。\n',
    quality: 'draft_snapshot', sourceMethod: 'editor_snapshot', origin: 'unknown', redactions: 0 };
}

test('monitoring contract admits only bounded draft evidence with opaque session and field identities', () => {
  const accepted = monitoringRecord();
  assert.doesNotThrow(() => assertPromptRecord(accepted));
  const reject = (edit: (value: PromptRecord) => void) => {
    const candidate = structuredClone(accepted); edit(candidate);
    assert.throws(() => assertPromptRecord(candidate), /Invalid prompt record|Ineligible prompt surface/);
  };
  reject(value => { value.surface.surfaceId = 'syntheticeditor.exe'; });
  reject(value => { value.surface.editorId = 'focused-field'; });
  reject(value => { value.surface.editorId = '00000000-0000-1000-8000-000000000000'; });
  reject(value => { value.id = 'not-an-opaque-observation'; });
  reject(value => { value.surface.appId = 'chrome.exe'; });
  reject(value => { value.surface.appId = 'bitwarden.exe'; });
  reject(value => { value.surface.appId = 'SyntheticEditor.exe'; });
  reject(value => { value.surface.classification = 'prompt'; });
  reject(value => { value.surface.classification = 'other'; });
  reject(value => { value.surface.protection = 'unknown'; });
  reject(value => { value.surface.protection = 'protected'; });
  reject(value => { value.surface.privateMode = true; });
  reject(value => { value.surface.title = 'Unapproved window metadata'; });
  reject(value => { value.sourceMessageId = 'unverified-submission'; });
  reject(value => { value.quality = 'exact_submitted'; });
  reject(value => { value.sourceMethod = 'submission_hook'; });
  reject(value => { value.origin = 'user'; });
  reject(value => { value.sourceSequence = 0; });
  reject(value => { value.sourceSequence = 1.5; });
  reject(value => { value.sourceSequence = Number.MAX_SAFE_INTEGER + 1; });
  reject(value => { value.text = ' '; });
  reject(value => { value.text = 'x'.repeat(50_001); });
  reject(value => { value.deviceId = 'unrecognized-monitoring-producer'; });
  assert.doesNotThrow(() => assertPromptRecord(record()), 'existing ordinary prompt records remain supported');
  assert.throws(() => assertPromptRecord({...accepted, sessionId: randomUUID()}), /Invalid prompt record/,
    'monitoring does not relax the global schema');
});

test('monitoring evidence keeps equal text from independent fields and sessions encrypted and immutable', () => {
  const temp = temporaryArchive(); let archive = new EncryptedArchive(temp.path, temp.key);
  const first = monitoringRecord();
  const second = monitoringRecord(first.surface.surfaceId, randomUUID(), 2);
  const nextSession = monitoringRecord();
  try {
    for (const evidence of [first, second, nextSession]) {
      assert.deepEqual(archive.saveMonitoringCapture(evidence), {saved: true, redactions: 0});
      assert.deepEqual(archive.get(evidence.id), evidence);
    }
    assert.deepEqual(archive.saveMonitoringCapture(first), {saved: false, redactions: 0});
    assert.equal(archive.stats().records, 3);
    const copies = archive.listLibrary();
    assert.equal(copies.length, 3);
    assert.deepEqual(new Set(copies.map(copy => copy.captureId)), new Set([first.id, second.id, nextSession.id]));
    const copy = copies.find(item => item.captureId === first.id)!;
    assert.equal(copy.body, first.text.trim());
    assert.match(copy.notes!, /local monitoring draft/);
    assert.match(copy.notes!, /submission.*unverified/);
    archive.saveLibrary({title: copy.title, body: 'A manually revised template.'}, copy.id);
    assert.equal(archive.get(first.id)!.text, first.text, 'editing a library copy cannot alter captured paragraphs');
    assert.equal(archive.libraryHistory(copy.id)[0]!.captureId, first.id);
    for (const name of readdirSync(temp.directory)) {
      const bytes = readFileSync(join(temp.directory, name));
      for (const canary of ['SYNTHETIC_MONITORING_PARAGRAPH_CANARY_78143', first.surface.surfaceId,
        first.surface.editorId, first.surface.appId])
        assert.equal(bytes.includes(Buffer.from(canary)), false, `Plaintext monitoring data in ${name}`);
    }
    archive.close();
    assert.throws(() => new EncryptedArchive(temp.path, randomBytes(32)), /could not be opened/);
    archive = new EncryptedArchive(temp.path, temp.key);
    for (const evidence of [first, second, nextSession]) assert.deepEqual(archive.get(evidence.id), evidence);
    assert.equal(archive.getLibrary(copy.id)!.body, 'A manually revised template.');
  } finally { archive.close(); temp.cleanup(); }
});

test('monitoring linked writes roll back source evidence if copy persistence fails', () => {
  const temp = temporaryArchive(); const archive = new EncryptedArchive(temp.path, temp.key);
  const inspector = new DatabaseSync(temp.path);
  try {
    inspector.exec("CREATE TRIGGER fail_monitoring_copy BEFORE INSERT ON library BEGIN SELECT RAISE(ABORT,'synthetic copy failure'); END");
    assert.throws(() => archive.saveMonitoringCapture(monitoringRecord()), /transaction failed/);
    assert.deepEqual(archive.stats(), {records: 0, pending: 0, tombstones: 0});
    assert.equal(archive.libraryStats().all, 0);
    assert.throws(() => archive.saveMonitoringCapture(record()), /Invalid monitoring capture/);
  } finally { inspector.close(); archive.close(); temp.cleanup(); }
});

test('portable backups retain monitoring identities, legacy captures and linked deletion tombstones', () => {
  const source = temporaryArchive(), destination = temporaryArchive();
  const archive = new EncryptedArchive(source.path, source.key);
  const restored = new EncryptedArchive(destination.path, destination.key);
  const first = monitoringRecord(), second = monitoringRecord(first.surface.surfaceId, randomUUID(), 2);
  const backupPassword = 'Synthetic-Monitoring-Backup-Passphrase-01';
  try {
    archive.saveMonitoringCapture(first); archive.saveMonitoringCapture(second);
    const now = new Date().toISOString();
    const field = fieldSnapshot({eventId: randomUUID(), source: 'sampleeditor.exe',
      text: 'Synthetic legacy field text.', recordedAt: now});
    const notepad = notepadSnapshot({eventId: randomUUID(), text: 'Synthetic legacy Notepad text.', recordedAt: now});
    archive.saveFieldCapture(field); archive.saveKeyboardCapture(notepad);
    const copy = archive.listLibrary().find(item => item.captureId === first.id)!;
    archive.saveLibrary({title: copy.title, body: 'Synthetic revised monitoring copy.'}, copy.id);
    const staleSnapshot = archive.exportSnapshot();
    assert.equal(staleSnapshot.version, 4, 'existing linked-capture backup version is retained');
    const envelope = encryptBackup(staleSnapshot, backupPassword);
    assert.equal(envelope.includes(Buffer.from('SYNTHETIC_MONITORING_PARAGRAPH_CANARY_78143')), false);
    assert.throws(() => decryptBackup(envelope, 'Synthetic-Wrong-Backup-Passphrase-01'), /incorrect or file is damaged/);
    const corrupted = Buffer.from(envelope); corrupted[corrupted.length - 1]! ^= 1;
    assert.throws(() => decryptBackup(corrupted, backupPassword), /incorrect or file is damaged/);
    const decoded = decryptBackup(envelope, backupPassword);
    assert.deepEqual(restored.importSnapshot(decoded), {imported: 4, skipped: 0, captures: 4});
    for (const evidence of [first, second, field, notepad]) assert.deepEqual(restored.get(evidence.id), evidence);
    assert.equal(restored.getLibrary(copy.id)!.captureId, first.id);
    assert.equal(restored.libraryHistory(copy.id)[0]!.body, first.text.trim());

    archive.deleteCaptureWithCopies(first.id);
    assert.equal(archive.getLibrary(copy.id), undefined);
    assert.throws(() => archive.libraryHistory(copy.id), /Library item not found/);
    assert.deepEqual(archive.saveMonitoringCapture(first), {saved: false, redactions: 0});
    const deletionSnapshot = archive.exportSnapshot();
    assert.ok(deletionSnapshot.tombstones!.includes(first.id));
    restored.importSnapshot(deletionSnapshot);
    assert.equal(restored.get(first.id), undefined);
    assert.equal(restored.getLibrary(copy.id), undefined);
    assert.throws(() => restored.libraryHistory(copy.id), /Library item not found/);
    restored.importSnapshot(staleSnapshot);
    assert.equal(restored.get(first.id), undefined, 'stale portable evidence cannot resurrect a tombstone');
    assert.equal(restored.getLibrary(copy.id), undefined, 'stale portable copies cannot resurrect linked content');
    assert.deepEqual(restored.get(second.id), second, 'a same-text observation in another field remains independent');
    assert.deepEqual(restored.saveMonitoringCapture(first), {saved: false, redactions: 0});
  } finally { archive.close(); restored.close(); source.cleanup(); destination.cleanup(); }
});
