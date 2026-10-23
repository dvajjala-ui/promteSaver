import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedArchive, type ArchiveSnapshot, StyleConflictError, MAX_WRITING_STYLES } from '../packages/local-store/archive.ts';
import { analyzeWriting } from '../packages/writing-style/profile.ts';
import { startLocalWeb } from '../apps/local-web/server.ts';

const EXAMPLE = "I'm building a careful, calm product. I'm writing for the user. I don't want hype!";
const makeProfile = () => analyzeWriting([EXAMPLE], {tone:'Clear, warm', audience:'Developer readers'});
const vault = () => {
  const directory=mkdtempSync(join(tmpdir(),'promtesaver-style-test-'));
  return {directory,path:join(directory,'archive.sqlite'),key:randomBytes(32),clean:()=>rmSync(directory,{recursive:true,force:true})};
};

test('writing profiles are encrypted at rest, bounded, and survive restart',()=>{
  const env=vault();let db=new EncryptedArchive(env.path,env.key);
  try{
    const result=db.saveStyle({name:'My private work tone',profile:makeProfile()});
    assert.equal(result.revision,1);assert.equal(db.listStyles().length,1);
    assert.equal(db.getStyle(result.id)?.profile.examples[0],EXAMPLE);
    assert.equal(JSON.stringify(db.listStyles()).includes(EXAMPLE),false,'list is summary-only');
    const inspector=new DatabaseSync(env.path);
    assert.deepEqual(inspector.prepare('PRAGMA table_info(writing_styles)').all().map(row=>row.name),['id','payload']);
    inspector.close();
    for(const name of readdirSync(env.directory)){
      const bytes=readFileSync(join(env.directory,name));
      assert.equal(bytes.includes(Buffer.from(EXAMPLE)),false,`Plaintext style in ${name}`);
      assert.equal(bytes.includes(Buffer.from('My private work tone')),false,`Plaintext name in ${name}`);
    }
    db.close();db=new EncryptedArchive(env.path,env.key);
    assert.equal(db.getStyle(result.id)?.profile.preferences.tone,'Clear, warm');
    db.deleteStyle(result.id);assert.equal(db.listStyles().length,0);
  } finally {db.close();env.clean();}
});

test('style profiles reject tampering, invalid types, oversized or extra fields and stale edits',()=>{
  const env=vault();const db=new EncryptedArchive(env.path,env.key);
  try{
    const record=db.saveStyle({name:'My style',profile:makeProfile()});
    assert.throws(()=>db.saveStyle({name:'',profile:makeProfile()}),/Invalid writing profile/);
    assert.throws(()=>db.saveStyle({name:'Okay',profile:{...makeProfile(),examples:['a'.repeat(701)]}}),/Invalid writing profile/);
    assert.throws(()=>db.saveStyle({name:'Okay',profile:{...makeProfile(),preferences:{...makeProfile().preferences,avoid:['hello',1]}}}),/Invalid writing profile/);
    assert.throws(()=>db.saveStyle({name:'Okay',profile:makeProfile(),untrusted:'disallow'} as never),/Invalid writing profile/);
    const firstETag=db.checkStyleEdit(record.id,undefined);
    db.saveStyle({name:'Updated',profile:makeProfile()},record.id);
    assert.throws(()=>db.checkStyleEdit(record.id,'"bad"'),StyleConflictError);
    assert.equal(firstETag.name,'My style');
    const inspector=new DatabaseSync(env.path);
    const ciphertext=Buffer.from(inspector.prepare('SELECT payload FROM writing_styles WHERE id=?').get(record.id)!.payload as Uint8Array);
    ciphertext[ciphertext.length-1]=ciphertext[ciphertext.length-1]!^1;
    inspector.prepare('UPDATE writing_styles SET payload=? WHERE id=?').run(ciphertext,record.id);inspector.close();
    assert.throws(()=>db.getStyle(record.id),/authentication failed/);
  } finally {db.close();env.clean();}
});

test('encrypted v3 backup includes profiles; preview is read-only and old v2 imports are supported',()=>{
  const a=vault(),b=vault();const source=new EncryptedArchive(a.path,a.key);const dest=new EncryptedArchive(b.path,b.key);
  try{
    const saved=source.saveStyle({name:'Work',profile:makeProfile()});
    const snapshot=source.exportSnapshot();
    assert.equal(snapshot.version,3);assert.equal(snapshot.styles?.length,1);
    assert.equal(dest.previewSnapshot(snapshot).styles,1);assert.equal(dest.listStyles().length,0);
    dest.importSnapshot(snapshot);
    assert.equal(dest.getStyle(saved.id)?.profile.examples[0],EXAMPLE);
    assert.equal(dest.previewSnapshot(snapshot).styles,0);
    const legacy:ArchiveSnapshot={...snapshot,version:2};delete legacy.styles;
    assert.equal(dest.previewSnapshot(legacy).styles,0);
    const invalid=structuredClone(snapshot);invalid.styles![0]!.name='x'.repeat(81);
    assert.throws(()=>dest.importSnapshot(invalid),/Invalid backup writing profiles/);
    const smuggle:ArchiveSnapshot={...snapshot,version:2};
    assert.throws(()=>dest.importSnapshot(smuggle),/Invalid backup writing profiles/);
  }finally{source.close();dest.close();a.clean();b.clean();}
});

test('writing profile count cap is enforced',()=>{
  const env=vault();const db=new EncryptedArchive(env.path,env.key);
  try {
    for(let i=0;i<MAX_WRITING_STYLES;i++)db.saveStyle({name:'Profile '+i,profile:makeProfile()});
    assert.throws(()=>db.saveStyle({name:'Overflow',profile:makeProfile()}),/profile limit/);
  }finally{db.close();env.clean();}
});

test('writing studio API uses bearer auth, explicit analysis, excerpt opt-in and safe lifecycle', async()=>{
  const directory=mkdtempSync(join(tmpdir(),'promtesaver-style-http-'));
  const server=await startLocalWeb({directory});
  const call=async(path:string, method='GET', data?:unknown, bearer=server.token) => {
    const response=await fetch(server.origin+path,{method,headers:{Authorization:`Bearer ${bearer}`,...(data===undefined?{}:{'Content-Type':'application/json'})},
      ...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:response.status,headers:response.headers,data:await response.json()};
  };
  try{
    assert.equal((await call('/api/styles')).status,423);
    assert.equal((await call('/api/writing/check','POST',{text:'Test  sample'})).status,423);
    assert.equal((await call('/api/styles','GET',undefined,'wrong')).status,401);
    await call('/api/setup','POST',{passphrase:'Test-Vault-Password-123',confirm:'Test-Vault-Password-123'});
    const proofreading=await call('/api/writing/check','POST',{text:'A  sample message.'});
    assert.equal(proofreading.status,200);assert.equal(proofreading.data.issues[0].kind,'spacing');
    assert.equal((await call('/api/writing/check','POST',{text:'x'.repeat(12_001)})).status,400);
    assert.equal((await call('/api/writing/check','POST',{text:'📌'.repeat(6_000)})).status,200,'Unicode input within the character limit must not be rejected by UTF-8 framing');
    const analyzed=await call('/api/styles/analyze','POST',{samples:[EXAMPLE+'\npassword=SYNTHETIC_SUPER_SECRET_8675309'],preferences:{tone:'Warm'}});
    assert.equal(analyzed.status,200);assert.ok(analyzed.data.redactions>0);
    assert.equal((await call('/api/styles/analyze','POST',{samples:['✍️'.repeat(5_000)]})).status,200,'Multibyte samples within limits are valid');
    assert.equal(JSON.stringify(analyzed.data.profile).includes('SYNTHETIC_SUPER_SECRET_8675309'),false);
    const saved=await call('/api/styles','POST',{name:'My tone',profile:analyzed.data.profile});
    assert.equal(saved.status,201);const id=saved.data.style.id;
    const listing=await call('/api/styles');assert.equal(listing.data.profiles.length,1);
    assert.equal(JSON.stringify(listing.data).includes(EXAMPLE),false);
    const prepared=await call(`/api/styles/${id}/prompt`,'POST',{task:'Rewrite this status update: deployed today'});
    assert.equal(prepared.status,200);assert.equal(prepared.data.includesExamples,false);
    assert.equal(prepared.data.prompt.includes('deployed today'),true);
    assert.equal(prepared.data.prompt.includes(EXAMPLE),false);
    assert.equal(prepared.data.prompt.includes('Recurring expressions (optional, avoid forced repetition): none.'),true, 'recurring phrases must also require export consent');
    const consent=await call(`/api/styles/${id}/prompt`,'POST',{task:'Rewrite release notes',includeExamples:true});
    assert.equal(consent.data.prompt.includes('I\'m building'),true);
    assert.equal((await call(`/api/styles/${id}`,'PUT',{name:'Work',profile:makeProfile()})).status,428);
    const stale=await call(`/api/styles/${id}`,'PUT',{name:'Work',profile:makeProfile()},server.token);
    assert.equal(stale.status,428);
    const response=await fetch(`${server.origin}/api/styles/${id}`,{method:'PUT',headers:{Authorization:`Bearer ${server.token}`,'Content-Type':'application/json','If-Match':saved.data.etag},body:JSON.stringify({name:'Work',profile:makeProfile()})});
    assert.equal(response.status,200);
    const old=await fetch(`${server.origin}/api/styles/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${server.token}`,'If-Match':saved.data.etag}});
    assert.equal(old.status,412);
    await call('/api/lock','POST');
    assert.equal((await call('/api/styles')).status,423);
    assert.equal((await call('/api/writing/check','POST',{text:'Test  sample'})).status,423);
    assert.equal((await call('/api/styles/analyze','POST',{samples:[EXAMPLE]})).status,423);
  }finally{await server.close();rmSync(directory,{recursive:true,force:true});}
});
