import { randomBytes } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Observation, PromptRecord, Surface } from '../packages/contracts/generated.ts';
import type { CapturePolicy } from '../packages/capture-core/policy.ts';

export const surface: Surface = { surfaceId: 'window-a', appId: 'synthetic.app', editorId: 'editor-a', classification: 'prompt', protection: 'normal', privateMode: false };
export const policy: CapturePolicy = { enabled: true, paused: false, permissionGranted: true, allowedAppIds: ['synthetic.app'], excludedAppIds: [], retainDrafts: false };
export function event(sequence: number, changes: Partial<Observation> = {}): Observation {
  return { schemaVersion: 1, id: `event-${sequence}`, deviceId: 'test-device', sequence, recordedAt: '2026-10-19T00:00:00.000Z',
    kind: 'snapshot', sourceMethod: 'synthetic_replay', origin: 'user', surface: structuredClone(surface), text: 'Synthetic research prompt', complete: true, ...changes };
}
export function submit(sequence: number, changes: Partial<Observation> = {}): Observation {
  const result = event(sequence, { kind: 'submit', ...changes }); delete result.text; delete result.complete; return result;
}
export function record(id = 'record-1', text = 'Synthetic research prompt'): PromptRecord {
  return { schemaVersion: 1, id, deviceId: 'test-device', sourceSequence: 1, recordedAt: '2026-10-19T00:00:00.000Z',
    surface: structuredClone(surface), text, quality: 'exact_submitted', sourceMethod: 'synthetic_replay', origin: 'user', redactions: 0 };
}
export function temporaryArchive(): { directory: string; path: string; key: Buffer; cleanup: () => void } {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'promtesaver-test-'));
  const key = randomBytes(32);
  return { directory, path: join(directory, 'archive.sqlite'), key, cleanup: () => {
    key.fill(0);
    const resolved = realpathSync(directory);
    if (dirname(resolved) !== parent || !basename(resolved).startsWith('promtesaver-test-')) throw new Error('Unsafe test cleanup path');
    rmSync(resolved, { recursive: true });
  } };
}
