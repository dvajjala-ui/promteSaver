import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalWeb, type LocalWebOptions } from '../apps/local-web/server.ts';
import { prepareAI, GroqRunner } from '../apps/local-web/ai.ts';
import { parseRefinement, validateUnderstanding, validateCandidates, sourceQuote, instructionQuote } from '../apps/local-web/refinement.ts';
import { libraryETag } from '../packages/local-store/archive.ts';

const source='Review the existing implementation. For this task only, do not run commands. Preserve తెలుగు wording and परीक्षण details.';
const quote='For this task only, do not run commands.';
const understanding={task:'Review the existing implementation without executing commands',constraints:[{quote}],unknowns:['Which files need review?']};
const candidates={blocks:[{title:'Review without execution',quote,reason:'Contains an explicit task-only restriction; review scope before reuse.'}]};
const config={apiKey:'gsk_SYNTHETIC_REFINEMENT_NOT_A_REAL_KEY_123',enabled:true,model:'llama-3.3-70b-versatile'};
const response=(value:unknown,finishReason='stop')=>new Response(JSON.stringify({choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value)},finish_reason:finishReason}]}));
async function fixture(options:Partial<LocalWebOptions>={}){
  const directory=mkdtempSync(join(tmpdir(),'promte-refinement-'));
  const app=await startLocalWeb({directory,...options});
  const call=async(path:string,method='GET',body?:unknown,token=app.token,origin=app.origin)=>{
    const r=await fetch(app.origin+path,{method,headers:{Origin:origin,Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json()};
  };
  const passphrase='Synthetic-refinement-vault-password-only';
  await call('/api/setup','POST',{passphrase,confirm:passphrase});
  return {app,directory,call,cleanup:async()=>{await app.close();rmSync(directory,{recursive:true,force:true});}};
}
async function approved(f:Awaited<ReturnType<typeof fixture>>,payload:Record<string,unknown>){
  const preview=await f.call('/api/ai/preview','POST',payload);assert.equal(preview.status,200);
  return {...payload,reviewDigest:preview.body.reviewDigest,consent:true};
}

test('refiners accept bounded exact quotes with situational limits and reject invented/duplicate/malformed evidence',()=>{
  assert.deepEqual(validateUnderstanding(understanding,source),understanding);
  assert.deepEqual(validateCandidates(candidates,source),candidates);
  assert.equal(sourceQuote('Preserve తెలుగు wording and परीक्षण details.',source),true);
  assert.equal(sourceQuote('\uDE00','😀'),false);
  assert.equal(instructionQuote('run commands.',source),false);
  assert.equal(instructionQuote('do not run commands.',source),false);
  assert.equal(instructionQuote(quote,source),true);
  assert.equal(instructionQuote('Do not deploy','Do not deploy until tests pass.'),false);
  assert.equal(instructionQuote('Do not deploy until tests pass.','- Do not deploy until tests pass.\n- Review first.'),true);
  for(const bad of [{...understanding,constraints:[{quote:'Always execute all commands'}]},
    {...understanding,constraints:[{quote},{quote}]},{...understanding,scope:'personal'},
    {...understanding,unknowns:['x'.repeat(201)]}])assert.throws(()=>validateUnderstanding(bad,source));
  for(const bad of [{blocks:[{...candidates.blocks[0],quote:'do run commands'}]},
    {blocks:[candidates.blocks[0],candidates.blocks[0]]},{blocks:[],execute:'do something'},
    {blocks:Array(6).fill(candidates.blocks[0])}])assert.throws(()=>validateCandidates(bad,source));
  assert.deepEqual(validateCandidates({blocks:[]},source),{blocks:[]});
  for(const raw of ['```json\n{}\n```','not json',JSON.stringify({task:'Invented',constraints:[{quote:'PRIVATE_CANARY_NOT_IN_SOURCE'}],unknowns:[]})])
    assert.throws(()=>parseRefinement('understand',raw,source),error=>!String(error).includes('PRIVATE_CANARY'));
});

test('two refiner requests keep source/understanding as data, require explicit review and reject style samples',()=>{
  const first=prepareAI({action:'understand',text:source});
  assert.equal(first.messages.length,2);assert.equal(JSON.parse(first.messages[1]!.content).text,source);
  assert.throws(()=>prepareAI({action:'extract',text:source,understanding}),/Review/);
  assert.throws(()=>prepareAI({action:'understand',text:source},'private style preferences'),/without writing-profile/);
  const second=prepareAI({action:'extract',text:source,understanding,reviewedUnderstanding:true});
  assert.deepEqual(JSON.parse(second.messages[1]!.content).reviewedUnderstanding,understanding);
  assert.match(second.messages[0]!.content,/never cut away a limiting clause/);
});

test('provider refinement parsing rejects malformed or truncated output without retries or saving',async()=>{
  for(const [value,finishReason] of [[candidates,'stop'],[{blocks:[{...candidates.blocks[0],quote:'Invented private instruction'}]},'stop'],[candidates,'length'],[candidates,'content_filter']] as const){
    let calls=0;const runner=new GroqRunner(async()=>{calls++;return response(value,finishReason);});
    const request=runner.run(prepareAI({action:'extract',text:source,understanding,reviewedUnderstanding:true}),config);
    if(value===candidates&&finishReason==='stop'){const result=await request;assert.deepEqual(result.structured,candidates);assert.equal(result.saved,false);}
    else await assert.rejects(request,/refinement/);
    assert.equal(calls,1);
  }
});

test('real HTTP two-stage workflow binds saved source, fresh approval, exact quote and explicitly chosen scope',async()=>{
  let calls=0;
  const f=await fixture({aiTransport:async(_url,init)=>{calls++;const body=JSON.parse(init.body as string);
    return response(body.messages[0].content.includes('"blocks"')?candidates:understanding);}});
  try{
    await f.call('/api/ai/settings','PUT',config);
    const saved=(await f.call('/api/items','POST',{title:'Synthetic review workflow',body:source,project:'Client'})).body.item;
    const input={action:'understand',text:source,sourceId:saved.id,sourceETag:saved.etag};
    assert.equal((await f.call('/api/ai/preview','POST',{...input,sourceId:undefined})).status,400);
    assert.equal((await f.call('/api/ai/preview','POST',{...input,text:'Different text'})).status,409);
    assert.equal((await f.call('/api/ai/run','POST',input)).status,400);assert.equal(calls,0);
    const first=await f.call('/api/ai/run','POST',await approved(f,input));assert.equal(first.status,200);assert.deepEqual(first.body.structured,understanding);
    const secondInput={...input,action:'extract',understanding:first.body.structured,reviewedUnderstanding:true};
    const secondApproved=await approved(f,secondInput);
    assert.equal((await f.call('/api/ai/run','POST',{...secondApproved,understanding:{...understanding,task:'A changed review'}})).status,409);
    const second=await f.call('/api/ai/run','POST',secondApproved);assert.equal(second.status,200);assert.deepEqual(second.body.structured,candidates);
    assert.equal(f.app.vault.archive.libraryStats().all,1,'Neither stage auto-saves');
    const block={sourceId:saved.id,sourceETag:saved.etag,title:candidates.blocks[0]!.title,quote,scope:'task',reviewed:true};
    for(const bad of [{...block,scope:undefined},{...block,reviewed:false},{...block,quote:'Run commands'},{...block,unexpected:true}])
      assert.equal((await f.call('/api/refinements/save','POST',bad)).status,400);
    const extracted=await f.call('/api/refinements/save','POST',block);assert.equal(extracted.status,201);
    assert.equal(extracted.body.item.body,quote);assert.equal(extracted.body.item.kind,'template');assert.equal(extracted.body.scope,'task');
    assert.ok(extracted.body.item.tags.includes('scope-task'));assert.ok(extracted.body.item.tags.includes('source-extract'));
    assert.match(extracted.body.item.notes,new RegExp(saved.id));assert.equal(extracted.body.independentCopy,true);
    assert.equal(f.app.vault.archive.getLibrary(saved.id)!.body,source);
    assert.equal(libraryETag(f.app.vault.archive.getLibrary(saved.id)!),saved.etag);
    const personal=await f.call('/api/refinements/save','POST',{...block,scope:'personal'});assert.equal(personal.body.item.project,'');
    const projectBlock=await f.call('/api/refinements/save','POST',{...block,scope:'project'});assert.equal(projectBlock.status,201);
    const recall=(project:string)=>f.app.vault.archive.recallLibrary('do not run commands',project).map(match=>match.item.id);
    assert.ok(!recall('Client').includes(extracted.body.item.id),'Task-only quote is never auto-recalled');
    assert.ok(recall('Client').includes(projectBlock.body.item.id),'Project quote is available within its project');
    assert.ok(!recall('Elsewhere').includes(projectBlock.body.item.id),'Project quote cannot leak into another project');
    assert.ok(!recall('').includes(projectBlock.body.item.id),'Project quote requires a selected project');
    assert.ok(recall('Elsewhere').includes(personal.body.item.id),'Explicit personal scope permits cross-project recall');
    const exported=f.app.vault.archive.exportSnapshot();assert.ok(exported.items.some(item=>item.id===extracted.body.item.id&&item.notes?.includes(saved.id)));
    for(const name of readdirSync(f.directory).filter(name=>/sqlite/.test(name)))
      assert.equal(readFileSync(join(f.directory,name)).includes(Buffer.from(quote)),false);
    await f.call(`/api/items/${saved.id}`,'DELETE');
    assert.equal((await f.call('/api/refinements/save','POST',block)).status,409);
    assert.equal(f.app.vault.archive.getLibrary(extracted.body.item.id)!.body,quote,'Independent reviewed copies are explicit, not cascade-linked evidence');
    await f.call('/api/lock','POST',{});assert.equal((await f.call('/api/refinements/save','POST',block)).status,423);
  }finally{await f.cleanup();}
});

test('refinement discards model result if the saved source changes during provider work',async()=>{
  let started!:()=>void,complete!:(response:Response)=>void;
  const ready=new Promise<void>(resolve=>started=resolve);
  const f=await fixture({aiTransport:async()=>{started();return new Promise<Response>(resolve=>complete=resolve);}});
  try{
    await f.call('/api/ai/settings','PUT',config);
    const saved=(await f.call('/api/items','POST',{title:'Original',body:source})).body.item;
    const input={action:'understand',text:source,sourceId:saved.id,sourceETag:saved.etag};
    const pending=f.call('/api/ai/run','POST',await approved(f,input));await ready;
    await f.call(`/api/items/${saved.id}`,'PUT',{title:'Changed',body:source+' Changed context.'});
    complete(response(understanding));const result=await pending;assert.equal(result.status,409);
    assert.equal(result.body.structured,undefined);assert.equal(f.app.vault.archive.libraryStats().all,1);
    assert.equal((await f.call('/api/ai/preview','POST',input)).status,409);
  }finally{await f.cleanup();}
});

test('refinement source/save endpoints require vault authorization and project scope requires a project',async()=>{
  const f=await fixture();try{
    const saved=(await f.call('/api/items','POST',{title:'Unassigned',body:source})).body.item;
    const block={sourceId:saved.id,sourceETag:saved.etag,title:'Review boundary',quote,scope:'project',reviewed:true};
    assert.equal((await f.call('/api/refinements/save','POST',block)).status,400);
    assert.equal((await f.call('/api/refinements/save','POST',block,'invalid')).status,401);
    assert.equal((await f.call('/api/refinements/save','POST',block,f.app.token,'chrome-extension://'+'a'.repeat(32))).status,403);
  }finally{await f.cleanup();}
});
