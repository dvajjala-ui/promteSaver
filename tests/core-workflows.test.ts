import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalWeb, type LocalWebOptions } from '../apps/local-web/server.ts';
import { GroqRunner,prepareAI,GROQ_ENDPOINT } from '../apps/local-web/ai.ts';
import { validateAISettings } from '../packages/local-store/ai-settings.ts';
import { redactText } from '../packages/capture-core/redact.ts';
import { browserCapture } from '../apps/local-web/browser-capture.ts';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
import { temporaryArchive } from './helpers.ts';
const KEY='gsk_SYNTHETIC_TEST_NOT_A_REAL_KEY_123456';
const config={apiKey:KEY,enabled:true,model:'llama-3.3-70b-versatile'};
const EXT='chrome-extension://'+'a'.repeat(32);
const passphrase='Synthetic-Core-Workflow-Password-Only';
async function fixture(options:Partial<LocalWebOptions>={}) {
  const directory=mkdtempSync(join(tmpdir(),'promte-core-'));
  const app=await startLocalWeb({directory,...options});
  const call=async(path:string,method='GET',body?:unknown,token=app.token,origin=app.origin)=>{
    const response=await fetch(app.origin+path,{method,headers:{Origin:origin,Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  };
  await call('/api/setup','POST',{passphrase,confirm:passphrase});
  return {directory,app,call,cleanup:async()=>{await app.close();rmSync(directory,{recursive:true,force:true});}};
}
async function approved(f:Awaited<ReturnType<typeof fixture>>,payload:Record<string,unknown>){return {...payload,consent:true,reviewDigest:(await f.call('/api/ai/preview','POST',payload)).body.reviewDigest};}
function event(text='A synthetic browser prompt') {return {eventId:randomUUID(),host:'chatgpt.com',text,recordedAt:new Date().toISOString(),signal:'send-click'};}
const ok=()=>new Response(JSON.stringify({choices:[{message:{content:'A reviewed synthetic draft'},finish_reason:'stop'}]}));

test('Groq key syntax and raw token redaction; no arbitrary provider endpoint',()=>{
  assert.deepEqual(validateAISettings(config),config);
  assert.throws(()=>validateAISettings({...config,endpoint:'http://attacker.test'}));
  assert.throws(()=>validateAISettings({...config,apiKey:'short'}));
  assert.ok(!redactText('text '+KEY).text.includes(KEY));
  assert.throws(()=>prepareAI({action:'__proto__',text:'hello'}));
  assert.throws(()=>prepareAI({action:'improve',text:'a'.repeat(12001)}));
});
test('AI settings encrypted at rest, absent from public APIs/backups and unavailable when locked',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call('/api/ai/settings','PUT',config)).status,200);
    const publicConfig=await f.call('/api/ai/settings');assert.equal(publicConfig.body.configured,true);assert.ok(!JSON.stringify(publicConfig).includes(KEY));
    assert.ok(!JSON.stringify(f.app.vault.archive.exportSnapshot()).includes(KEY));
    const state=f.app.vault.archive.aiSettings();assert.equal(state?.apiKey,KEY);
    await f.call('/api/lock','POST',{});
    for(const name of ['vault.sqlite','keyinfo.json'])assert.ok(!readFileSync(join(f.directory,name)).includes(Buffer.from(KEY)));
    assert.equal((await f.call('/api/ai/settings')).status,423);
    await f.call('/api/unlock','POST',{passphrase});assert.equal(f.app.vault.archive.aiSettings()?.apiKey,KEY);
    await f.call('/api/ai/settings','DELETE');assert.equal(f.app.vault.archive.aiSettings(),undefined);
  }finally{await f.cleanup();}
});
test('Groq requires per-request consent; preview is local; real HTTP route builds bounded redacted provider request',async()=>{
  let calls=0;
  const f=await fixture({aiTransport:async(url,init)=>{calls++;assert.equal(url,GROQ_ENDPOINT);assert.equal(init.redirect,'error');
    assert.equal((init.headers as Record<string,string>).Authorization,`Bearer ${KEY}`);
    const body=JSON.parse(init.body as string);assert.equal(body.stream,false);assert.equal(body.max_completion_tokens,1200);
    assert.ok(!JSON.stringify(body).includes(KEY));assert.equal(body.messages.length,2);assert.equal(body.tools,undefined);return ok();}});
  try{
    await f.call('/api/ai/settings','PUT',config);
    const payload={text:'Rewrite this. '+KEY,action:'rewrite'};
    assert.equal((await f.call('/api/ai/preview','POST',payload)).body.redactions,1);assert.equal(calls,0);
    assert.equal((await f.call('/api/ai/run','POST',payload)).status,400);assert.equal(calls,0);
    const r=await f.call('/api/ai/run','POST',await approved(f,payload));assert.equal(r.status,200);assert.equal(r.body.saved,false);assert.equal(calls,1);
    assert.equal(f.app.vault.archive.libraryStats().all,0,'generated output never auto-saved');
    await f.call('/api/ai/settings','PUT',{...config,enabled:false});
    assert.equal((await f.call('/api/ai/run','POST',await approved(f,payload))).status,403);assert.equal(calls,1);
  }finally{await f.cleanup();}
});
test('AI style use sends preferences and numeric tendencies, never stored sample excerpts',async()=>{
  const f=await fixture();try{
    const p=await f.call('/api/styles/analyze','POST',{samples:['An identifiable private sample. I enjoy concise prose.'],preferences:{tone:'Warm'}});
    const saved=await f.call('/api/styles','POST',{name:'Personal',profile:p.body.profile});
    const preview=await f.call('/api/ai/preview','POST',{action:'rewrite',text:'Project update',styleId:saved.body.style.id});
    assert.equal(preview.status,200);assert.match(preview.body.style,/Warm/);assert.ok(!JSON.stringify(preview).includes('identifiable private sample'));
  }finally{await f.cleanup();}
});
test('AI busy requests rejected; lock aborts in-flight request and old result cannot reach new session',async()=>{
  let started!:()=>void;const ready=new Promise<void>(r=>started=r);
  const f=await fixture({aiTransport:async(_url,init)=>{started();return new Promise((_resolve,reject)=>{init.signal?.addEventListener('abort',()=>reject(new Error('Secret transport body: '+KEY)),{once:true});});}});
  try{await f.call('/api/ai/settings','PUT',config);
    const request=f.call('/api/ai/run','POST',await approved(f,{action:'summarize',text:'Only synthetic text'}));await ready;
    assert.equal((await f.call('/api/ai/run','POST',await approved(f,{action:'improve',text:'second'}))).status,409);
    await f.call('/api/lock','POST',{});const result=await request;assert.notEqual(result.status,200);assert.ok(!JSON.stringify(result).includes(KEY));
    await f.call('/api/unlock','POST',{passphrase});assert.equal(f.app.vault.archive.libraryStats().all,0);
  }finally{await f.cleanup();}
});
test('provider errors, redirects, non-JSON and oversized responses are safe and not retried',async()=>{
  for(const response of [new Response(KEY,{status:401}),new Response(KEY,{status:429}),new Response('not json'),new Response('a'.repeat(100000)),new Response(JSON.stringify({choices:[]}))]){
    let calls=0;const runner=new GroqRunner(async()=>{calls++;return response;});
    await assert.rejects(runner.run(prepareAI({action:'improve',text:'hello'}),config),err=>!String(err).includes(KEY));assert.equal(calls,1);
  }
});
test('provider deadline aborts transport; no automatic retry or retained output',async()=>{
  let aborted=false;const runner=new GroqRunner(async(_u,init)=>new Promise((_r,reject)=>init.signal?.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));})),25);
  // A timer keeps this synthetic transport alive; actual sockets do this in production.
  const keepAlive=setTimeout(()=>{},1000);try{await assert.rejects(runner.run(prepareAI({action:'summarize',text:'x'}),config),/timed out/);assert.equal(aborted,true);assert.equal(runner.busy,false);}finally{clearTimeout(keepAlive);}
});
test('AI per-minute budget bounds provider usage',async()=>{
  let count=0;const runner=new GroqRunner(async()=>{count++;return ok();});const p=prepareAI({action:'structure',text:'simple text'});
  for(let i=0;i<6;i++)await runner.run(p,config);
  await assert.rejects(runner.run(p,config),/six requests/);assert.equal(count,6);
});
test('capture adapter validates site consent, size, stale timestamps and marks observations as draft snapshots',()=>{
  const allowed=new Set(['chatgpt.com']);const e=event();
  const record=browserCapture(e,allowed);assert.equal(record.quality,'draft_snapshot');assert.equal(record.origin,'unknown');
  for(const bad of [{...e,host:'evil.example'},{...e,text:'x'.repeat(50001)},{...e,recordedAt:'2020-01-01T00:00:00Z'},{...e,signal:'keyup'},{...e,eventId:'no'}])assert.throws(()=>browserCapture(bad,allowed));
  assert.throws(()=>browserCapture(e,new Set()));
});
test('automatic capture requires independent pairing consent, is idempotent, redacts keys and never calls AI',async()=>{
  let aiCalls=0;const f=await fixture({aiTransport:async()=>{aiCalls++;return ok();}});
  try{
    await f.call('/api/ai/settings','PUT',config);
    async function pair(hosts:string[]){const code=(await f.call('/api/bridge/start','POST',{autoCaptureHosts:hosts})).body.pairingCode.split(':')[2];return (await f.call('/api/bridge/pair','POST',{code},'',EXT)).body;}
    const e=event('Capture this safe request. '+KEY);
    let bridge=await pair([]);assert.equal((await f.call('/api/bridge/capture','POST',e,bridge.writeToken,EXT)).status,400);
    bridge=await pair(['chatgpt.com']);assert.deepEqual(bridge.allowedCaptureHosts,['chatgpt.com']);
    const first=await f.call('/api/bridge/capture','POST',e,bridge.writeToken,EXT);assert.equal(first.status,201);assert.equal(first.body.redactions,1);
    assert.equal((await f.call('/api/bridge/capture','POST',e,bridge.writeToken,EXT)).body.saved,false);
    assert.equal(f.app.vault.archive.stats().records,1);const items=f.app.vault.archive.listLibrary();assert.equal(items.length,1);assert.ok(!items[0]!.body.includes(KEY));assert.equal(items[0]!.captureId,e.eventId);
    assert.equal(aiCalls,0);assert.equal((await f.call('/api/ai/settings','GET',undefined,bridge.writeToken,EXT)).status,403);
    await f.call('/api/lock','POST',{});assert.equal((await f.call('/api/bridge/capture','POST',event(),bridge.writeToken,EXT)).status,423);
  }finally{await f.cleanup();}
});
test('immutable capture stays unchanged by editing its library copy; permanent deletion preserves tombstone on restore',()=>{
  const temp=temporaryArchive();const a=new EncryptedArchive(temp.path,temp.key);
  try{
    const record=browserCapture(event(),new Set(['chatgpt.com']));a.saveBrowserCapture(record);
    const item=a.listLibrary()[0]!;a.saveLibrary({title:'Edited',body:'Human edit'},item.id);
    assert.equal(a.get(record.id)!.text,record.text);assert.equal(a.getLibrary(item.id)!.captureId,record.id);
    const snapshot=a.exportSnapshot();assert.equal(snapshot.version,4);
    a.deleteLibrary(item.id);assert.equal(a.purgeLibrary(item.id),true);assert.equal(a.get(record.id),undefined);
    a.importSnapshot(snapshot);assert.equal(a.get(record.id),undefined);assert.equal(a.getLibrary(item.id),undefined);
    assert.equal(a.saveBrowserCapture(record).saved,false);
  }finally{a.close();temp.cleanup();}
});
test('capture backups preserve links; deleting a capture removes linked copy and history',()=>{
  const one=temporaryArchive(),two=temporaryArchive(),a=new EncryptedArchive(one.path,one.key),b=new EncryptedArchive(two.path,two.key);
  try{
    const record=browserCapture(event(),new Set(['chatgpt.com']));a.saveBrowserCapture(record);const item=a.listLibrary()[0]!;
    b.importSnapshot(a.exportSnapshot());assert.equal(b.getLibrary(item.id)!.captureId,record.id);
    b.deleteCaptureWithCopies(record.id);assert.equal(b.libraryStats().all,0);assert.equal(b.get(record.id),undefined);
  }finally{a.close();b.close();one.cleanup();two.cleanup();}
});
test('restored deletion evidence removes an existing linked library copy and history',()=>{
  const one=temporaryArchive(),two=temporaryArchive(),a=new EncryptedArchive(one.path,one.key),b=new EncryptedArchive(two.path,two.key);
  try{
    const record=browserCapture(event(),new Set(['chatgpt.com']));a.saveBrowserCapture(record);
    const item=a.listLibrary()[0]!;a.saveLibrary({title:'Edited',body:'Human edit'},item.id);
    b.importSnapshot(a.exportSnapshot());a.deleteCaptureWithCopies(record.id);
    const removal=a.exportSnapshot();assert.equal(b.previewSnapshot(removal).deletions,1);
    b.importSnapshot(removal);assert.equal(b.get(record.id),undefined);assert.equal(b.getLibrary(item.id),undefined);
    assert.equal(b.exportSnapshot().histories.length,0);
  }finally{a.close();b.close();one.cleanup();two.cleanup();}
});
test('diagnostics reflect opt-in capabilities without exposing credentials or approved host names',async()=>{
  const f=await fixture();try{
    const before=await f.call('/api/diagnostics');assert.equal(before.body.privacy.externalAI,false);
    await f.call('/api/ai/settings','PUT',config);
    const code=(await f.call('/api/bridge/start','POST',{autoCaptureHosts:['chatgpt.com']})).body.pairingCode.split(':')[2];
    await f.call('/api/bridge/pair','POST',{code},'',EXT);
    const report=(await f.call('/api/diagnostics')).body;
    assert.equal(report.privacy.externalAI,true);assert.equal(report.privacy.automaticCapture,true);
    assert.ok(!JSON.stringify(report).includes(KEY));assert.ok(!JSON.stringify(report).includes('chatgpt.com'));
    await f.call('/api/bridge/revoke','POST',{});
    assert.equal((await f.call('/api/diagnostics')).body.privacy.automaticCapture,false);
  }finally{await f.cleanup();}
});
test('outbound approval is invalidated by changed text, model, settings or locked session',async()=>{
  let calls=0;const f=await fixture({aiTransport:async()=>{calls++;return ok();}});
  try{
    await f.call('/api/ai/settings','PUT',config);const payload=await approved(f,{action:'improve',text:'Reviewed text'});
    assert.equal((await f.call('/api/ai/run','POST',{...payload,text:'Unreviewed text'})).status,409);
    assert.equal((await f.call('/api/ai/run','POST',{...payload,reviewDigest:undefined})).status,409);
    await f.call('/api/ai/settings','PUT',{...config,model:'llama-3.1-8b-instant'});
    assert.equal((await f.call('/api/ai/run','POST',payload)).status,409);
    const fresh=await approved(f,{action:'improve',text:'Reviewed text'});
    await f.call('/api/lock','POST',{});await f.call('/api/unlock','POST',{passphrase});
    assert.equal((await f.call('/api/ai/run','POST',fresh)).status,409);assert.equal(calls,0);
  }finally{await f.cleanup();}
});
