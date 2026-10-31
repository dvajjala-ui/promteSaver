import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {request} from 'node:http';
import {mkdtempSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, resolve, sep} from 'node:path';
import {startLocalWeb} from '../apps/local-web/server.ts';

const password = 'Synthetic-Monitoring-Passphrase-01';
const route = '/api/capture/monitoring/';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function fixture(desktop = true) {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, 'promtesaver-monitoring-test-'));
  const directory = join(root, 'vault');
  const app = await startLocalWeb({directory, desktop});
  const held: Array<{release: () => void; response: Promise<{status:number; body:any}>}> = [];
  const call = async (path: string, method = 'GET', payload?: unknown,
    headers: Record<string,string> = {}) => {
    const response = await fetch(app.origin + path, {method,
      headers:{Origin:app.origin, Authorization:`Bearer ${app.token}`,
        ...(payload === undefined ? {} : {'Content-Type':'application/json'}), ...headers},
      ...(payload === undefined ? {} : {body:JSON.stringify(payload)})});
    return {status:response.status, body:await response.json()};
  };
  const hold = async (path: string, payload: unknown, headers: Record<string,string> = {}) => {
    const body = JSON.stringify(payload);
    let ready!: () => void;
    let rejectReady!: (error: Error) => void;
    const entered = new Promise<void>((resolveReady, reject) => {ready = resolveReady; rejectReady = reject;});
    let release!: () => void;
    const response = new Promise<{status:number;body:any}>((resolveResponse, reject) => {
      const req = request(app.origin + path, {method:'POST',headers:{Origin:app.origin,
        Authorization:`Bearer ${app.token}`, 'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(body), Expect:'100-continue', ...headers}}, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {resolveResponse({status:res.statusCode ?? 0,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}
          catch (error) {reject(error);}
        });
      });
      req.on('error', error => {rejectReady(error); reject(error);});
      req.once('continue', ready);
      req.setTimeout(10_000, () => req.destroy(new Error('Synthetic held request timed out')));
      let released = false;
      release = () => {if (!released) {released = true; req.end(body);}};
      req.flushHeaders();
    });
    // Node sends 100 Continue and invokes its request handler in the same
    // server turn. Receiving it means the handler has reached its body-await;
    // no sleep or connection-order assumption decides the race.
    held.push({release,response});
    await entered;
    return {release,response};
  };
  const setup = await call('/api/setup', 'POST', {passphrase:password,confirm:password});
  assert.equal(setup.status, 201);
  return {app,directory,call,hold,
    async record() {
      assert.equal((await call(route + 'consent', 'POST', {consent:true})).status, 200);
      const start = await call(route + 'start', 'POST', {});
      assert.equal(start.status, 200);
      assert.match(start.body.sessionId, uuid);
      return start.body.sessionId as string;
    },
    async cleanup() {
      held.forEach(item => item.release());
      await Promise.allSettled(held.map(item => item.response));
      await app.close();
      const target = resolve(root), inside = relative(temporaryRoot, target);
      assert.ok(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !inside.startsWith('../'));
      rmSync(target, {recursive:true,force:true});
    }};
}

function snapshot(sessionId: string, fieldId = randomUUID(), text = 'A harmless synthetic monitoring observation.') {
  return {sessionId,fieldId,eventId:randomUUID(),source:'sampleeditor.exe',text,
    recordedAt:new Date(Date.now()).toISOString()};
}

test('monitoring agreement never starts recording; Stop retains it and revoke/lock clear it', async () => {
  const f = await fixture();
  try {
    let status = (await f.call('/api/capture/status')).body.monitoring;
    assert.deepEqual(status, {available:true,approved:false,recording:false,sessionId:null,code:null,lastSavedAt:null,
      capacity:{remainingSaves:200,remainingBytes:2 * 1024 * 1024,limitSaves:200,limitBytes:2 * 1024 * 1024}});
    assert.equal((await f.call(route + 'start', 'POST', {})).status, 409);
    assert.equal((await f.call(route + 'consent', 'POST', {consent:false})).status, 400);
    assert.equal((await f.call(route + 'consent', 'POST', {consent:true,source:'sampleeditor.exe'})).status, 400);
    const consent = await f.call(route + 'consent', 'POST', {consent:true});
    assert.equal(consent.body.approved, true);
    assert.equal(consent.body.recording, false);
    assert.equal(consent.body.sessionId, null);
    assert.equal(f.app.vault.archive.stats().records, 0);
    assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(randomUUID()))).status, 409);
    const started = await f.call(route + 'start', 'POST', {});
    assert.equal(started.body.recording, true);
    assert.match(started.body.sessionId, uuid);
    const replacement = await f.call(route + 'start', 'POST', {});
    assert.notEqual(replacement.body.sessionId, started.body.sessionId);
    assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(started.body.sessionId))).status, 409);
    const stop = await f.call(route + 'stop', 'POST', {});
    assert.equal(stop.body.recording, false);
    assert.equal(stop.body.approved, true);
    assert.equal(stop.body.sessionId, null);
    assert.equal((await f.call(route + 'start', 'POST', {})).status, 200);
    assert.equal((await f.call(route + 'revoke', 'POST', {})).body.approved, false);
    assert.equal((await f.call(route + 'start', 'POST', {})).status, 409);
    await f.record();
    await f.call('/api/lock', 'POST', {});
    assert.equal((await f.call('/api/capture/status')).body.monitoring.approved, false);
    await f.call('/api/unlock', 'POST', {passphrase:password});
    status = (await f.call('/api/capture/status')).body.monitoring;
    assert.equal(status.recording, false);
    assert.equal(status.approved, false);
    const before = (await f.call('/api/status')).body.lockAt;
    await f.call('/api/capture/status');
    assert.equal((await f.call('/api/status')).body.lockAt, before, 'status must not renew idle time');
    assert.equal(f.app.vault.archive.stats().records, 0);
  } finally {await f.cleanup();}
});

test('monitoring rejects hostile origin/auth and non-desktop callers', async () => {
  const f = await fixture(), web = await fixture(false);
  try {
    for (const action of ['consent','start','stop','revoke','snapshot']) {
      const payload = action === 'consent' ? {consent:true} : action === 'snapshot' ? snapshot(randomUUID()) : {};
      assert.equal((await f.call(route + action, 'POST', payload, {Origin:'https://untrusted.example'})).status, 403);
      assert.equal((await f.call(route + action, 'POST', payload, {Authorization:'Bearer wrong-session'})).status, 401);
      assert.equal((await web.call(route + action, 'POST', payload)).status, 409);
    }
    assert.equal((await web.call('/api/capture/status')).body.monitoring.available, false);
    assert.equal((await f.call('/api/capture/status')).body.monitoring.approved, false);
  } finally {await f.cleanup(); await web.cleanup();}
});

test('monitoring evidence separates fields and copies, rejects bounded sources and restores encrypted backups', async () => {
  const f = await fixture();
  let restored: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    const session = await f.record(), fieldA = randomUUID(), fieldB = randomUUID();
    const text = 'Synthetic private paragraph one.\n\nParagraph two keeps its boundaries.';
    const first = snapshot(session, fieldA, text);
    assert.equal((await f.call(route + 'snapshot', 'POST', first)).status, 201);
    assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(session,fieldA,text))).body.duplicate, true);
    assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(session,fieldB,text))).status, 201);
    const changed = snapshot(session,fieldA,text + '\nA changed ending.');
    assert.equal((await f.call(route + 'snapshot', 'POST', changed)).status, 201);
    for (const source of ['chrome.exe','bitwarden.exe','credentialuibroker.exe','msedgewebview2.exe',
      'SampleEditor.exe','../sampleeditor.exe','x'.repeat(65) + '.exe','']) {
      assert.equal((await f.call(route + 'snapshot', 'POST', {...snapshot(session),source})).status, 400, source);
    }
    assert.equal((await f.call(route + 'snapshot', 'POST', {...snapshot(session,fieldA),source:'othereditor.exe'})).status, 400);
    for (const patch of [{fieldId:'unknown'}, {sessionId:'unknown'}, {eventId:'unknown'},
      {text:'x'.repeat(50_001)}, {text:''}, {text:'   '}, {recordedAt:'not-a-date'}, {unexpected:true}]) {
      assert.equal((await f.call(route + 'snapshot', 'POST', {...snapshot(session),...patch})).status, 400);
    }
    const captures = (await f.call('/api/captured?limit=10&offset=0')).body.items.sort((a:any,b:any) => a.sourceSequence - b.sourceSequence);
    assert.equal(captures.length, 3);
    assert.deepEqual(captures.map((item:any) => item.sourceSequence), [1,2,3]);
    assert.deepEqual(captures.map((item:any) => item.surface.editorId), [fieldA,fieldB,fieldA]);
    assert.ok(captures.every((item:any) => item.deviceId === 'windows-monitoring-session' && item.surface.surfaceId === session &&
      item.surface.classification === 'unknown' && item.quality === 'draft_snapshot'));
    assert.equal(captures[0].text, text);
    const copy = (await f.call('/api/items?limit=10')).body.items.find((item:any) => item.captureId === first.eventId);
    assert.ok(copy);
    assert.equal((await f.call('/api/items/' + copy.id, 'PUT', {title:'Reviewed copy',body:'Human-authored replacement'},
      {'If-Match':copy.etag})).status, 200);
    assert.equal(f.app.vault.archive.get(first.eventId)!.text, text);
    assert.equal(readFileSync(join(f.directory,'vault.sqlite')).includes(Buffer.from(text)), false);
    const exportResponse = await fetch(f.app.origin + '/api/backup/export', {method:'POST',headers:{Origin:f.app.origin,
      Authorization:`Bearer ${f.app.token}`,'Content-Type':'application/json'},body:JSON.stringify({passphrase:password})});
    assert.equal(exportResponse.status, 200);
    const bytes = Buffer.from(await exportResponse.arrayBuffer());
    assert.equal(bytes.includes(Buffer.from(text)), false);
    restored = await fixture();
    const imported = await restored.call('/api/backup/import', 'POST', {backup:bytes.toString('base64'),passphrase:password});
    assert.equal(imported.status, 200);
    assert.equal((await restored.call('/api/captured?limit=10')).body.total, 3);
    assert.equal(restored.app.vault.archive.get(first.eventId)!.surface.editorId, fieldA);
    assert.equal((await restored.call('/api/capture/status')).body.monitoring.approved, false, 'backup must not import consent');
    assert.equal((await f.call('/api/captured/' + first.eventId, 'DELETE')).status, 200);
    assert.equal((await f.call('/api/backup/import', 'POST', {backup:bytes.toString('base64'),passphrase:password})).status, 200);
    assert.equal(f.app.vault.archive.get(first.eventId), undefined, 'import cannot resurrect deleted evidence');
    assert.equal(f.app.vault.archive.getLibrary(copy.id), undefined, 'linked copy deletion propagates');
  } finally {await f.cleanup(); if (restored) await restored.cleanup();}
});

test('Stop then Record rejects held control, snapshot and legacy capture bodies from the old generation', async () => {
  const f = await fixture();
  try {
    const old = await f.record();
    const cases: Array<[string,unknown]> = [
      [route + 'snapshot',snapshot(old)], [route + 'consent',{consent:true}], [route + 'start',{}],
      [route + 'stop',{}], [route + 'revoke',{}], ['/api/capture/pause',{}],
      ['/api/capture/field/consent',{enabled:true,source:'sampleeditor.exe',consent:true}],
      ['/api/capture/keyboard/consent',{enabled:true,source:'notepad.exe',consent:true}],
      ['/api/capture/native',{enabled:true,consent:true}],
      ['/api/capture/field/snapshot',{eventId:randomUUID(),source:'sampleeditor.exe',text:'Old field body.',recordedAt:new Date().toISOString()}],
      ['/api/capture/keyboard/snapshot',{eventId:randomUUID(),text:'Old Notepad body.',recordedAt:new Date().toISOString()}],
      ['/api/bridge/start',{autoCaptureHosts:['chatgpt.com']}]
    ];
    const uploads = [];
    for (const [path,payload] of cases) uploads.push(await f.hold(path,payload));
    assert.equal((await f.call(route + 'stop', 'POST', {})).status, 200);
    const current = (await f.call(route + 'start', 'POST', {})).body.sessionId;
    assert.notEqual(current, old);
    uploads.forEach(upload => upload.release());
    for (const result of await Promise.all(uploads.map(upload => upload.response))) {
      assert.equal(result.status, 409);
      assert.equal(result.body.error, 'Capture state changed; retry the current action');
    }
    assert.equal(f.app.vault.status().unlocked, true, 'a capture conflict must not imply the vault is locked');
    const status = (await f.call('/api/capture/status')).body;
    assert.equal(status.monitoring.sessionId, current);
    assert.equal(status.monitoring.recording, true);
    assert.deepEqual(status.field.sources, []);
    assert.equal(status.keyboard.enabled, false);
    assert.equal(status.browser.pairingPending, false);
    assert.equal(f.app.vault.archive.stats().records, 0);
    assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(old))).status, 409);
    assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(current))).status, 201);
  } finally {await f.cleanup();}
});

test('lock/unlock rejects held monitoring and legacy approval bodies even after a new recording starts', async () => {
  const f = await fixture();
  try {
    const old = await f.record();
    const uploads = [await f.hold(route + 'snapshot',snapshot(old)), await f.hold(route + 'consent',{consent:true}),
      await f.hold('/api/capture/field/consent',{enabled:true,source:'sampleeditor.exe',consent:true})];
    assert.equal((await f.call('/api/lock', 'POST', {})).status, 200);
    assert.equal((await f.call('/api/unlock', 'POST', {passphrase:password})).status, 200);
    assert.equal((await f.call('/api/capture/status')).body.monitoring.approved, false);
    const current = await f.record();
    uploads.forEach(upload => upload.release());
    assert.ok((await Promise.all(uploads.map(upload => upload.response))).every(result => result.status === 423));
    const status = (await f.call('/api/capture/status')).body;
    assert.equal(status.monitoring.sessionId, current);
    assert.deepEqual(status.field.sources, []);
    assert.equal(f.app.vault.archive.stats().records, 0);
  } finally {await f.cleanup();}
});

test('global monitoring Stop rejects held legacy browser pairing and writes after a fresh pairing in the same vault', async () => {
  const f = await fixture(), extension = 'chrome-extension://' + 'a'.repeat(32);
  try {
    await f.record();
    const offer = async () => (await f.call('/api/bridge/start', 'POST', {autoCaptureHosts:['chatgpt.com']})).body.pairingCode.split(':')[2];
    const pair = async () => {
      const code = await offer();
      return (await f.call('/api/bridge/pair', 'POST', {code}, {Origin:extension})).body.writeToken as string;
    };
    const oldCode = await offer();
    const pendingPair = await f.hold('/api/bridge/pair', {code:oldCode}, {Origin:extension});
    await f.call(route + 'stop', 'POST', {});
    await f.call(route + 'start', 'POST', {});
    const firstToken = await pair();
    pendingPair.release();
    assert.equal((await pendingPair.response).status, 409);
    const event = {eventId:randomUUID(),host:'chatgpt.com',text:'A harmless old browser send observation.',
      recordedAt:new Date().toISOString(),signal:'send-click'};
    const pendingCapture = await f.hold('/api/bridge/capture', event, {Origin:extension,Authorization:`Bearer ${firstToken}`});
    await f.call(route + 'stop', 'POST', {});
    await f.call(route + 'start', 'POST', {});
    const currentToken = await pair();
    pendingCapture.release();
    assert.equal((await pendingCapture.response).status, 409);
    assert.equal(f.app.vault.archive.stats().records, 0);
    assert.equal((await f.call('/api/bridge/capture', 'POST', {...event,eventId:randomUUID()},
      {Origin:extension,Authorization:`Bearer ${currentToken}`})).status, 201);
  } finally {await f.cleanup();}
});

test('global pause, revoke and replacement Record invalidate held snapshots; legacy explicit approvals remain compatible', async () => {
  const f = await fixture();
  try {
    for (const action of ['/api/capture/pause',route + 'revoke',route + 'start']) {
      const session = await f.record();
      const pending = await f.hold(route + 'snapshot',snapshot(session));
      assert.equal((await f.call(action, 'POST', {})).status, 200);
      pending.release();
      assert.equal((await pending.response).status, 409);
    }
    assert.equal(f.app.vault.archive.stats().records, 0);
    await f.call(route + 'stop', 'POST', {});
    assert.equal((await f.call('/api/capture/field/consent', 'POST', {enabled:true,source:'sampleeditor.exe',consent:true})).status, 200);
    assert.equal((await f.call('/api/capture/field/snapshot', 'POST', {
      eventId:randomUUID(),source:'sampleeditor.exe',text:'Fresh explicit legacy approval.',recordedAt:new Date().toISOString()})).status, 201);
    assert.equal((await f.call('/api/capture/keyboard/consent', 'POST', {enabled:true,source:'notepad.exe',consent:true})).status, 200);
    const status = (await f.call(route + 'stop', 'POST', {})).body;
    assert.equal(status.recording, false);
    assert.deepEqual((await f.call('/api/capture/status')).body.field.sources, []);
    assert.equal((await f.call('/api/capture/status')).body.keyboard.enabled, false);
  } finally {await f.cleanup();}
});

test('the global monitoring rate limit pauses the session and cannot be reset with Stop or Record', async () => {
  const f = await fixture();
  try {
    const session = await f.record();
    const uploads = [];
    for (let i = 0; i < 16; i++) uploads.push(await f.hold(route + 'snapshot',snapshot(session,randomUUID(),'Synthetic rate observation ' + i)));
    uploads.forEach(upload => upload.release());
    const statuses = (await Promise.all(uploads.map(upload => upload.response))).map(result => result.status);
    assert.equal(statuses.filter(status => status === 201).length, 15);
    assert.equal(statuses.filter(status => status === 429).length, 1);
    const status = (await f.call('/api/capture/status')).body.monitoring;
    assert.equal(status.recording, false);
    assert.equal(status.sessionId, null);
    assert.equal(status.approved, true);
    assert.equal(status.code, 'SOURCE_RATE_LIMIT');
    assert.ok(status.lastSavedAt);
    assert.equal(f.app.vault.archive.stats().records, 15);
    await f.call(route + 'stop', 'POST', {});
    assert.equal((await f.call(route + 'start', 'POST', {})).status, 429);
    await f.call(route + 'revoke', 'POST', {});
    await f.call(route + 'consent', 'POST', {consent:true});
    assert.equal((await f.call(route + 'start', 'POST', {})).status, 429);
    assert.equal(f.app.vault.archive.stats().records, 15);
  } finally {await f.cleanup();}
});

function advanceClock(t: TestContext) {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  return () => {now += 61_000;};
}

test('monitoring service-lifetime save capacity survives Stop/Record and bounds the per-field cache', async t => {
  const advance = advanceClock(t), f = await fixture();
  try {
    let session = await f.record();
    const firstField = randomUUID();
    for (let i = 0; i < 200; i++) {
      if (i > 0 && i % 15 === 0) advance();
      if (i === 130) {
        await f.call(route + 'stop', 'POST', {});
        session = (await f.call(route + 'start', 'POST', {})).body.sessionId;
      }
      const field = i === 0 || i === 129 ? firstField : randomUUID();
      const text = 'Bounded observation ' + (i === 129 ? 0 : i);
      const result = await f.call(route + 'snapshot', 'POST', snapshot(session,field,text));
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(result.body.monitoring.capacity.remainingSaves, 199 - i);
      if (i === 128) assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(session,field,text))).body.duplicate, true);
      // At i=129 the oldest of 129 distinct fields has left the 128-entry LRU;
      // resubmission is a new observation rather than an unbounded retained key.
    }
    const status = (await f.call('/api/capture/status')).body.monitoring;
    assert.equal(status.capacity.remainingSaves, 0);
    assert.equal(status.code, 'MONITORING_CAPACITY');
    assert.equal(status.recording, false);
    assert.equal(f.app.vault.archive.stats().records, 200);
    advance();
    await f.call(route + 'revoke', 'POST', {});
    await f.call(route + 'consent', 'POST', {consent:true});
    assert.equal((await f.call(route + 'start', 'POST', {})).status, 409);
    assert.equal((await f.call('/api/capture/status')).body.monitoring.code, 'MONITORING_CAPACITY');
  } finally {await f.cleanup();}
});

test('monitoring service-lifetime UTF-8 capacity stops before an oversized next observation is persisted', async t => {
  const advance = advanceClock(t), f = await fixture();
  try {
    const session = await f.record();
    // The field limit is UTF-16 length; the workload budget deliberately counts
    // UTF-8 bytes, including multibyte text, before encrypted evidence/copy work.
    const text = '文'.repeat(49_990);
    const bytes = Buffer.byteLength(text), count = Math.floor(2 * 1024 * 1024 / bytes);
    for (let i = 0; i < count; i++) {
      if (i > 0 && i % 15 === 0) advance();
      assert.equal((await f.call(route + 'snapshot', 'POST', snapshot(session,randomUUID(),text))).status, 201);
    }
    const before = (await f.call('/api/capture/status')).body.monitoring.capacity.remainingBytes;
    assert.equal(before, 2 * 1024 * 1024 - count * bytes);
    const overflow = await f.call(route + 'snapshot', 'POST', snapshot(session,randomUUID(),text));
    assert.equal(overflow.status, 409);
    const status = (await f.call('/api/capture/status')).body.monitoring;
    assert.equal(status.recording, false);
    assert.equal(status.code, 'MONITORING_CAPACITY');
    assert.equal(status.capacity.remainingBytes, before);
    assert.equal(f.app.vault.archive.stats().records, count);
    await f.call('/api/lock', 'POST', {});
    await f.call('/api/unlock', 'POST', {passphrase:password});
    await f.call(route + 'consent', 'POST', {consent:true});
    assert.equal((await f.call(route + 'start', 'POST', {})).status, 409);
  } finally {await f.cleanup();}
});

test('monitoring keystroke chunk saves reconstructed text and enforces validation', async t => {
  const f = await fixture();
  try {
    const session = await f.record();
    const eventId = randomUUID();
    const result = await f.call('/api/capture/keystroke-chunk', 'POST', {
      sessionId: session,
      eventId,
      source: 'notepad.exe',
      text: 'reconstructed keystrokes from typing',
      recordedAt: new Date().toISOString(),
      isEnterFlush: true,
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.saved, true);
    assert.equal(result.body.quality, 'draft_snapshot');
    const items = (await f.call('/api/captured')).body.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'reconstructed keystrokes from typing');
    assert.equal(items[0].sourceMethod, 'editor_snapshot');

    // Invalid payload checks
    const badSource = await f.call('/api/capture/keystroke-chunk', 'POST', {
      sessionId: session, eventId: randomUUID(), source: 'invalid exe name', text: 'hi', recordedAt: new Date().toISOString()
    });
    assert.equal(badSource.status, 400);

    const badTime = await f.call('/api/capture/keystroke-chunk', 'POST', {
      sessionId: session, eventId: randomUUID(), source: 'notepad.exe', text: 'hi', recordedAt: '2020-01-01T00:00:00.000Z'
    });
    assert.equal(badTime.status, 400);
  } finally {await f.cleanup();}
});

