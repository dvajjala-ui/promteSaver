import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnosticSnapshot } from '../apps/local-web/diagnostics.ts';
import { supportedNode } from '../packages/contracts/app-info.ts';
import { startLocalWeb } from '../apps/local-web/server.ts';

const password='SyntheticHealthPassword01';
test('runtime compatibility rejects other major versions and prereleases',()=>{
  assert.equal(supportedNode('24.16.0'),true);assert.equal(supportedNode('v24.22.1'),true);
  for(const version of ['22.16.0','24.15.0','25.0.0','24.16.0-rc.1','bad'])assert.equal(supportedNode(version),false);
});
test('diagnostics inspect file sizes, not file contents; support data is strictly allowlisted',()=>{
  const directory=mkdtempSync(join(tmpdir(),'promte-health-'));
  try{
    const canary='SYNTHETIC_PRIVATE_CANARY_NOT_FOR_SUPPORT';
    writeFileSync(join(directory,'vault.sqlite'),canary); // Deliberately not a database.
    const report=diagnosticSnapshot({directory,lowMemory:true,keyFormat:2,operation:null});
    const json=JSON.stringify(report);
    assert.ok(!json.includes(directory));assert.ok(!json.includes(canary));assert.ok(!json.includes(password));
    assert.equal(report.resources.profile,'low-memory');assert.ok(report.resources.serviceRssMiB>0);
    assert.equal(report.privacy.automaticCapture,false);assert.equal(report.storage.wholeDatabaseEncryption,false);
    assert.deepEqual(Object.keys(report),['schema','version','runtime','resources','storage','privacy','limitations']);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('real HTTP diagnostics require unlocked authentication and do not renew the idle deadline',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'promte-health-http-'));const app=await startLocalWeb({directory});
  const send=async(path:string,method='GET',payload?:unknown)=>{
    const res=await fetch(app.origin+path,{method,headers:{Authorization:`Bearer ${app.token}`,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:res.status,data:await res.json()};
  };
  try{
    assert.equal((await fetch(app.origin+'/api/diagnostics')).status,401);
    assert.equal((await send('/api/diagnostics')).status,423);
    await send('/api/setup','POST',{passphrase:password,confirm:password});
    const deadline=(await send('/api/status')).data.lockAt;
    const result=await send('/api/diagnostics');assert.equal(result.status,200);
    assert.equal((await send('/api/status')).data.lockAt,deadline);
    assert.ok(!JSON.stringify(result.data).includes(app.token));assert.ok(!JSON.stringify(result.data).includes(directory));
    await send('/api/lock','POST');assert.equal((await send('/api/diagnostics')).status,423);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
