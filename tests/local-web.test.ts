import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalWeb } from '../apps/local-web/server.ts';

const password = 'ExamplePassphrase-only-for-tests-001';

test('local web: session token, host/origin checks, passphrase lock, CRUD and offline assets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'promtesaver-web-test-'));
  const app = await startLocalWeb({ directory });
  try {
    const endpoint = (path: string) => `${app.origin}${path}`;
    const request = async (path: string, method = 'GET', payload?: unknown, headers: Record<string, string> = {}) => {
      const res = await fetch(endpoint(path), { method, headers: {
        Authorization: `Bearer ${app.token}`, Origin: app.origin,
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers
      }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
      return { code: res.status, value: await res.json() };
    };
    const publicAsset = await fetch(endpoint('/'));
    assert.equal(publicAsset.status, 200);
    assert.match(await publicAsset.text(), /A home for/);
    assert.match(publicAsset.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
    assert.equal((await fetch(endpoint('/api/status'))).status, 401);
    assert.equal((await request('/api/status', 'GET', undefined, { Origin: 'https://attacker.test' })).code, 403);
    assert.deepEqual((await request('/api/status')).value, { initialized: false, unlocked: false, recording: false, sync: false, idleMinutes: 15, keyFormat: null, lockAt: null, version: '0.9.0', operation: null });
    assert.equal((await request('/api/setup','POST',{ passphrase: 'short',confirm:'short' })).code, 400);
    assert.equal((await request('/api/setup','POST',{ passphrase: password,confirm:password })).code, 201);
    assert.equal((await request('/api/setup','POST',{ passphrase: password,confirm:password })).code, 409);
    let r = await request('/api/items','POST',{ title:'Debug plan', body:'Find the smallest safe fix',kind:'template',project:'Development',tags:['debugging'],pinned:true });
    assert.equal(r.code, 201);
    const id = (r.value as {item:{id:string}}).item.id;
    assert.equal((await request('/api/items?q=debugging')).value.items.length, 1);
    assert.equal((await request('/api/items?filter=pinned')).value.items.length, 1);
    assert.equal((await request('/api/summary')).value.library.pinned, 1);
    r = await request(`/api/items/${id}`,'PUT',{ title:'Debug plan updated',body:'Review a bug report',kind:'template',project:'Engineering',tags:[],pinned:false });
    assert.equal(r.code, 200);
    assert.equal((await request(`/api/items/${id}`)).value.item.title, 'Debug plan updated');
    assert.equal((await request(`/api/items/${id}/history`)).value.revisions.length, 1);
    assert.equal((await request(`/api/items/${id}/restore`, 'POST', { revision: 1 })).value.item.title, 'Debug plan');
    assert.equal((await request(`/api/items/${id}/history`)).value.revisions.length, 2);
    assert.equal((await request('/api/captured')).value.items.length, 0);
    assert.equal((await request('/api/lock','POST')).code, 200);
    assert.equal((await request('/api/items')).code, 423);
    assert.equal((await request('/api/unlock','POST',{passphrase:'wrong-secret-passphrase'})).code, 401);
    assert.equal((await request('/api/unlock','POST',{passphrase:password})).code, 200);
    assert.equal((await request('/api/items')).value.items.length, 1);
    assert.equal((await request(`/api/items/${id}`,'DELETE')).value.deleted, true);
    assert.equal((await request('/api/summary')).value.library.all, 0);
    assert.equal((await request('/api/examples','POST',{})).code, 201);
    assert.equal((await request('/api/summary')).value.library.all, 9);
    assert.equal((await request('/api/examples','POST',{})).code, 409);
  } finally { await app.close(); rmSync(directory,{recursive:true,force:true}); }
});
