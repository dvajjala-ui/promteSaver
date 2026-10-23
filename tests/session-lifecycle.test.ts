import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startLocalWeb } from '../apps/local-web/server.ts';

const password='OnlySyntheticApiPassword03';
async function fixture(idleMinutes?: number) {
  const dir=mkdtempSync(join(tmpdir(),'pomte-v03-api-'));
  const app=await startLocalWeb({directory:dir,...(idleMinutes===undefined?{}:{idleMinutes})});
  const request=async (path:string,method='GET',payload?:unknown,extra:Record<string,string>={})=>{
    const res=await fetch(app.origin+path,{method,headers:{Authorization:`Bearer ${app.token}`,Origin:app.origin,...(payload===undefined?{}:{'Content-Type':'application/json'}),...extra},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    return {status:res.status,data:await res.json(),headers:res.headers};
  };
  await request('/api/setup','POST',{passphrase:password,confirm:password});
  return {app,request,async close(){await app.close();rmSync(dir,{recursive:true,force:true});}};
}

test('authenticated status polling does not extend server auto-lock', async()=>{
  const f=await fixture(0.01);
  try {
    const first=await f.request('/api/status');const deadline=first.data.lockAt;
    for(let n=0;n<8;n++){await delay(100);const status=await f.request('/api/status');if(status.data.unlocked)assert.equal(status.data.lockAt,deadline);}
    assert.equal((await f.request('/api/status')).data.unlocked,false);
    assert.equal((await f.request('/api/items')).status,423);
  } finally {await f.close();}
});

test('activity renews deadline, preferences persist and security headers are present',async()=>{
  const f=await fixture();
  try {
    const before=await f.request('/api/status');await delay(15);
    const active=await f.request('/api/activity','POST',{});
    assert.ok(Number(active.headers.get('X-Vault-Lock-At'))>before.data.lockAt);
    assert.match(active.headers.get('Content-Security-Policy')??'',/frame-ancestors 'none'/);
    const pref={idleMinutes:2,lowMemory:true,compactMode:true,lockOnHide:true};
    assert.equal((await f.request('/api/preferences','PUT',pref)).status,200);
    assert.equal((await f.request('/api/status')).data.idleMinutes,2);
    await f.request('/api/lock','POST');assert.equal((await f.request('/api/preferences')).status,423);
    await f.request('/api/unlock','POST',{passphrase:password});assert.deepEqual((await f.request('/api/preferences')).data,pref);
  } finally {await f.close();}
});

test('API ETag rejects stale edits without destroying either saved text or history',async()=>{
  const f=await fixture();
  try {
    const saved=await f.request('/api/items','POST',{title:'Two windows',body:'Initial'});const {id,etag}=saved.data.item;
    const first=await f.request(`/api/items/${id}`,'PUT',{title:'Two windows',body:'Window one'},{'If-Match':etag});assert.equal(first.status,200);
    const second=await f.request(`/api/items/${id}`,'PUT',{title:'Two windows',body:'Window two'},{'If-Match':etag});assert.equal(second.status,412);assert.equal(second.data.code,'EDIT_CONFLICT');
    const actual=await f.request(`/api/items/${id}`);assert.equal(actual.data.item.body,'Window one');assert.equal(actual.headers.get('ETag'),first.data.item.etag);
    assert.equal((await f.request(`/api/items/${id}/history`)).data.revisions.length,1);
  } finally {await f.close();}
});

test('passphrase change locks vault, revokes bridge access and requires the replacement',async()=>{
  const f=await fixture();
  try {
    const updated='ReplacementSyntheticPassword04';
    const result=await f.request('/api/passphrase','POST',{current:password,replacement:updated,confirm:updated});assert.equal(result.status,200);assert.equal(result.data.locked,true);
    assert.equal((await f.request('/api/items')).status,423);
    assert.equal((await f.request('/api/unlock','POST',{passphrase:password})).status,401);
    assert.equal((await f.request('/api/unlock','POST',{passphrase:updated})).status,200);
    assert.equal((await f.request('/api/bridge/status')).data.active,false);
  } finally {await f.close();}
});

test('browser write token is bound to the extension origin that paired it',async()=>{
  const f=await fixture();
  try {
    const start=await f.request('/api/bridge/start','POST',{});const code=start.data.pairingCode.split(':')[2];
    const origin='chrome-extension://'+'a'.repeat(32);const other='chrome-extension://'+'b'.repeat(32);
    const pair=await f.request('/api/bridge/pair','POST',{code},{Origin:origin});assert.equal(pair.status,200);
    const payload={host:'chatgpt.com',title:'Bridge canary',text:'Manually saved synthetic text'};
    const headers={Authorization:`Bearer ${pair.data.writeToken}`,Origin:other};
    assert.equal((await f.request('/api/bridge/save','POST',payload,headers)).status,401);
    assert.equal((await f.request('/api/bridge/save','POST',payload,{...headers,Origin:origin})).status,201);
  } finally {await f.close();}
});

test('JSON content-type lookalikes are rejected; Unicode prompt sizes obey character rather than ASCII limits',async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.request('/api/items','POST',{title:'No',body:'No'},{'Content-Type':'application/json-malicious'})).status,415);
    const body='\u6f22'.repeat(90000);
    const saved=await f.request('/api/items','POST',{title:'Unicode',body});assert.equal(saved.status,201);assert.equal(saved.data.item.body.length,90000);
  } finally {await f.close();}
});

test('an in-flight extension write cannot survive revocation and a new vault unlock',async()=>{
  const {request:httpRequest}=await import('node:http');
  const f=await fixture();try{
    const start=await f.request('/api/bridge/start','POST',{});const code=start.data.pairingCode.split(':')[2];
    const origin='chrome-extension://'+'c'.repeat(32);
    const pair=await f.request('/api/bridge/pair','POST',{code},{Origin:origin});
    const body=JSON.stringify({host:'chatgpt.com',title:'Revoked in-flight canary',text:'Must never be written after revocation'});
    let upload:ReturnType<typeof httpRequest>;
    const response=new Promise<number>((resolve,reject)=>{
      upload=httpRequest(f.app.origin+'/api/bridge/save',{method:'POST',headers:{Authorization:`Bearer ${pair.data.writeToken}`,Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});
      upload.on('error',reject);upload.write(body.slice(0,20));
    });
    await delay(40);await f.request('/api/lock','POST');await f.request('/api/unlock','POST',{passphrase:password});
    upload!.end(body.slice(20));assert.equal(await response,401);
    assert.equal((await f.request('/api/summary')).data.library.all,0);
  }finally{await f.close();}
});
