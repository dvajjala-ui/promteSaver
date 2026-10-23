import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedArchive, MAX_EDITOR_DRAFTS, type DraftInput } from '../packages/local-store/archive.ts';
import { temporaryArchive } from './helpers.ts';
import { startLocalWeb } from '../apps/local-web/server.ts';

const entry = (id = randomUUID(), body = 'SECRET_DRAFT_CANARY_2026'): DraftInput => ({
  id, title:'Synthetic unsaved work', body, kind:'prompt', project:'Project One',
  tags:'memory, recovery', pinned:false, notes:'Retain across a crash', source:'Manual editor'
});

test('drafts are encrypted, bounded, isolated from library/history/portable export, and recover after restart', () => {
  const temp=temporaryArchive(); let vault=new EncryptedArchive(temp.path,temp.key);
  try {
    const first=entry();vault.saveDraft(first);
    assert.equal(vault.queryLibrary({query:'secret_draft'}).total,0);
    assert.equal(vault.libraryStats().all,0);
    assert.equal(vault.exportSnapshot().items.length,0);
    assert.deepEqual(vault.listDrafts()[0]?.body,first.body);
    for(const file of readdirSync(temp.directory)) {
      const data=readFileSync(join(temp.directory,file));
      assert.equal(data.includes(Buffer.from('SECRET_DRAFT_CANARY')),false,`Draft leaked to ${file}`);
    }
    vault.close();vault=new EncryptedArchive(temp.path,temp.key);
    assert.equal(vault.listDrafts()[0]?.id,first.id);
    assert.equal(vault.deleteDraft(first.id),true);
    assert.equal(vault.deleteDraft(first.id),false);
    assert.deepEqual(vault.listDrafts(),[]);
  } finally {vault.close();temp.cleanup();}
});

test('draft limit, invalid identifiers/oversized data, and tamper detection are enforced', () => {
  const temp=temporaryArchive();const vault=new EncryptedArchive(temp.path,temp.key);const inspect=new DatabaseSync(temp.path);
  try {
    assert.throws(()=>vault.saveDraft({...entry(),id:'../../unsafe'}),/Invalid editor draft/);
    assert.throws(()=>vault.saveDraft({...entry(),body:'a'.repeat(100001)}),/Invalid editor draft/);
    assert.throws(()=>vault.saveDraft({...entry(),notes:'n'.repeat(2001)}),/Invalid editor draft/);
    assert.throws(()=>vault.saveDraft({...entry(),unexpected:true} as DraftInput),/Invalid editor draft/);
    const ids=Array.from({length:MAX_EDITOR_DRAFTS},()=>randomUUID());
    ids.forEach(id=>vault.saveDraft(entry(id)));
    assert.equal(vault.listDrafts().length,MAX_EDITOR_DRAFTS);
    assert.throws(()=>vault.saveDraft(entry()),/draft limit/);
    // Existing id may be updated at capacity, without deleting somebody else's work.
    vault.saveDraft(entry(ids[0],'A new recovery body'));
    assert.equal(vault.listDrafts().find(d=>d.id===ids[0])?.body,'A new recovery body');
    const name='editor-draft-v1:'+ids[0];
    const envelope=Buffer.from(inspect.prepare('SELECT payload FROM metadata WHERE name=?').get(name)!.payload as Uint8Array);
    envelope[envelope.length-1] = envelope[envelope.length-1]! ^ 1;
    inspect.prepare('UPDATE metadata SET payload=? WHERE name=?').run(envelope,name);
    assert.throws(()=>vault.listDrafts(),/authentication failed/);
  } finally {inspect.close();vault.close();temp.cleanup();}
});

test('unlocked HTTP draft API requires bearer token, rejects invalid data and preserves drafts through locking', async()=>{
  const directory=mkdtempSync(join(tmpdir(),'promte-draft-http-'));
  const app=await startLocalWeb({directory});
  try {
    const request=async(path:string,method='GET',payload?:unknown,token=app.token)=>{
      const response=await fetch(app.origin+path,{method,headers:{Authorization:'Bearer '+token,Origin:app.origin,
        ...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
      return {status:response.status,data:await response.json()};
    };
    const draft=entry();const path='/api/drafts/'+draft.id;
    assert.equal((await request('/api/drafts')).status,423);
    assert.equal((await request('/api/setup','POST',{passphrase:'This-is-only-a-synthetic-test-passphrase',confirm:'This-is-only-a-synthetic-test-passphrase'})).status,201);
    assert.equal((await request(path,'PUT',draft,'wrong')).status,401);
    assert.equal((await request(path,'PUT',{...draft,id:randomUUID()})).status,400);
    assert.equal((await request(path,'PUT',{...draft,body:'z'.repeat(101000)})).status,400);
    assert.equal((await request(path,'PUT',draft)).status,200);
    assert.equal((await request('/api/drafts')).data.drafts[0].body,draft.body);
    assert.equal((await request('/api/lock','POST')).status,200);
    assert.equal((await request('/api/drafts')).status,423);
    assert.equal((await request('/api/unlock','POST',{passphrase:'This-is-only-a-synthetic-test-passphrase'})).status,200);
    assert.equal((await request('/api/drafts')).data.drafts.length,1);
    assert.equal((await request(path,'DELETE')).data.deleted,true);
    assert.equal((await request('/api/drafts')).data.drafts.length,0);
  } finally {await app.close();rmSync(directory,{recursive:true,force:true});}
});
