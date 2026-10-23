import test from 'node:test';
import assert from 'node:assert/strict';
import { redactText } from '../packages/capture-core/redact.ts';
import { CaptureEngine } from '../packages/capture-core/engine.ts';
import { assertObservation, assertPromptRecord } from '../packages/contracts/validate.ts';
import { event, policy, record, submit, surface } from './helpers.ts';

test('private-key variants and multiword secrets are not retained even with whitespace', () => {
  const secret = '-----BEGIN ENCRYPTED PRIVATE KEY-----\nENCRYPTED_TEST_SECRET\n-----END ENCRYPTED PRIVATE KEY-----';
  const result = redactText(`Before\n${secret}\npassword = my extremely long secret value; next task`);
  assert.equal(result.text.includes('ENCRYPTED_TEST_SECRET'), false);
  assert.equal(result.text.includes('my extremely long secret value'), false);
  assert.match(result.text, /next task/);
  assert.match(redactText('github_pat_'+'x'.repeat(36)).text, /\[REDACTED\]/);
});
test('submission quality remains conservative when only a snapshot and submit signal exist', () => {
  const seen: ReturnType<typeof record>[] = [];
  const engine = new CaptureEngine('test-device', policy, { put: rec => { seen.push(rec); return true; } });
  engine.ingest(event(1, { complete:true, text:'Final text, maybe' }));
  engine.ingest(submit(2));
  assert.equal(seen[0]!.quality, 'draft_snapshot');
  assert.equal(engine.ingest(event(4, { kind:'submit', sourceMethod:'submission_hook', text:'Verified hook text', complete:true })).discontinuity, true);
  assert.equal(seen[1]!.quality, 'exact_submitted');
});
test('schema-subset validation checks conditions, additional properties, types and dates', () => {
  assert.throws(() => assertObservation(event(1,{ kind:'gap', text:'leak', complete:true })), /Invalid/);
  const wrongFocus = event(1, { kind: 'focus', complete: true }); delete wrongFocus.text;
  assert.throws(() => assertObservation(wrongFocus), /Invalid/);
  assert.throws(() => assertObservation(event(1,{ sequence:1.2 })), /Invalid/);
  assert.throws(() => assertObservation(event(1,{ surface:{ ...surface, privateMode:'false' as unknown as boolean } })), /Invalid/);
  assert.throws(() => assertObservation(event(1,{ recordedAt:'2026-13-12T00:00:00.000Z' })), /Invalid/);
  assert.throws(() => assertObservation(event(1,{ sourceMethod:'magic' as 'synthetic_replay' })), /Invalid/);
  assert.throws(() => assertPromptRecord({ ...record(), text:'', redactions:0 }), /Invalid/);
  assert.throws(() => assertPromptRecord({ ...record(), surface:{ ...surface, unexpected:'x' } }), /Invalid/);
});
