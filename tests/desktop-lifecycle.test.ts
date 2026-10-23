import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { acquireVaultLease, recoverStaleVaultLease } from '../apps/local-web/process-lease.ts';
import { startLocalWeb } from '../apps/local-web/server.ts';

const entry=fileURLToPath(new URL('../apps/desktop/sidecar.ts',import.meta.url));
const password='SyntheticDesktopPassphrase03';
async function childFixture() {
  const directory=mkdtempSync(join(tmpdir(),'pomte-child-'));
  const env:NodeJS.ProcessEnv={...process.env,PROMTESAVER_DATA_DIR:directory};delete env.NODE_OPTIONS;
  const child=spawn(process.execPath,['--experimental-strip-types',entry,'--desktop-child'],{env,stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.on('data',c=>{stderr+=c;});
  const lines=createInterface({input:child.stdout});const iterator=lines[Symbol.asyncIterator]();
  const exited=once(child,'exit');
  const next=async()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try { const result=await Promise.race([iterator.next(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Desktop child timed out')),7000);})]);
      assert.equal(result.done,false);return JSON.parse(result.value!);
    } finally {clearTimeout(timer);}
  };
  const ready=await next();assert.equal(ready.type,'ready');const url=new URL(ready.url);const token=url.hash.slice(1);url.hash='';
  const request=async(path:string,method='GET',payload?:unknown)=>{
    const response=await fetch(new URL(path,url),{method,headers:{Authorization:`Bearer ${token}`,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    return {status:response.status,data:await response.json()};
  };
  return {directory,child,exited,next,request,getStderr:()=>stderr,async close(){if(child.exitCode===null){child.stdin.end();await exited;}lines.close();rmSync(directory,{recursive:true,force:true});}};
}

test('desktop child handshake is private, restricted IPC locks, shutdown releases the vault', {timeout:15000}, async()=>{
  const f=await childFixture();try{
    assert.equal((await f.request('/api/setup','POST',{passphrase:password,confirm:password})).status,201);
    f.child.stdin.write('{"type":"ping"}\n');assert.deepEqual(await f.next(),{type:'pong'});
    f.child.stdin.write('{"type":"lock"}\n');assert.deepEqual(await f.next(),{type:'locked'});
    assert.equal((await f.request('/api/status')).data.unlocked,false);
    f.child.stdin.write('{"type":"exec","command":"echo not-allowed"}\n');assert.deepEqual(await f.next(),{type:'error',code:'INVALID_COMMAND'});
    f.child.stdin.write('{"type":"shutdown"}\n');assert.equal((await f.exited)[0],0);
    assert.equal(existsSync(join(f.directory,'.vault-session.lock')),false);
    assert.ok(!f.getStderr().includes(password));
  }finally{await f.close();}
});

test('parent pipe EOF terminates service; vault can reopen and preserve data', {timeout:15000},async()=>{
  const f=await childFixture();try{
    await f.request('/api/setup','POST',{passphrase:password,confirm:password});
    await f.request('/api/items','POST',{title:'Lifecycle canary',body:'Synthetic safe shutdown content'});
    f.child.stdin.end();assert.equal((await f.exited)[0],0);
    const next=await startLocalWeb({directory:f.directory});try{
      const headers={Authorization:`Bearer ${next.token}`,'Content-Type':'application/json'};
      assert.equal((await fetch(next.origin+'/api/unlock',{method:'POST',headers,body:JSON.stringify({passphrase:password})})).status,200);
      const items=await(await fetch(next.origin+'/api/items',{headers})).json();assert.equal(items.items[0].title,'Lifecycle canary');
    }finally{await next.close();}
  }finally{await f.close();}
});

test('oversized parent protocol fails closed and releases the lease',{timeout:15000},async()=>{
  const f=await childFixture();try{
    f.child.stdin.write('x'.repeat(5000));assert.deepEqual(await f.next(),{type:'error',code:'PROTOCOL_LIMIT'});
    assert.equal((await f.exited)[0],1);assert.equal(existsSync(join(f.directory,'.vault-session.lock')),false);
  }finally{await f.close();}
});

test('exclusive service lease rejects a second instance and explicit recovery refuses live owners',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'pomte-lease-'));const a=await startLocalWeb({directory});
  try{
    await assert.rejects(startLocalWeb({directory}),/service lease/);
    assert.throws(()=>recoverStaleVaultLease(directory),/still running/);
    await a.close();const b=await startLocalWeb({directory});await b.close();
  }finally{await a.close();rmSync(directory,{recursive:true,force:true});}
});

test('lease release is idempotent and does not remove a replaced ownership record',()=>{
  const directory=mkdtempSync(join(tmpdir(),'pomte-lease-'));try{
    const release=acquireVaultLease(directory);const path=join(directory,'.vault-session.lock');
    writeFileSync(path,'{"pid":1,"nonce":"different-owner"}');release();release();
    assert.match(readFileSync(path,'utf8'),/different-owner/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('failed port binding releases the attempted directory lease',async()=>{
  const one=mkdtempSync(join(tmpdir(),'pomte-port-')),two=mkdtempSync(join(tmpdir(),'pomte-port-'));
  const a=await startLocalWeb({directory:one});try{
    await assert.rejects(startLocalWeb({directory:two,port:Number(new URL(a.origin).port)}));
    assert.equal(existsSync(join(two,'.vault-session.lock')),false);
    const b=await startLocalWeb({directory:two});await b.close();
  }finally{await a.close();rmSync(one,{recursive:true,force:true});rmSync(two,{recursive:true,force:true});}
});

test('explicit stale-lease recovery succeeds only after the recorded child has exited',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'pomte-stale-'));
  try {
    const child=spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'});const pid=child.pid!;await once(child,'exit');
    const path=join(directory,'.vault-session.lock');writeFileSync(path,JSON.stringify({version:1,pid,nonce:'synthetic-stale-owner'}));
    recoverStaleVaultLease(directory);assert.equal(existsSync(path),false);
    const release=acquireVaultLease(directory);release();assert.equal(existsSync(path),false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
