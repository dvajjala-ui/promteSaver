import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startLocalWeb} from '../apps/local-web/server.ts';
const origin = `chrome-extension://${'abcdefghijklmnopabcdefghijklmnop'}`;

test('write-only browser helper: explicit pairing, one-use code, exclusions, revoke, lock and origin checks', async () => {
  const directory=mkdtempSync(join(tmpdir(),'promtesaver-bridge-test-'));
  const app=await startLocalWeb({directory});
  try {
    const call=async (path:string,method='GET',body?:unknown,token=app.token,sendOrigin=app.origin) => {
      const response=await fetch(app.origin+path,{method,
        headers:{Origin:sendOrigin,...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,headers:response.headers,body:response.status===204?{}:await response.json()};
    };
    await call('/api/setup','POST',{passphrase:'Long-Local-Vault-Password88',confirm:'Long-Local-Vault-Password88'});
    assert.equal((await call('/api/bridge/save','POST',{},'',origin)).status,401);
    assert.equal((await call('/api/facets','GET',undefined,app.token,origin)).status,403);
    const paired=await call('/api/bridge/start','POST',{});
    const code=paired.body.pairingCode;
    assert.match(code,/^psv2:\d+:[a-f0-9]{64}$/);
    const secret=code.split(':')[2];
    const options=await call('/api/bridge/save','OPTIONS',undefined,'',origin);
    assert.equal(options.status,204);
    assert.equal(options.headers.get('Access-Control-Allow-Origin'),origin);
    assert.equal((await call('/api/bridge/pair','POST',{code:'bad-secret'},'',origin)).status,401);
    assert.equal((await call('/api/bridge/pair','POST',{code:secret},'','https://attacker.test')).status,403);
    const exchange=await call('/api/bridge/pair','POST',{code:secret},'',origin);
    assert.equal(exchange.status,200);
    const writer=exchange.body.writeToken;
    assert.match(writer,/^[a-f0-9]{64}$/);
    assert.equal((await call('/api/bridge/pair','POST',{code:secret},'',origin)).status,401,'pairing code single-use');
    assert.equal((await call('/api/items','GET',undefined,writer,origin)).status,403,'write-only extension token cannot read');
    assert.equal((await call('/api/bridge/save','POST',{host:'evil.example',text:'unsafe',title:'no'},writer,origin)).status,400);
    assert.equal((await call('/api/bridge/save','POST',{host:'chatgpt.com',text:'',title:'no'},writer,origin)).status,400);
    assert.equal((await call('/api/bridge/save','POST',{host:'chatgpt.com',text:'safe mock prompt',title:'Help me write an email'},writer,origin)).status,201);
    const list=await call('/api/items');
    assert.equal(list.body.total,1);
    assert.equal(list.body.items[0].project,'Browser inbox');
    assert.equal(list.body.items[0].source,'chatgpt.com');
    assert.equal((await call('/api/bridge/status')).body.active,true);
    assert.equal((await call('/api/bridge/revoke','POST',{})).body.revoked,true);
    assert.equal((await call('/api/bridge/save','POST',{host:'chatgpt.com',text:'reuse',title:'no'},writer,origin)).status,401);
    const newCode=(await call('/api/bridge/start','POST',{})).body.pairingCode.split(':')[2];
    const newWriter=(await call('/api/bridge/pair','POST',{code:newCode},'',origin)).body.writeToken;
    assert.equal((await call('/api/lock','POST')).status,200);
    assert.equal((await call('/api/bridge/save','POST',{host:'chatgpt.com',text:'reuse',title:'no'},newWriter,origin)).status,423);
    await call('/api/unlock','POST',{passphrase:'Long-Local-Vault-Password88'});
    assert.equal((await call('/api/bridge/save','POST',{host:'chatgpt.com',text:'reuse',title:'no'},newWriter,origin)).status,401,'lock revokes helper token');
  } finally {await app.close();rmSync(directory,{recursive:true,force:true});}
});
