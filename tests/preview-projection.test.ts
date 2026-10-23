import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalWeb } from '../apps/local-web/server.ts';

test('preview API bounds long bodies and metadata; full fetch and ETag preserve edits',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'promtesaver-preview-'));
  const server=await startLocalWeb({directory});
  try {
    const request=async(path:string,method='GET',payload?:unknown,etag?:string)=>{
      const response=await fetch(server.origin+path,{method,headers:{Authorization:'Bearer '+server.token,Origin:server.origin,
        ...(payload===undefined?{}:{'Content-Type':'application/json'}),...(etag?{'If-Match':etag}:{})},
        ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
      return {status:response.status,value:await response.json()};
    };
    const passphrase='synthetic-long-body-security-test';
    assert.equal((await request('/api/setup','POST',{passphrase,confirm:passphrase})).status,201);
    const body='A'.repeat(90000)+'{{final_variable}}';const notes='N'.repeat(1500);
    const saved=await request('/api/items','POST',{title:'Long prompt',body,notes,project:'Stress',kind:'template',tags:['long']});
    assert.equal(saved.status,201);
    const id=saved.value.item.id as string;
    let list=await request('/api/items?view=preview');
    assert.equal(list.status,200);assert.equal(list.value.items[0].body.length,1600);
    assert.equal(list.value.items[0].notes.length,240);
    assert.equal(list.value.items[0].preview,true);
    const etag=list.value.items[0].etag as string;
    assert.equal(etag,saved.value.item.etag);
    const full=(await request(`/api/items/${id}`)).value.item;
    assert.equal(full.body,body);assert.equal(full.notes,notes);
    assert.equal((await request(`/api/items/${id}`,'PUT',{title:full.title,body:full.body,kind:full.kind,
      project:full.project,tags:full.tags,pinned:true,notes:full.notes,source:full.source},etag)).status,200);
    assert.equal((await request(`/api/items/${id}`)).value.item.body,body);
    assert.equal((await request('/api/items?view=garbage')).status,400);
    assert.equal((await request('/api/preferences','PUT',{idleMinutes:15,lowMemory:true,compactMode:true,lockOnHide:false})).status,200);
    list=await request('/api/items?view=preview');assert.equal(list.value.items[0].body.length,420);
    assert.equal((await request('/api/items')).value.items[0].body,body, 'Older full-response clients remain compatible');
  }finally{await server.close();rmSync(directory,{recursive:true,force:true});}
});
