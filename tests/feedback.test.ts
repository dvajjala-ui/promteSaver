import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalWeb } from '../apps/local-web/server.ts';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
import { temporaryArchive } from './helpers.ts';

test('feedback is encrypted, scoped to the current revision, suppresses only hidden recall, and survives backup',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'promte-feedback-'));
  const app=await startLocalWeb({directory});
  const call=async(path:string,method='GET',body?:unknown,etag?:string,token=app.token)=>{
    const response=await fetch(app.origin+path,{method,headers:{Origin:app.origin,Authorization:`Bearer ${token}`,
      ...(etag?{'If-Match':etag}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  };
  const replicaFile=temporaryArchive();let replica:EncryptedArchive|undefined;
  try{
    const passphrase='Synthetic-feedback-vault-password';
    assert.equal((await call('/api/setup','POST',{passphrase,confirm:passphrase})).status,201);
    const source=(await call('/api/items','POST',{title:'Review authentication flow',body:'Review authentication flow and preserve passing tests.',project:'Client'})).body.item;
    const request={revision:source.revision,feedback:'worked'};
    assert.equal((await call(`/api/items/${source.id}/feedback`,'POST',request)).status,428);
    assert.equal((await call(`/api/items/${source.id}/feedback`,'POST',request,'"wrong"')).status,412);
    assert.equal((await call(`/api/items/${source.id}/feedback`,'POST',{...request,feedback:'invented'},source.etag)).status,400);
    assert.equal((await call(`/api/items/${source.id}/feedback`,'POST',request,source.etag,'invalid')).status,401);
    const worked=await call(`/api/items/${source.id}/feedback`,'POST',request,source.etag);
    assert.equal(worked.status,200);assert.equal(worked.body.item.feedback,'worked');
    assert.equal(worked.body.item.feedbackRevision,source.revision);
    assert.equal(worked.body.item.etag,source.etag,'feedback does not counterfeit a content revision');
    assert.equal(app.vault.archive.recallLibrary('Review authentication flow','Client')[0]?.item.id,source.id,
      'worked feedback does not automatically boost or suppress a result');
    const hidden=await call(`/api/items/${source.id}/feedback`,'POST',{revision:source.revision,feedback:'hidden'},source.etag);
    assert.equal(hidden.status,200);
    assert.equal(app.vault.archive.recallLibrary('Review authentication flow','Client').length,0);
    const snapshot=app.vault.archive.exportSnapshot();
    replica=new EncryptedArchive(replicaFile.path,replicaFile.key);replica.importSnapshot(snapshot);
    assert.equal(replica.getLibrary(source.id)?.feedback,'hidden');
    assert.equal(replica.recallLibrary('Review authentication flow','Client').length,0);
    for(const name of readdirSync(directory).filter(name=>/sqlite/.test(name)))
      assert.equal(readFileSync(join(directory,name)).includes(Buffer.from('"feedback":"hidden"')),false);
    assert.equal((await call(`/api/items/${source.id}/feedback`,'POST',{revision:source.revision+1,feedback:'worked'},source.etag)).status,412);
    const edited=await call(`/api/items/${source.id}`,'PUT',{title:'Updated review',body:'Review authentication flow with updated constraints.',project:'Client'},source.etag);
    assert.equal(edited.status,200);assert.equal(edited.body.item.feedback,undefined);
    assert.equal(app.vault.archive.libraryHistory(source.id)[0]?.feedback,'hidden','earlier revision retains its own feedback');
    assert.equal(app.vault.archive.recallLibrary('authentication flow','Client')[0]?.item.id,source.id);
    const cleared=await call(`/api/items/${source.id}/feedback`,'POST',{revision:edited.body.item.revision,feedback:null},edited.body.item.etag);
    assert.equal(cleared.status,200);assert.equal(cleared.body.item.feedback,undefined);
    await call('/api/lock','POST',{});
    assert.equal((await call(`/api/items/${source.id}/feedback`,'POST',{revision:edited.body.item.revision,feedback:'worked'},edited.body.item.etag)).status,423);
  }finally{replica?.close();replicaFile.cleanup();await app.close();rmSync(directory,{recursive:true,force:true});}
});
