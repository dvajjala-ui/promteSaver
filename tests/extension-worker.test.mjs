import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/browser-helper/background.js',import.meta.url),'utf8');
const popup={url:'chrome-extension://'+'a'.repeat(32)+'/popup.html'};
const sender={url:'https://chatgpt.com/c/synthetic',frameId:0,tab:{id:1,incognito:false}};
function fixture(fetcher=async()=>new Response('{"saved":true,"redactions":0}')){
  const local={},session={},registered=[],access=[];
  const storage=data=>({get:async key=>({[key]:data[key]}),set:async values=>Object.assign(data,values),remove:async key=>delete data[key],setAccessLevel:async option=>access.push(option.accessLevel)});
  const chrome={storage:{local:storage(local),session:storage(session),onChanged:{addListener(){}}},
    runtime:{getURL:path=>popup.url.replace('popup.html',path),onMessage:{addListener(){}}},
    tabs:{query:async()=>[],sendMessage:async()=>({})},
    scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async values=>registered.push(...values),executeScript:async()=>{}},
    permissions:{contains:async()=>true,onRemoved:{addListener(){}}}};
  const context=vm.createContext({chrome,fetch:fetcher,URL,setTimeout,clearTimeout,AbortController,TextDecoder});
  vm.runInContext(source+'\nglobalThis.callHandler=handle;',context);
  return {call:(message,s=sender)=>context.callHandler(message,s),local,session,registered,access};
}
function pair(f){f.local['promtesaver.sites']={'chatgpt.com':{enabled:true,hints:true}};f.session['promtesaver.bridge']={port:23456,writeToken:'b'.repeat(64),expiresAt:Date.now()+60000,allowedCaptureHosts:['chatgpt.com']};}
const capture=()=>({type:'CAPTURE',event:{eventId:'e05dd976-5d8a-4e89-9f23-f5f09168db01',recordedAt:new Date().toISOString(),signal:'send-click',text:'A synthetic prompt'}});

test('MV3 worker starts unpaired, storage is trusted-context only, and content scripts get no bearer secrets',async()=>{
  const f=fixture();assert.equal((await f.call({type:'STATE'})).canCapture,false);pair(f);
  const state=await f.call({type:'STATE'});assert.equal(state.canCapture,true);assert.equal(state.enabled,true);
  assert.ok(!JSON.stringify(state).includes('b'.repeat(64)));assert.deepEqual(f.access,['TRUSTED_CONTEXTS','TRUSTED_CONTEXTS']);
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
  assert.equal((await offline.call(capture())).ok,false);await new Promise(r=>setTimeout(r,20));assert.equal(requests,1);
  assert.ok(!JSON.stringify([offline.local,offline.session]).includes('A synthetic prompt'));
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
