import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { startLocalWeb } from '../apps/local-web/server.ts';

const passphrase = 'Synthetic-Desktop-Browser-Passphrase-01';
const extensionOrigin = `chrome-extension://${'abcdefghijklmnop'.repeat(2)}`;

test('desktop browser pairing saves a prompt, reviews it locally, and revokes on pause, lock and restart', async () => {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, 'promtesaver-desktop-browser-'));
  const vaultDirectory = join(root, 'vault');
  let aiCalls = 0;
  let app = await startLocalWeb({ directory: vaultDirectory, desktop: true,
    aiTransport: async () => { aiCalls++; throw new Error('No AI transport is authorized by this test'); } });
  const call = async (path: string, method = 'GET', payload?: unknown, token = app.token, origin = app.origin) => {
    const response = await fetch(app.origin + path, { method,
      headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    return { status: response.status, body: await response.json() };
  };
  const pair = async () => {
    const offer = await call('/api/bridge/start', 'POST',
      { autoCaptureHosts: ['chatgpt.com', 'claude.ai', 'gemini.google.com'] });
    assert.equal(offer.status, 200);
    assert.match(offer.body.pairingCode, /^psv2:\d+:[a-f0-9]{64}$/);
    const code = offer.body.pairingCode.split(':')[2];
    const paired = await call('/api/bridge/pair', 'POST', { code }, '', extensionOrigin);
    assert.equal(paired.status, 200);
    assert.deepEqual(paired.body.allowedCaptureHosts,
      ['chatgpt.com', 'claude.ai', 'gemini.google.com']);
    return paired.body.writeToken as string;
  };
  const capture = (text: string) => ({ eventId: randomUUID(), host: 'chatgpt.com', text,
    recordedAt: new Date().toISOString(), signal: 'send-click' });
  try {
    assert.equal((await call('/api/setup', 'POST', { passphrase, confirm: passphrase })).status, 201);
    let status = await call('/api/capture/status');
    assert.equal(status.body.browser.paired, false);
    assert.equal(status.body.native.available, false, 'real Codex transcript watching stays gated');

    const writer = await pair();
    status = await call('/api/capture/status');
    assert.equal(status.body.browser.paired, true);
    assert.equal(status.body.browser.authorized, true);
    const sentence = 'Write  three clear steps for a harmless project update.';
    const accepted = await call('/api/bridge/capture', 'POST', capture(sentence), writer, extensionOrigin);
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.saved, true);
    assert.equal(accepted.body.quality, 'draft_snapshot');

    const page = await call('/api/captured?limit=10&offset=0');
    assert.equal(page.status, 200);
    assert.equal(page.body.total, 1);
    assert.equal(page.body.items[0].text, sentence);
    assert.equal(page.body.items[0].surface.appId, 'chatgpt.com');
    assert.equal(page.body.items[0].quality, 'draft_snapshot');
    const review = await call('/api/capture/review?limit=10');
    assert.equal(review.status, 200);
    assert.equal(review.body.automaticCloud, false);
    assert.equal(review.body.items[0].changed, false);
    assert.equal(review.body.items[0].text, sentence);
    assert.ok(review.body.items[0].suggestions.some((item: { kind: string }) => item.kind === 'spacing'));
    assert.equal(aiCalls, 0);
    assert.equal(readFileSync(join(vaultDirectory, 'vault.sqlite')).includes(Buffer.from(sentence)), false);

    assert.equal((await call('/api/capture/pause', 'POST', {})).status, 200);
    status = await call('/api/capture/status');
    assert.equal(status.body.browser.paired, false);
    assert.equal((await call('/api/bridge/capture', 'POST', capture('After pause'), writer, extensionOrigin)).status, 401);
    assert.equal((await call('/api/captured')).body.total, 1);

    const secondWriter = await pair();
    assert.equal((await call('/api/lock', 'POST', {})).status, 200);
    assert.equal((await call('/api/bridge/capture', 'POST', capture('After lock'), secondWriter, extensionOrigin)).status, 423);
    assert.equal((await call('/api/unlock', 'POST', { passphrase })).status, 200);
    assert.equal((await call('/api/capture/status')).body.browser.paired, false);
    assert.equal((await call('/api/captured')).body.total, 1);

    await app.close();
    app = await startLocalWeb({ directory: vaultDirectory, desktop: true });
    assert.equal((await call('/api/unlock', 'POST', { passphrase })).status, 200);
    assert.equal((await call('/api/capture/status')).body.browser.paired, false);
    assert.equal((await call('/api/captured')).body.items[0].text, sentence);
    assert.equal((await call('/api/bridge/capture', 'POST', capture('After restart'), secondWriter, extensionOrigin)).status, 401);
  } finally {
    await app.close();
    const target = resolve(root);
    const inside = relative(temporaryRoot, target);
    assert.ok(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !inside.startsWith('../'));
    rmSync(target, { recursive: true, force: true });
  }
});
