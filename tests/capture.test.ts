import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureEngine } from '../packages/capture-core/engine.ts';
import { decideCapture } from '../packages/capture-core/policy.ts';
import { redactText } from '../packages/capture-core/redact.ts';
import { assertObservation, assertPromptRecord } from '../packages/contracts/validate.ts';
import type { PromptRecord } from '../packages/contracts/generated.ts';
import { event, submit, policy, record, surface } from './helpers.ts';

function harness() {
  const records: PromptRecord[] = [];
  const engine = new CaptureEngine('test-device', policy, { put: value => { records.push(structuredClone(value)); return true; } });
  return { engine, records };
}
test('disabled/paused states prevent capture and explicit exclusions override an allowed app', () => {
  assert.equal(decideCapture({ ...policy, enabled: false }, surface), 'disabled');
  assert.equal(decideCapture({ ...policy, excludedAppIds: [surface.appId] }, surface), 'excluded_surface');
  assert.equal(decideCapture({ ...policy, paused: true }, surface), 'paused_by_user');
  assert.equal(decideCapture({ ...policy, permissionGranted: false }, surface), 'permission_missing');
});
test('protected, private, unknown and non-prompt surfaces never reach the sink', () => {
  for (const change of [{ protection: 'protected' }, { protection: 'unknown' }, { privateMode: true }, { classification: 'unknown' }, { classification: 'other' }, { appId: 'other.app' }] as const) {
    const { engine, records } = harness();
    engine.ingest(event(1, { surface: { ...surface, ...change }, text: 'DO_NOT_RETAIN_EXCLUDED' }));
    engine.ingest(submit(2));
    assert.equal(records.length, 0);
  }
});
test('schemas reject unknown properties, invalid times and malformed snapshots without reflecting data', () => {
  for (const invalid of [{ ...event(1), surprise: 'DO_NOT_REFLECT' }, { ...event(1), recordedAt: '2026-02-31T00:00:00.000Z' }, { ...event(1), text: undefined }]) {
    assert.throws(() => assertObservation(invalid), { message: 'Invalid observation' });
  }
  assert.throws(() => assertPromptRecord({ ...record(), surface: { ...surface, protection: 'protected' } }), /Ineligible prompt surface/);
});
test('latest complete snapshot reconciles edits and paste; Enter in text does not submit', () => {
  const { engine, records } = harness();
  engine.ingest(event(1, { text: 'Draft before editing' }));
  engine.ingest(event(2, { text: 'Research only.\nDo not implement. Pasted instructions stay intact.' }));
  assert.equal(records.length, 0);
  engine.ingest(submit(3));
  assert.equal(records[0]!.text, 'Research only.\nDo not implement. Pasted instructions stay intact.');
  assert.equal(records[0]!.quality, 'exact_submitted');
});
test('snapshot replacement handles undo, selected replacement, emoji and mixed language without guessing keys', () => {
  const { engine, records } = harness();
  for (const [index, text] of ['Wrong words', 'Replacement text', 'Wrong words', 'पहले existing code समझो 🚀'].entries()) engine.ingest(event(index + 1, { text }));
  engine.ingest(submit(5));
  assert.equal(records[0]!.text, 'पहले existing code समझो 🚀');
});
test('focus switch cannot submit the previous editor text', () => {
  const { engine, records } = harness(); engine.ingest(event(1));
  engine.ingest(submit(2, { surface: { ...surface, editorId: 'another-editor' } }));
  assert.equal(records.length, 0);
});
test('permission/pause changes and observation gaps clear in-memory drafts', () => {
  for (const mode of ['pause', 'permission', 'gap', 'missing-sequence'] as const) {
    const { engine, records } = harness(); engine.ingest(event(1));
    if (mode === 'pause' || mode === 'permission') {
      engine.setPolicy({ ...policy, paused: mode === 'pause', permissionGranted: mode !== 'permission' }); engine.setPolicy(policy);
      engine.ingest(submit(2));
    } else if (mode === 'gap') {
      const gap = submit(2, { kind: 'gap' }); engine.ingest(gap); engine.ingest(submit(3));
    } else engine.ingest(submit(3));
    assert.equal(records.length, 0, mode);
  }
});
test('partial snapshots remain partial even after a confirmed submission', () => {
  const { engine, records } = harness(); engine.ingest(event(1, { complete: false })); engine.ingest(submit(2));
  assert.equal(records[0]!.quality, 'partial');
});
test('a hook can carry a complete submitted prompt with source provenance', () => {
  const { engine, records } = harness();
  engine.ingest(event(1, { kind: 'submit', sourceMethod: 'submission_hook', sourceMessageId: 'message-42', text: 'Complete hook prompt', complete: true, origin: 'mixed' }));
  assert.equal(records[0]!.quality, 'exact_submitted'); assert.equal(records[0]!.sourceMessageId, 'message-42'); assert.equal(records[0]!.origin, 'mixed');
});
test('duplicate sequence and cross-device input do not produce extra records', () => {
  const { engine, records } = harness(); engine.ingest(event(1, { kind: 'submit' }));
  assert.equal(engine.ingest(event(1, { kind: 'submit' })).state, 'stale');
  assert.throws(() => engine.ingest(event(2, { deviceId: 'wrong-device' })), /Unexpected device/);
  assert.equal(records.length, 1);
});
test('draft retention is opt-in and keeps its quality distinct from submission', () => {
  const { engine, records } = harness(); engine.setPolicy({ ...policy, retainDrafts: true });
  engine.ingest(event(1)); engine.ingest(submit(2));
  assert.deepEqual(records.map(value => value.quality), ['draft_snapshot', 'exact_submitted']);
});
test('redaction runs before sink access and covers metadata as well as body', () => {
  const { engine, records } = harness();
  engine.ingest(event(1, { kind: 'submit', text: 'password=BODY_CANARY_123 research', surface: { ...surface, title: 'api_key=TITLE_CANARY_456' }, sourceMessageId: 'secret=MESSAGE_CANARY_789' }));
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes('CANARY'), false); assert.equal(records[0]!.redactions, 3);
});
test('redaction recognizes private keys, API tokens, bearer tokens and credential URLs', () => {
  const text = '-----BEGIN PRIVATE KEY-----\nCANARY\n-----END PRIVATE KEY----- sk-proj-12345678901234567890 Bearer abcdefghijklmnop https://user:password@example.test/resource';
  const clean = redactText(text);
  assert.equal(clean.count, 4); assert.equal(clean.text.includes('CANARY'), false);
  assert.equal(redactText('Research only; preserve my meaning.').text, 'Research only; preserve my meaning.');
});
test('an incomplete private-key block is redacted before a draft can be retained', () => {
  const { engine, records } = harness(); engine.setPolicy({ ...policy, retainDrafts: true });
  engine.ingest(event(1, { text: 'Example -----BEGIN PRIVATE KEY-----\nINCOMPLETE_PRIVATE_CANARY' }));
  assert.equal(records[0]!.text.includes('INCOMPLETE_PRIVATE_CANARY'), false);
});
test('a failed sink write can retry the same observation without losing a submission', () => {
  const records: PromptRecord[] = []; let fail = true;
  const engine = new CaptureEngine('test-device', policy, { put: value => {
    if (fail) { fail = false; throw new Error('Synthetic disk failure'); }
    records.push(value); return true;
  } });
  engine.ingest(event(1)); const confirmation = submit(2);
  assert.throws(() => engine.ingest(confirmation), /Synthetic disk failure/);
  assert.equal(engine.ingest(confirmation).persisted, true);
  assert.equal(records.length, 1);
});
