import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { startLocalWeb } from '../apps/local-web/server.ts';

test('Notepad keyboard snapshots require desktop approval and revoke on pause and lock', async () => {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, 'promtesaver-keyboard-test-'));
  const directory = join(root, 'vault');
  let app = await startLocalWeb({directory, desktop: true});
  const call = async (path: string, method = 'GET', payload?: unknown) => {
    const response = await fetch(app.origin + path, {method,
      headers: {Origin: app.origin, Authorization: `Bearer ${app.token}`,
        ...(payload === undefined ? {} : {'Content-Type': 'application/json'})},
      ...(payload === undefined ? {} : {body: JSON.stringify(payload)})});
    return {status: response.status, body: await response.json()};
  };
  const sample = 'Synthetic Notepad editor text with  two spaces.';
  const snapshot = () => ({eventId: randomUUID(), text: sample, recordedAt: new Date().toISOString()});
  try {
    assert.equal((await call('/api/setup', 'POST', {passphrase: 'Synthetic-Keyboard-Passphrase-01',
      confirm: 'Synthetic-Keyboard-Passphrase-01'})).status, 201);
    assert.equal((await call('/api/capture/status')).body.keyboard.enabled, false);
    const forgedOrigin = await fetch(app.origin + '/api/capture/keyboard/consent', {method: 'POST',
      headers: {Origin: 'https://untrusted.example', Authorization: `Bearer ${app.token}`,
        'Content-Type': 'application/json'},
      body: JSON.stringify({enabled: true, source: 'notepad.exe', consent: true})});
    assert.equal(forgedOrigin.status, 403);
    assert.equal((await call('/api/capture/keyboard/snapshot', 'POST', snapshot())).status, 409);
    assert.equal((await call('/api/capture/keyboard/consent', 'POST',
      {enabled: true, source: 'chrome.exe', consent: true})).status, 400);
    assert.equal((await call('/api/capture/keyboard/consent', 'POST',
      {enabled: true, source: 'notepad.exe'})).status, 400);
    assert.equal((await call('/api/capture/keyboard/consent', 'POST',
      {enabled: true, source: 'notepad.exe', consent: true})).status, 200);
    const first = snapshot();
    const saved = await call('/api/capture/keyboard/snapshot', 'POST', first);
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(saved.body.quality, 'draft_snapshot');
    assert.equal((await call('/api/capture/keyboard/snapshot', 'POST', snapshot())).body.duplicate, true);
    const page = await call('/api/captured?limit=10&offset=0');
    assert.equal(page.body.total, 1);
    assert.equal(page.body.items[0].text, sample);
    assert.equal(page.body.items[0].surface.appId, 'notepad.exe');
    assert.equal(page.body.items[0].surface.classification, 'prompt');
    assert.equal(page.body.items[0].quality, 'draft_snapshot');
    assert.equal(readFileSync(join(directory, 'vault.sqlite')).includes(Buffer.from(sample)), false);
    for (let index = 0; index < 14; index++) {
      const next = snapshot(); next.text += ` ${index}`;
      assert.equal((await call('/api/capture/keyboard/snapshot', 'POST', next)).status, 201);
    }
    const limited = snapshot(); limited.text += ' over-limit';
    assert.equal((await call('/api/capture/keyboard/snapshot', 'POST', limited)).status, 429);
    assert.equal((await call('/api/capture/status')).body.keyboard.code, 'SOURCE_RATE_LIMIT');
    assert.equal((await call('/api/capture/pause', 'POST', {})).status, 200);
    assert.equal((await call('/api/capture/keyboard/snapshot', 'POST', snapshot())).status, 409);
    assert.equal((await call('/api/capture/keyboard/consent', 'POST',
      {enabled: true, source: 'notepad.exe', consent: true})).status, 200);
    assert.equal((await call('/api/lock', 'POST', {})).status, 200);
    assert.equal((await call('/api/capture/keyboard/snapshot', 'POST', snapshot())).status, 423);
    assert.equal((await call('/api/unlock', 'POST', {passphrase: 'Synthetic-Keyboard-Passphrase-01'})).status, 200);
    assert.equal((await call('/api/capture/status')).body.keyboard.enabled, false);
    assert.equal((await call('/api/capture/keyboard/snapshot', 'POST', snapshot())).status, 409);
  } finally {
    await app.close();
    const target = resolve(root); const inside = relative(temporaryRoot, target);
    assert.ok(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !inside.startsWith('../'));
    rmSync(target, {recursive: true, force: true});
  }
});
