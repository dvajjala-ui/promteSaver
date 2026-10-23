import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { CaptureEngine } from '../../packages/capture-core/engine.ts';
import { EncryptedArchive } from '../../packages/local-store/archive.ts';
import type { Observation, Surface } from '../../packages/contracts/generated.ts';

// Only the bundled synthetic fixture can be replayed. No keyboard hooks, network, or real text import.
const fixture = JSON.parse(readFileSync(new URL('../../fixtures/capture/replay.json', import.meta.url), 'utf8'));
const parent = realpathSync(tmpdir());
const directory = mkdtempSync(join(parent, 'promtesaver-m0-'));
const key = randomBytes(32);
let archive: EncryptedArchive | undefined;
try {
  archive = new EncryptedArchive(join(directory, 'synthetic.sqlite'), key);
  const engine = new CaptureEngine(fixture.deviceId, {
    enabled: true, paused: false, permissionGranted: true,
    allowedAppIds: [fixture.surface.appId], excludedAppIds: [], retainDrafts: false
  }, archive);
  const steps = fixture.steps as Array<Partial<Observation>>;
  steps.forEach((step, index) => engine.ingest({
    schemaVersion: 1, id: `synthetic-${index}`, deviceId: fixture.deviceId, sequence: index + 1,
    recordedAt: new Date(Date.UTC(2026, 9, 19, 0, 0, index)).toISOString(),
    sourceMethod: 'synthetic_replay', origin: 'user', surface: fixture.surface as Surface, ...step
  }));
  const before = archive.stats();
  const found = archive.search('understand the idea');
  const redacted = archive.search('[REDACTED]').length;
  archive.close();
  archive = new EncryptedArchive(join(directory, 'synthetic.sqlite'), key);
  const after = archive.stats();
  console.log(JSON.stringify({ mode: 'synthetic-only', recording: 'off', network: 'off', beforeRestart: before,
    afterRestart: after, historicalSearchMatches: found.length, redactedRecords: redacted,
    storage: 'AES-256-GCM payloads in SQLite; not SQLCipher', keyPersistence: 'memory only; demo files removed' }, null, 2));
} finally {
  archive?.close(); key.fill(0);
  const resolved = realpathSync(directory);
  if (dirname(resolved) !== parent || !basename(resolved).startsWith('promtesaver-m0-')) throw new Error('Unsafe demo cleanup path');
  rmSync(resolved, { recursive: true });
}
