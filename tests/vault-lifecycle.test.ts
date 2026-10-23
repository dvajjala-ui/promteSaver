import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LocalVault } from '../apps/local-web/vault.ts';
import { readKeyMetadata, writeKeyMetadata } from '../apps/local-web/key-envelope.ts';
import { EncryptedArchive } from '../packages/local-store/archive.ts';

const password = 'OnlySyntheticVaultPassword01';
const replacement = 'DifferentSyntheticPassword02';
function directory() { return mkdtempSync(join(tmpdir(), 'pomte-v03-keys-')); }
function legacy(dir: string) {
  const salt = randomBytes(32); const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  const store = new EncryptedArchive(join(dir,'vault.sqlite'), key);
  const item = store.saveLibrary({ title:'Legacy canary title', body:'Legacy canary body' }).item;
  store.close(); key.fill(0);
  writeFileSync(join(dir,'keyinfo.json'), JSON.stringify({ version:1, kdf:'scrypt', salt:salt.toString('base64') }));
  salt.fill(0); return item.id;
}

test('v2 setup stores a wrapped random key, not the passphrase, and reopens after lock', () => {
  const dir=directory(); const vault=new LocalVault(dir);
  try {
    vault.setup(password); const meta=readKeyMetadata(join(dir,'keyinfo.json'));
    assert.equal(meta.version,2); assert.equal(vault.status().keyFormat,2);
    const item=vault.archive.saveLibrary({title:'Envelope test',body:'Only synthetic text'}).item;
    assert.ok(!readFileSync(join(dir,'keyinfo.json'),'utf8').includes(password));
    vault.lock(); assert.throws(()=>vault.archive,/locked/);
    vault.unlock(password); assert.equal(vault.archive.getLibrary(item.id)?.body,'Only synthetic text');
  } finally {vault.lock();rmSync(dir,{recursive:true,force:true});}
});

test('passphrase change preserves ciphertext/history/settings; old password no longer opens active envelope', () => {
  const dir=directory(); const vault=new LocalVault(dir);
  try {
    vault.setup(password);
    const item=vault.archive.saveLibrary({title:'Before',body:'Revision one'}).item;
    vault.archive.saveLibrary({title:'After',body:'Revision two'},item.id);
    vault.archive.setPreferences({idleMinutes:4,lowMemory:true,compactMode:true,lockOnHide:false});
    const db=new DatabaseSync(join(dir,'vault.sqlite'));
    const before=db.prepare('SELECT payload FROM library WHERE id=?').get(item.id)!.payload;
    vault.changePassphrase(password,replacement);
    assert.deepEqual(db.prepare('SELECT payload FROM library WHERE id=?').get(item.id)!.payload,before);
    db.close();vault.lock();
    assert.throws(()=>vault.unlock(password),/Could not unlock/);
    vault.unlock(replacement);
    assert.equal(vault.archive.getLibrary(item.id)?.body,'Revision two');
    assert.equal(vault.archive.libraryHistory(item.id).length,1);
    assert.equal(vault.archive.preferences().idleMinutes,4);
  } finally {vault.lock();rmSync(dir,{recursive:true,force:true});}
});

test('wrong current password cannot replace key metadata', () => {
  const dir=directory(); const vault=new LocalVault(dir);
  try {
    vault.setup(password);const original=readFileSync(join(dir,'keyinfo.json'));
    assert.throws(()=>vault.changePassphrase('IncorrectLongPassword',replacement),/Could not unlock/);
    assert.deepEqual(readFileSync(join(dir,'keyinfo.json')),original);
    assert.throws(()=>vault.changePassphrase(password,password),/different/);
  } finally {vault.lock();rmSync(dir,{recursive:true,force:true});}
});

test('legacy v1 upgrade re-wraps only after authenticating and retains record ciphertext', () => {
  const dir=directory();const id=legacy(dir);const vault=new LocalVault(dir);
  try {
    const db=new DatabaseSync(join(dir,'vault.sqlite'));
    const bytes=db.prepare('SELECT payload FROM library WHERE id=?').get(id)!.payload;
    assert.throws(()=>vault.unlock('NotTheOriginalPassword'),/Could not unlock/);
    assert.equal(readKeyMetadata(join(dir,'keyinfo.json')).version,1);
    vault.unlock(password);
    assert.equal(readKeyMetadata(join(dir,'keyinfo.json')).version,2);
    assert.deepEqual(db.prepare('SELECT payload FROM library WHERE id=?').get(id)!.payload,bytes);
    db.close();assert.equal(vault.archive.getLibrary(id)?.body,'Legacy canary body');
  } finally {vault.lock();rmSync(dir,{recursive:true,force:true});}
});

test('failed legacy metadata migration leaves original envelope usable', () => {
  const dir=directory();legacy(dir);const before=readFileSync(join(dir,'keyinfo.json'));
  const failing=new LocalVault(dir,{metadataWriter:()=>{throw new Error('Simulated disk full');}});
  const recovery=new LocalVault(dir);
  try {
    assert.throws(()=>failing.unlock(password),/disk full/);assert.equal(failing.status().unlocked,false);
    assert.deepEqual(readFileSync(join(dir,'keyinfo.json')),before);
    recovery.unlock(password);assert.equal(recovery.archive.libraryStats().all,1);
  } finally {failing.lock();recovery.lock();rmSync(dir,{recursive:true,force:true});}
});

test('failed passphrase metadata write preserves the current credential', () => {
  const dir=directory();let fail=false;
  const vault=new LocalVault(dir,{metadataWriter:(path,meta)=>{if(fail)throw new Error('Simulated rename failure');writeKeyMetadata(path,meta);}});
  try {
    vault.setup(password);const before=readFileSync(join(dir,'keyinfo.json'));fail=true;
    assert.throws(()=>vault.changePassphrase(password,replacement),/rename failure/);
    assert.deepEqual(readFileSync(join(dir,'keyinfo.json')),before);
    vault.lock();fail=false;vault.unlock(password);assert.equal(vault.status().unlocked,true);
  } finally {vault.lock();rmSync(dir,{recursive:true,force:true});}
});

test('failed fresh setup cleans its uncommitted empty DB and supports retry', () => {
  const dir=directory();const failing=new LocalVault(dir,{metadataWriter:()=>{throw new Error('Simulated no space');}});
  const recovery=new LocalVault(dir);
  try {
    assert.throws(()=>failing.setup(password),/no space/);
    assert.equal(existsSync(join(dir,'vault.sqlite')),false);
    recovery.setup(password);assert.equal(recovery.status().unlocked,true);
  } finally {failing.lock();recovery.lock();rmSync(dir,{recursive:true,force:true});}
});

test('missing database fails closed instead of creating an empty vault during unlock', () => {
  const dir=directory();const vault=new LocalVault(dir);
  try {
    vault.setup(password);vault.lock();unlinkSync(join(dir,'vault.sqlite'));
    assert.throws(()=>vault.unlock(password),/database is missing/);
    assert.equal(existsSync(join(dir,'vault.sqlite')),false);
  } finally {vault.lock();rmSync(dir,{recursive:true,force:true});}
});

test('untrusted KDF profiles and oversized metadata are rejected before key derivation', () => {
  const dir=directory();const vault=new LocalVault(dir);
  try {
    vault.setup(password);vault.lock();const path=join(dir,'keyinfo.json');
    const metadata=JSON.parse(readFileSync(path,'utf8'));metadata.params.N=2**30;
    writeFileSync(path,JSON.stringify(metadata));assert.throws(()=>vault.unlock(password),/Unsupported vault format/);
    writeFileSync(path,' '.repeat(5000));assert.throws(()=>vault.unlock(password),/Unsupported vault format/);
  } finally {vault.lock();rmSync(dir,{recursive:true,force:true});}
});
