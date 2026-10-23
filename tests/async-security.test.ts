import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, scryptSync } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { LocalVault } from '../apps/local-web/vault.ts';
import { WorkGate, OperationBusyError, OperationCancelledError } from '../apps/local-web/work-gate.ts';
import { wrapKey, unwrapKey, wrapKeyAsync, unwrapKeyAsync, writeKeyMetadata, readKeyMetadata } from '../apps/local-web/key-envelope.ts';
import { encryptBackup, decryptBackup, encryptBackupAsync, decryptBackupAsync } from '../apps/local-web/backup.ts';
import { EncryptedArchive, type ArchiveSnapshot } from '../packages/local-store/archive.ts';
import { startLocalWeb } from '../apps/local-web/server.ts';

const password = 'SyntheticAsyncPassword-001';
const replacement = 'SyntheticReplacementPassword-002';
const dir = () => mkdtempSync(join(tmpdir(), 'pomte-async-security-'));
function fixtureSnapshot(): ArchiveSnapshot {
  const archive = new EncryptedArchive(':memory:', randomBytes(32));
  try { archive.saveLibrary({ title: 'Async snapshot', body: 'Synthetic example text' }); return archive.exportSnapshot(); }
  finally { archive.close(); }
}

test('work lane rejects simultaneous work, keeps cancellation bounded, and becomes reusable', async () => {
  const gate = new WorkGate(); let resolve!: () => void;
  const pending = gate.run('setup', async () => new Promise<void>(done => { resolve = done; }));
  const cancelled = assert.rejects(pending, OperationCancelledError);
  assert.equal(gate.operation, 'setup');
  await assert.rejects(gate.run('unlock', async () => {}), OperationBusyError);
  gate.cancel(); // Does not release native memory by starting a second job early.
  await assert.rejects(gate.run('backup-export', async () => {}), OperationBusyError);
  resolve(); await cancelled; await gate.whenIdle();
  assert.equal(gate.operation, null);
  assert.equal(await gate.run('unlock', async () => 42), 42);
});

test('async wrappers are byte-format compatible with synchronous v2 encryption', async () => {
  const key = randomBytes(32);
  try {
    const sync = wrapKey(password, key);
    const recovered = await unwrapKeyAsync(password, sync);
    assert.deepEqual(recovered, key); recovered.fill(0);
    const asyncMeta = await wrapKeyAsync(password, key);
    const fromSync = unwrapKey(password, asyncMeta);
    assert.deepEqual(fromSync, key); fromSync.fill(0);
    await assert.rejects(unwrapKeyAsync(replacement, asyncMeta));
  } finally { key.fill(0); }
});

test('async derivation yields to the event loop instead of blocking timers', async () => {
  const key = randomBytes(32); let ticked = false;
  const tick = setTimeout(() => { ticked = true; }, 0);
  try { await wrapKeyAsync(password, key); assert.equal(ticked, true); }
  finally { clearTimeout(tick); key.fill(0); }
});

test('locking a pending setup cancels it before writing a database or key file', async () => {
  const directory = dir(); const vault = new LocalVault(directory);
  try {
    const pending = vault.setupAsync(password);
    vault.lock();
    await assert.rejects(pending, OperationCancelledError);
    assert.equal(vault.status().unlocked, false);
    assert.equal(existsSync(join(directory, 'keyinfo.json')), false);
    assert.equal(existsSync(join(directory, 'vault.sqlite')), false);
    await vault.setupAsync(password);
    assert.equal(vault.status().unlocked, true);
  } finally { vault.lock(); rmSync(directory, { recursive: true, force: true }); }
});

test('async setup rejects simultaneous sync/async setup and preserves metadata after write failure', async () => {
  const directory = dir(); let fail = true;
  const vault = new LocalVault(directory, { metadataWriter: (path, metadata) => {
    if (fail) throw new Error('Synthetic disk failure'); writeKeyMetadata(path, metadata);
  } });
  try {
    const pending = vault.setupAsync(password);
    assert.throws(() => vault.setup(password), OperationBusyError);
    await assert.rejects(vault.setupAsync(password), OperationBusyError);
    await assert.rejects(pending, /disk failure/);
    assert.equal(existsSync(join(directory, 'vault.sqlite')), false);
    fail = false; await vault.setupAsync(password);
    assert.equal(vault.status().keyFormat, 2);
  } finally { vault.lock(); rmSync(directory, { recursive: true, force: true }); }
});

test('lock wins over pending unlock; wrong password and retry still work', async () => {
  const directory = dir(); const vault = new LocalVault(directory);
  try {
    await vault.setupAsync(password); vault.lock();
    const pending = vault.unlockAsync(password); vault.lock();
    await assert.rejects(pending, OperationCancelledError);
    assert.equal(vault.status().unlocked, false);
    await assert.rejects(vault.unlockAsync(replacement), /Could not unlock/);
    await vault.unlockAsync(password);
    assert.equal(vault.status().unlocked, true);
  } finally { vault.lock(); rmSync(directory, { recursive: true, force: true }); }
});

test('lock and AbortSignal cannot commit a pending passphrase replacement', async () => {
  const directory = dir(); const vault = new LocalVault(directory);
  try {
    await vault.setupAsync(password);
    const before = readFileSync(join(directory, 'keyinfo.json'));
    const abort = new AbortController();
    const pending = vault.changePassphraseAsync(password, replacement, abort.signal);
    abort.abort(); vault.lock();
    await assert.rejects(pending, OperationCancelledError);
    assert.deepEqual(readFileSync(join(directory, 'keyinfo.json')), before);
    await vault.unlockAsync(password);
    await vault.changePassphraseAsync(password, replacement);
    vault.lock();
    await assert.rejects(vault.unlockAsync(password), /Could not unlock/);
    await vault.unlockAsync(replacement);
  } finally { vault.lock(); rmSync(directory, { recursive: true, force: true }); }
});

test('async legacy migration authenticates before replacing metadata, preserving records', async () => {
  const directory = dir(); const salt = randomBytes(32);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  const archive = new EncryptedArchive(join(directory, 'vault.sqlite'), key);
  const item = archive.saveLibrary({ title: 'Legacy', body: 'Synthetic legacy content' }).item;
  archive.close(); key.fill(0);
  writeFileSync(join(directory, 'keyinfo.json'), JSON.stringify({ version: 1, kdf: 'scrypt', salt: salt.toString('base64') }));
  const vault = new LocalVault(directory);
  try {
    await assert.rejects(vault.unlockAsync(replacement), /Could not unlock/);
    assert.equal(readKeyMetadata(join(directory, 'keyinfo.json')).version, 1);
    await vault.unlockAsync(password);
    assert.equal(readKeyMetadata(join(directory, 'keyinfo.json')).version, 2);
    assert.equal(vault.archive.getLibrary(item.id)?.body, item.body);
  } finally { vault.lock(); salt.fill(0); rmSync(directory, { recursive: true, force: true }); }
});

test('async backup is interoperable, rejects tampering, and never gathers data after cancellation', async () => {
  const snapshot = fixtureSnapshot();
  const bytes = await encryptBackupAsync(() => snapshot, password);
  assert.deepEqual(decryptBackup(bytes, password), snapshot);
  assert.deepEqual(await decryptBackupAsync(encryptBackup(snapshot, password), password), snapshot);
  await assert.rejects(decryptBackupAsync(bytes, replacement), /incorrect|damaged/);
  const corrupt = Buffer.from(bytes); corrupt[corrupt.length - 1]! ^= 1;
  await assert.rejects(decryptBackupAsync(corrupt, password), /incorrect|damaged/);
  const abort = new AbortController(); let gathered = false;
  const pending = encryptBackupAsync(() => { gathered = true; return snapshot; }, password, abort.signal);
  abort.abort(); await assert.rejects(pending, OperationCancelledError);
  assert.equal(gathered, false);
});

function client(app: Awaited<ReturnType<typeof startLocalWeb>>) {
  return async (path: string, method = 'GET', payload?: unknown) => {
    const res = await fetch(app.origin + path, { method, headers: { Authorization: `Bearer ${app.token}`,
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    return { status: res.status, data: await res.json(), retry: res.headers.get('retry-after') };
  };
}

test('real HTTP remains responsive during KDF, rejects overlapping jobs, and lock cancels setup', async () => {
  const directory = dir(); const app = await startLocalWeb({ directory }); const send = client(app);
  try {
    const setup = send('/api/setup', 'POST', { passphrase: password, confirm: password });
    let busy = false;
    for (let i = 0; i < 60; i++) {
      const status = await send('/api/status');
      if (status.data.operation === 'setup') { busy = true; break; }
      await delay(2);
    }
    assert.equal(busy, true, 'status must be served while the KDF is pending');
    const overlap = await send('/api/unlock', 'POST', { passphrase: password });
    assert.equal(overlap.status, 503); assert.equal(overlap.data.code, 'SECURE_OPERATION_BUSY');
    assert.equal(overlap.retry, '1');
    assert.equal((await send('/api/lock', 'POST')).status, 200);
    assert.equal((await setup).status, 423);
    const status = await send('/api/status');
    assert.equal(status.data.unlocked, false); assert.equal(status.data.initialized, false);
    assert.equal((await send('/api/setup', 'POST', { passphrase: password, confirm: password })).status, 201);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('slow HTTP writes cannot cross a lock/unlock boundary and modify the new session', async () => {
  const directory = dir(); const app = await startLocalWeb({ directory }); const send = client(app);
  try {
    await send('/api/setup', 'POST', { passphrase: password, confirm: password });
    let started!: () => void; const begin = new Promise<void>(resolve => { started = resolve; });
    let end!: () => void;
    const response = new Promise<{ status: number; data: { code?: string } }>((resolve, reject) => {
      const req = httpRequest(app.origin + '/api/items', { method: 'POST', headers: {
        Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked'
      } }, res => {
        let body = ''; res.on('data', chunk => { body += String(chunk); });
        res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.write('{"title":"Stale request",', () => { started(); });
      end = () => req.end('"body":"Must not be saved"}');
    });
    await begin; await delay(15); // Let the handler enter readBody before revoking its epoch.
    await send('/api/lock', 'POST');
    await send('/api/unlock', 'POST', { passphrase: password });
    end(); const result = await response;
    assert.equal(result.status, 423); assert.equal(result.data.code, 'SESSION_CHANGED');
    assert.equal((await send('/api/items')).data.total, 0);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('closing during setup waits for derivation disposal and never creates or unlocks a vault', async () => {
  const directory = dir(); const app = await startLocalWeb({ directory }); const send = client(app);
  try {
    const setup = send('/api/setup', 'POST', { passphrase: password, confirm: password });
    for (let i = 0; i < 60; i++) { if ((await send('/api/status')).data.operation) break; await delay(2); }
    await app.close();
    assert.equal((await setup).status, 423);
    assert.equal(app.vault.status().unlocked, false);
    assert.equal(existsSync(join(directory, 'keyinfo.json')), false);
    assert.equal(existsSync(join(directory, '.vault-session.lock')), false);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('async passphrase write failure preserves the old wrapper and keeps a usable vault', async () => {
  const directory=dir();let fail=false;
  const vault=new LocalVault(directory,{metadataWriter:(path,value)=>{if(fail)throw new Error('Synthetic metadata write failure');writeKeyMetadata(path,value);}});
  try {
    await vault.setupAsync(password);const before=readFileSync(join(directory,'keyinfo.json'));
    fail=true;await assert.rejects(vault.changePassphraseAsync(password,replacement),/write failure/);
    assert.deepEqual(readFileSync(join(directory,'keyinfo.json')),before);
    assert.equal(vault.status().unlocked,true);vault.lock();
    await vault.unlockAsync(password);assert.equal(vault.status().unlocked,true);
  }finally{vault.lock();rmSync(directory,{recursive:true,force:true});}
});

test('failed async legacy metadata upgrade leaves the original key file and no open archive', async()=>{
  const directory=dir(),salt=randomBytes(32),key=scryptSync(password,salt,32,{N:16384,r:8,p:1});
  const archive=new EncryptedArchive(join(directory,'vault.sqlite'),key);
  archive.saveLibrary({title:'Migration recovery',body:'Synthetic migration sample'});archive.close();key.fill(0);
  writeFileSync(join(directory,'keyinfo.json'),JSON.stringify({version:1,kdf:'scrypt',salt:salt.toString('base64')}));
  let fail=true;const vault=new LocalVault(directory,{metadataWriter:(path,value)=>{if(fail)throw new Error('Synthetic migration write failure');writeKeyMetadata(path,value);}});
  try{
    const before=readFileSync(join(directory,'keyinfo.json'));
    await assert.rejects(vault.unlockAsync(password),/migration write/);
    assert.equal(vault.status().unlocked,false);assert.deepEqual(readFileSync(join(directory,'keyinfo.json')),before);
    fail=false;await vault.unlockAsync(password);assert.equal(vault.status().keyFormat,2);
    assert.equal(vault.archive.queryLibrary({limit:10}).items.length,1);
  }finally{vault.lock();salt.fill(0);rmSync(directory,{recursive:true,force:true});}
});

test('locking a real HTTP backup import cancels it without adding data after re-unlock',async()=>{
  const bytes=encryptBackup(fixtureSnapshot(),password).toString('base64');
  const directory=dir(),app=await startLocalWeb({directory}),send=client(app);
  try{
    await send('/api/setup','POST',{passphrase:password,confirm:password});
    const importing=send('/api/backup/import','POST',{backup:bytes,passphrase:password});
    let pending=false;
    for(let i=0;i<100;i++){if((await send('/api/status')).data.operation==='backup-import'){pending=true;break;}await delay(2);}
    assert.equal(pending,true);await send('/api/lock','POST');assert.equal((await importing).status,423);
    await send('/api/unlock','POST',{passphrase:password});
    assert.equal(app.vault.archive.queryLibrary({limit:10}).items.length,0);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
