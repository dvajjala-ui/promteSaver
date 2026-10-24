import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/browser-helper/background.js',import.meta.url),'utf8');
const popup={url:'chrome-extension://'+'a'.repeat(32)+'/popup.html'};
const sender={url:'https://chatgpt.com/c/synthetic',frameId:0,tab:{id:1,incognito:false}};
function fixture(fetcher=async()=>new Response('{"saved":true,"redactions":0}')){
  const local={},session={},registered=[],access=[],listeners={};
  const storage=data=>({get:async key=>structuredClone({[key]:data[key]}),set:async values=>Object.assign(data,structuredClone(values)),remove:async key=>delete data[key],setAccessLevel:async option=>access.push(option.accessLevel)});
  const chrome={storage:{local:storage(local),session:storage(session),onChanged:{addListener(fn){listeners.storage=fn;}}},
    runtime:{getURL:path=>popup.url.replace('popup.html',path),onMessage:{addListener(){}}},
    tabs:{query:async()=>[],sendMessage:async()=>({})},
    scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async values=>registered.push(...values),executeScript:async()=>{}},
    permissions:{contains:async()=>true,onRemoved:{addListener(fn){listeners.removed=fn;}}}};
  const context=vm.createContext({chrome,fetch:fetcher,URL,setTimeout,clearTimeout,AbortController,TextDecoder});
  vm.runInContext(source+'\nglobalThis.callHandler=handle;',context);
  return {call:(message,s=sender)=>context.callHandler(message,s),local,session,registered,access,chrome,listeners};
}
function pair(f){f.local['promtesaver.sites']={'chatgpt.com':{enabled:true,hints:true}};f.session['promtesaver.bridge']={port:23456,writeToken:'b'.repeat(64),expiresAt:Date.now()+60000,allowedCaptureHosts:['chatgpt.com']};}
const capture=()=>({type:'CAPTURE',event:{eventId:'e05dd976-5d8a-4e89-9f23-f5f09168db01',recordedAt:new Date().toISOString(),signal:'send-click',text:'A synthetic prompt'}});

test('MV3 worker starts unpaired, storage is trusted-context only, and content scripts get no bearer secrets',async()=>{
  const f=fixture();assert.equal((await f.call({type:'STATE'})).canCapture,false);pair(f);
  const state=await f.call({type:'STATE'});assert.equal(state.canCapture,true);assert.equal(state.enabled,true);
  assert.ok(!JSON.stringify(state).includes('b'.repeat(64)));assert.deepEqual(f.access,['TRUSTED_CONTEXTS','TRUSTED_CONTEXTS']);
});

test('MV3 checks actual host permission even if enabled settings survived revocation',async()=>{
  let requests=0;const f=fixture(async()=>{requests++;return new Response('{}');});pair(f);
  f.chrome.permissions.contains=async()=>false;
  assert.equal((await f.call({type:'STATE'})).enabled,false);
  assert.equal((await f.call(capture())).ok,false);assert.equal(requests,0);
});

test('MV3 Pause wins over pending Enable registration and aborts an active capture',async()=>{
  let registered,release;
  const ready=new Promise(resolve=>registered=resolve);
  const held=new Promise(resolve=>release=resolve);
  const f=fixture();pair(f);
  const scripts=new Set();
  f.chrome.scripting.registerContentScripts=async values=>{registered();await held;values.forEach(v=>scripts.add(v.id));};
  f.chrome.scripting.unregisterContentScripts=async({ids})=>ids.forEach(id=>scripts.delete(id));
  const enabling=f.call({type:'SET_SITE',host:'chatgpt.com',enabled:true,hints:true},popup);await ready;
  const paused=f.call({type:'PAUSE_SITE'});
  assert.equal((await f.call(capture())).ok,false);
  release();await Promise.all([enabling,paused]);
  assert.equal((await f.call({type:'STATE'})).enabled,false);assert.equal(scripts.size,0);
  assert.equal(f.local['promtesaver.sites']['chatgpt.com'].enabled,false);

  let started,aborted=false;const active=new Promise(resolve=>started=resolve);
  const busy=fixture(async(_url,init)=>{started();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));},{once:true}));});pair(busy);
  const request=busy.call(capture());await active;await busy.call({type:'PAUSE_SITE'});
  const cancelled=await request;assert.equal(cancelled.ok,false);assert.match(cancelled.error,/already received/);assert.equal(aborted,true);
});

test('MV3 concurrent changes on different sites preserve both choices and failed registration stays disabled',async()=>{
  const f=fixture();
  await Promise.all(['chatgpt.com','claude.ai'].map(host=>f.call({type:'SET_SITE',host,enabled:true,hints:true},popup)));
  assert.equal(f.local['promtesaver.sites']['chatgpt.com'].enabled,true);
  assert.equal(f.local['promtesaver.sites']['claude.ai'].enabled,true);
  f.chrome.scripting.registerContentScripts=async()=>{throw Error('Chrome registration failed');};
  await assert.rejects(f.call({type:'SET_SITE',host:'gemini.google.com',enabled:true,hints:true},popup));
  assert.equal(f.local['promtesaver.sites']['gemini.google.com'].enabled,false);
  assert.equal((await f.call({type:'STATE',host:'gemini.google.com'},popup)).enabled,false);
});

test('MV3 revocation during an async authorization read cannot forward text',async()=>{
  let requests=0,reached,release;
  const ready=new Promise(resolve=>reached=resolve),held=new Promise(resolve=>release=resolve);
  const f=fixture(async()=>{requests++;return new Response('{}');});pair(f);
  const original=f.chrome.storage.session.get;let reads=0;
  f.chrome.storage.session.get=async key=>{const snapshot=await original(key);if(++reads===2){reached();await held;}return snapshot;};
  const request=f.call(capture());await ready;
  delete f.session['promtesaver.bridge'];f.listeners.storage({'promtesaver.bridge':{}},'session');release();
  assert.equal((await request).ok,false);assert.equal(requests,0);
});

test('MV3 revocation aborts fetch and a late old response cannot clear a new pairing',async()=>{
  let reached,resolveResponse,signal;
  const ready=new Promise(resolve=>reached=resolve);
  const f=fixture(async(_url,init)=>{signal=init.signal;reached();return new Promise(resolve=>resolveResponse=resolve);});pair(f);
  const request=f.call(capture());await ready;
  f.session['promtesaver.bridge'].writeToken='c'.repeat(64);
  f.listeners.storage({'promtesaver.bridge':{}},'session');assert.equal(signal.aborted,true);
  resolveResponse(new Response('{}',{status:423}));
  assert.equal((await request).ok,false);assert.equal(f.session['promtesaver.bridge'].writeToken,'c'.repeat(64));
});

test('MV3 authorization cannot switch to another pairing between storage reads',async()=>{
  for(const replacement of [{port:99999},{port:'23456@invalid.example'},{writeToken:'c'.repeat(64)},{allowedCaptureHosts:[]}]){
    let requests=0,reads=0;
    const f=fixture(async()=>{requests++;return new Response('{}');});pair(f);
    const original=f.chrome.storage.session.get;
    f.chrome.storage.session.get=async key=>{if(++reads===2)Object.assign(f.session['promtesaver.bridge'],replacement);return original(key);};
    assert.equal((await f.call(capture())).ok,false);assert.equal(requests,0);
  }
});
test('MV3 source validation rejects wrong origin, subframes, incognito and page attempts to enable access',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return new Response('{}');});pair(f);
  for(const bad of [{...sender,url:'https://evil.example/'},{...sender,frameId:1},{...sender,tab:{id:1,incognito:true}},{url:sender.url,frameId:0}])assert.equal((await f.call(capture(),bad)).ok,false);
  assert.equal((await f.call({type:'SET_SITE',host:'chatgpt.com',enabled:true})).ok,false);assert.equal(calls,0);
});
test('MV3 site registration scoped to optional host, top frame and static content files',async()=>{
  const f=fixture();const result=await f.call({type:'SET_SITE',host:'claude.ai',enabled:true,hints:true},popup);
  assert.equal(result.ok,true);assert.equal(f.registered.length,1);
  assert.equal(f.registered[0].matches[0],'https://claude.ai/*');assert.equal(f.registered[0].allFrames,false);
  assert.deepEqual(Array.from(f.registered[0].js),['editor-core.js','recorder.js']);
  assert.equal((await f.call({type:'PAUSE_SITE'})).ok,true);
});
test('MV3 forwards only allowed host-derived payload to loopback; no prompts persist in extension storage',async()=>{
  let requests=0;const f=fixture(async(url,init)=>{requests++;assert.equal(url,'http://127.0.0.1:23456/api/bridge/capture');
    const body=JSON.parse(init.body);assert.equal(body.host,'chatgpt.com');assert.equal(body.path,undefined);assert.equal(body.title,undefined);
    assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer '+'b'.repeat(64));return new Response('{"saved":true}');});pair(f);
  const message=capture();message.event.host='evil.example';message.event.path='/private-path';
  assert.equal((await f.call(message)).saved,true);assert.equal(requests,1);
  assert.ok(!JSON.stringify([f.local,f.session]).includes('A synthetic prompt'));
});
test('MV3 locking failures clear session permission; unreachable service does not queue or retry text',async()=>{
  const f=fixture(async()=>new Response('{"error":"locked"}',{status:423}));pair(f);
  const response=await f.call(capture());assert.equal(response.repair,true);assert.equal(f.session['promtesaver.bridge'],undefined);
  let requests=0;const offline=fixture(async()=>{requests++;throw Error('network unavailable');});pair(offline);
  const unconfirmed=await offline.call(capture());assert.equal(unconfirmed.ok,false);assert.match(unconfirmed.error,/confirm local save/);
  await new Promise(r=>setTimeout(r,20));assert.equal(requests,1);
  assert.ok(!JSON.stringify([offline.local,offline.session]).includes('A synthetic prompt'));
});
test('MV3 keeps at most twenty content-free session gap receipts and distinguishes unconfirmed saves',async()=>{
  const f=fixture(async()=>{throw Error('synthetic offline');});pair(f);
  for(let i=0;i<22;i++)assert.equal((await f.call(capture())).ok,false);
  const gaps=f.session['promtesaver.gaps'];
  assert.equal(gaps.length,20);
  assert.ok(gaps.every(entry=>entry.host==='chatgpt.com'&&entry.reason==='save-unconfirmed'&&Number.isFinite(Date.parse(entry.at))));
  assert.ok(!JSON.stringify([f.local,f.session]).includes('A synthetic prompt'));
  delete f.session['promtesaver.bridge'];
  assert.equal((await f.call(capture())).ok,false);
  assert.equal(f.session['promtesaver.gaps'].at(-1).reason,'vault-unpaired');
  f.local['promtesaver.sites']['chatgpt.com'].enabled=false;
  assert.equal((await f.call(capture())).ok,false);
  assert.equal(f.session['promtesaver.gaps'].at(-1).reason,'paused-or-permission');
});
test('MV3 does not send expired, unapproved-site, unpaired or oversized captures',async()=>{
  let requests=0;const f=fixture(async()=>{requests++;return new Response('{}');});pair(f);
  assert.equal((await f.call({...capture(),event:{...capture().event,text:'x'.repeat(50001)}})).ok,false);
  f.session['promtesaver.bridge'].expiresAt=0;assert.equal((await f.call(capture())).ok,false);
  pair(f);f.session['promtesaver.bridge'].allowedCaptureHosts=[];assert.equal((await f.call(capture())).ok,false);
  assert.equal(requests,0);
});
test('MV3 bridge limits response bytes and bounds parallel in-flight captures without queuing',async()=>{
  const large=fixture(async()=>new Response('a'.repeat(8193)));pair(large);
  assert.equal((await large.call(capture())).ok,false);
  let count=0;const resolve=[];
  const busy=fixture(async()=>{count++;return new Promise(r=>resolve.push(r));});pair(busy);
  const first=busy.call(capture()),second=busy.call(capture());
  while(count<2)await new Promise(r=>setTimeout(r,1));
  const rejected=await busy.call(capture());assert.equal(rejected.ok,false);assert.match(rejected.error,/already pending/);
  for(const r of resolve)r(new Response('{"saved":true}'));
  assert.equal((await first).saved,true);assert.equal((await second).saved,true);assert.equal(count,2);
});
test('MV3 malformed success is an unconfirmed save, never an already-saved receipt',async()=>{
  const f=fixture(async()=>new Response('{}',{status:200}));pair(f);
  const result=await f.call(capture());
  assert.equal(result.ok,false);
  assert.match(result.error,/Could not confirm local save/);
  assert.equal(f.session['promtesaver.gaps'].at(-1).reason,'save-unconfirmed');
  assert.ok(!JSON.stringify([f.local,f.session]).includes('A synthetic prompt'));
});
