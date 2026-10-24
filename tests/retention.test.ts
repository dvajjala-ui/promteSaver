import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
import { record, temporaryArchive } from './helpers.ts';
import { startLocalWeb } from '../apps/local-web/server.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('capture retention preview is bounded and purge removes linked editable copies', () => {
  const temp = temporaryArchive();
  const archive = new EncryptedArchive(temp.path, temp.key);
  try {
    const old = { ...record('old-capture'), recordedAt: new Date(Date.now() - 10 * 86400000).toISOString() };
    assert.equal(archive.saveBrowserCapture(old).saved,true);
    const linked=archive.listLibrary().find(item=>item.captureId===old.id);
    assert.ok(linked);
    const fresh={...record('fresh-capture'),recordedAt:new Date().toISOString()};
    assert.equal(archive.saveBrowserCapture(fresh).saved,true);
    const preview=archive.captureRetentionPreview(7);
    assert.equal(preview.count,1);
    assert.throws(() => archive.captureRetentionPreview(1), /Invalid capture retention/);
    assert.throws(() => archive.purgeCapturesOlderThan({days:7}), /Invalid capture retention/);
    assert.throws(() => archive.purgeCapturesOlderThan({...preview,digest:'0'.repeat(64)}), /preview changed/);
    assert.ok(archive.get('old-capture'),'a stale review cannot delete evidence');
    assert.equal(archive.purgeCapturesOlderThan(preview), 1);
    assert.equal(archive.get('old-capture'), undefined);
    assert.equal(archive.getLibrary(linked.id),undefined);
    assert.throws(()=>archive.libraryHistory(linked.id),/Library item not found/);
    assert.equal(archive.recentCaptures().length,1);
    assert.equal(archive.get('fresh-capture')?.id,'fresh-capture');
    assert.ok(archive.exportSnapshot().tombstones?.includes(old.id));
  } finally { archive.close(); temp.cleanup(); }
});

test('retention HTTP endpoints require an unlocked authorized vault and a matching review',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'promte-retention-'));
  const app=await startLocalWeb({directory});
  const call=async(path:string,body:unknown,token=app.token)=>{
    const response=await fetch(app.origin+path,{method:'POST',headers:{Origin:app.origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  try{
    const passphrase='Synthetic-retention-vault-password';
    assert.equal((await call('/api/setup',{passphrase,confirm:passphrase})).status,201);
    const old={...record('http-old'),recordedAt:new Date(Date.now()-10*86400000).toISOString()};
    app.vault.archive.saveBrowserCapture(old);
    assert.equal((await call('/api/captured/retention-preview',{days:7},'wrong')).status,401);
    assert.equal((await call('/api/captured/retention-preview',{days:1})).status,400);
    const review=await call('/api/captured/retention-preview',{days:7});
    assert.equal(review.status,200);assert.equal(review.body.count,1);
    assert.equal((await call('/api/captured/retention-apply',{...review.body,digest:'0'.repeat(64)})).status,409);
    assert.ok(app.vault.archive.get(old.id));
    assert.equal((await call('/api/captured/retention-apply',review.body)).body.removed,1);
    assert.equal(app.vault.archive.get(old.id),undefined);
    await call('/api/lock',{});
    assert.equal((await call('/api/captured/retention-preview',{days:7})).status,423);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});

test('captured pages reach older evidence and bound search results',()=>{
  const temp=temporaryArchive();const archive=new EncryptedArchive(temp.path,temp.key);
  try{
    for(let index=0;index<45;index++)archive.put(record(`capture-${index}`,index===0?'Synthetic oldest needle':'Synthetic ordinary prompt'));
    const first=archive.capturePage('',20,0),last=archive.capturePage('',20,40);
    assert.equal(first.total,45);assert.equal(first.items.length,20);
    assert.equal(last.items.length,5);assert.equal(last.items.at(-1)?.id,'capture-0');
    const matched=archive.capturePage('needle',20,0);
    assert.equal(matched.total,1);assert.equal(matched.items[0]?.id,'capture-0');
    assert.throws(()=>archive.capturePage('',101,0),/Invalid result limit/);
    assert.throws(()=>archive.capturePage('',20,-1),/Invalid capture search/);
  }finally{archive.close();temp.cleanup();}
});
