import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { startLocalWeb } from '../apps/local-web/server.ts';

const password='Synthetic-Native-Capture-Passphrase-01';
const event=(text:string)=>JSON.stringify({type:'event_msg',payload:{type:'user_message',message:text}})+'\n';
async function fixture(native=true,desktop=false) {
  const parent=resolve(tmpdir());const directory=mkdtempSync(join(parent,'promte-native-api-'));
  const source=join(directory,'source');mkdirSync(source);
  const log=join(source,'synthetic.jsonl');writeFileSync(log,event('Old source history must not be imported.'));
  let calls=0;
  const app=await startLocalWeb({directory:join(directory,'vault'),...(native?{nativeSourceDirectory:source}:{}),
    ...(desktop?{desktop:true}:{}),
    aiTransport:async()=>{calls++;throw new Error('No network is authorized by these tests');}});
  const call=async(path:string,method='GET',body?:unknown,token=app.token)=>{
    const response=await fetch(app.origin+path,{method,headers:{Authorization:`Bearer ${token}`,
      ...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json()};
  };
  const setup=()=>call('/api/setup','POST',{passphrase:password,confirm:password});
  const close=async()=>{await app.close();assert.ok(resolve(directory).startsWith(parent+sep));rmSync(directory,{recursive:true,force:true});};
  return {app,source,log,call,setup,close,networkCalls:()=>calls};
}
async function eventually(predicate:()=>boolean) {
  const deadline=Date.now()+4000;
  while(!predicate()){if(Date.now()>deadline)assert.fail('Synthetic source did not reach the expected state');await new Promise(r=>setTimeout(r,25));}
}

test('native source is explicit, session-bound, encrypted and linked; pause and lock stop later writes',async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.call('/api/capture/status')).data.state,'locked');
    assert.equal((await f.call('/api/capture/native','POST',{enabled:true,consent:true})).status,423);
    await f.setup();
    assert.equal((await f.call('/api/capture/native','POST',{enabled:true})).status,400);
    assert.equal((await f.call('/api/capture/native','POST',{enabled:true,consent:true,directory:f.source})).status,400);
    const enabled=await f.call('/api/capture/native','POST',{enabled:true,consent:true});
    assert.equal(enabled.status,200);assert.equal(enabled.data.state,'running');
    assert.equal(f.app.vault.archive.stats().records,0);
    const text='Synthetic desktop capture canary 3917 with  extra spaces.';
    appendFileSync(f.log,event(text));
    await eventually(()=>f.app.vault.archive.stats().records===1);
    const record=f.app.vault.archive.recentCaptures(1)[0]!;
    assert.equal(record.text,text);assert.equal(record.quality,'draft_snapshot');
    assert.equal(record.surface.appId,'codex-local-session');assert.equal(record.sourceMethod,'local_transcript');
    const copy=f.app.vault.archive.queryLibrary({}).items[0]!;
    assert.equal(copy.captureId,record.id);assert.equal(copy.project,'Desktop inbox');
    const status=await f.call('/api/capture/status');
    assert.equal(status.data.native.enabled,true);assert.ok(!JSON.stringify(status.data).includes(f.source));
    assert.ok(!readFileSync(join(f.app.vault.directory,'vault.sqlite')).includes(Buffer.from(text)));
    assert.equal((await f.call('/api/capture/pause','POST',{})).status,200);
    appendFileSync(f.log,event('Must be ignored while paused.'));
    await new Promise(r=>setTimeout(r,150));assert.equal(f.app.vault.archive.stats().records,1);
    await f.call('/api/capture/native','POST',{enabled:true,consent:true});
    await f.call('/api/lock','POST',{});
    appendFileSync(f.log,event('Must be ignored after lock.'));
    await f.call('/api/unlock','POST',{passphrase:password});
    assert.equal((await f.call('/api/capture/status')).data.native.enabled,false);
    assert.equal(f.app.vault.archive.stats().records,1);
    assert.equal(f.networkCalls(),0);
  }finally{await f.close();}
});

test('capture status is authorized and observational; browser runtime does not expose native start',async()=>{
  const f=await fixture(false);
  try {
    assert.equal((await f.call('/api/capture/status','GET',undefined,'invalid')).status,401);
    await f.setup();
    const before=(await f.call('/api/status')).data.lockAt;
    await new Promise(r=>setTimeout(r,30));
    const status=await f.call('/api/capture/status');
    assert.equal(status.data.native.available,false);assert.equal(status.data.browser.paired,false);
    assert.equal((await f.call('/api/status')).data.lockAt,before);
    assert.equal((await f.call('/api/capture/native','POST',{enabled:true,consent:true})).status,409);
    assert.equal(f.networkCalls(),0);
  }finally{await f.close();}
});

test('desktop launch cannot enable real Codex transcripts without verified private-session exclusion',async()=>{
  const f=await fixture(false,true);
  try{
    await f.setup();
    const status=await f.call('/api/capture/status');
    assert.equal(status.data.native.available,false);
    assert.equal((await f.call('/api/capture/native','POST',{enabled:true,consent:true})).status,409);
    assert.equal(f.networkCalls(),0);
  }finally{await f.close();}
});

test('explicit recent review proposes offline suggestions and never changes raw evidence or calls a provider',async()=>{
  const f=await fixture();
  try {
    await f.setup();await f.call('/api/capture/native','POST',{enabled:true,consent:true});
    appendFileSync(f.log,event('Keep  raw wording???'));
    await eventually(()=>f.app.vault.archive.stats().records===1);
    const record=f.app.vault.archive.recentCaptures(1)[0]!;
    const review=await f.call('/api/capture/review?limit=1');
    assert.equal(review.status,200);assert.equal(review.data.method,'offline-heuristics');
    assert.equal(review.data.automaticCloud,false);assert.equal(review.data.items[0].changed,false);
    assert.ok(review.data.items[0].suggestions.some((issue:{kind:string})=>issue.kind==='spacing'));
    assert.equal(f.app.vault.archive.get(record.id)?.text,'Keep  raw wording???');
    assert.equal(f.networkCalls(),0);
    assert.equal((await f.call('/api/capture/review?limit=21')).status,400);
    await f.call('/api/lock','POST',{});
    assert.equal((await f.call('/api/capture/review')).status,423);
  }finally{await f.close();}
});

test('unavailable local source returns a safe actionable failure with no path or content',async()=>{
  const f=await fixture();
  try{
    await f.setup();rmSync(f.log);rmdirSync(f.source);
    const response=await f.call('/api/capture/native','POST',{enabled:true,consent:true});
    assert.equal(response.status,409);assert.equal(response.data.code,'SOURCE_UNAVAILABLE');
    assert.equal(response.data.native.enabled,false);assert.equal(response.data.native.state,'error');
    assert.ok(!JSON.stringify(response.data).includes(f.source));
  }finally{await f.close();}
});
