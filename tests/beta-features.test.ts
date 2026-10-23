import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
import { encryptBackup, decryptBackup } from '../apps/local-web/backup.ts';
import { startLocalWeb } from '../apps/local-web/server.ts';
import { record, temporaryArchive } from './helpers.ts';

const passphrase = 'ExampleBackupPassphraseForTests88';

test('v0.1 library migration: legacy table without deleted_at opens without destroying items', () => {
  const temp = temporaryArchive();
  try {
    let archive = new EncryptedArchive(temp.path,temp.key);
    const original = archive.saveLibrary({ title:'Legacy prompt', body:'safe synthetic text',tags:['legacy'] }).item;
    archive.close();
    const db = new DatabaseSync(temp.path);
    db.exec('DROP INDEX IF EXISTS library_visible; ALTER TABLE library DROP COLUMN deleted_at;');
    db.close();
    archive = new EncryptedArchive(temp.path,temp.key);
    try {
      assert.equal(archive.getLibrary(original.id)?.body, 'safe synthetic text');
      assert.equal(archive.trashCount(),0);
      assert.equal(archive.queryLibrary({query:'legacy'}).total,1);
    } finally {archive.close();}
  } finally {temp.cleanup();}
});

test('library: project facets, AND search, relevance, usage sorting, paging, trash and restore', () => {
  const temp = temporaryArchive();const archive = new EncryptedArchive(temp.path,temp.key);
  try {
    const a = archive.saveLibrary({title:'Kubernetes incident',body:'Investigate cache latency',tags:['infra','debugging'],project:'Work',notes:'For on-call',source:'Claude'}).item;
    const b = archive.saveLibrary({title:'Write email',body:'Email about cache tuning',project:'Home',tags:['communication']}).item;
    archive.saveLibrary({title:'Kubernetes notes',body:'General troubleshooting',project:'Work',tags:['infra']});
    assert.equal(archive.queryLibrary({query:'kubernetes cache'}).total,1);
    assert.equal(archive.queryLibrary({query:'CACHE',filter:'prompts',tag:'debugging'}).items[0]?.id,a.id);
    assert.equal(archive.queryLibrary({query:'cache',project:'home'}).items[0]?.id,b.id);
    assert.deepEqual(archive.libraryFacets().projects.map(p=>p.name),['Work','Home']);
    assert.deepEqual(archive.queryLibrary({limit:1,offset:1}).items.length,1);
    assert.equal(archive.queryLibrary({limit:1,offset:1}).total,3);
    assert.equal(archive.getLibrary(a.id)?.useCount,0);
    archive.recordUse(b.id); archive.recordUse(b.id);
    assert.equal(archive.queryLibrary({sort:'popular'}).items[0]?.id,b.id);
    assert.equal(archive.queryLibrary({filter:'recent'}).items.length,1);
    assert.equal(archive.getLibrary(b.id)?.revision,1,'reuse does not create a new version');
    assert.equal(archive.deleteLibrary(a.id),true);
    assert.equal(archive.deleteLibrary(a.id),false);
    assert.equal(archive.queryLibrary({query:'kubernetes cache'}).total,0);
    assert.equal(archive.queryLibrary({filter:'trash'}).total,1);
    assert.equal(archive.libraryStats().all,2);
    archive.undeleteLibrary(a.id);
    assert.equal(archive.queryLibrary({filter:'trash'}).total,0);
    archive.deleteLibrary(a.id); archive.purgeLibrary(a.id);
    assert.equal(archive.getLibrary(a.id),undefined);
    assert.throws(() => archive.purgeLibrary(b.id),/not in trash/);
  } finally {archive.close();temp.cleanup();}
});

test('encrypted portable backup round-trips full history, encrypted text and captured records', () => {
  const a = temporaryArchive();const b = temporaryArchive();
  const source = new EncryptedArchive(a.path,a.key);const restored = new EncryptedArchive(b.path,b.key);
  try {
    source.put(record('rec-321', 'Unique synthetic source record'));
    const item = source.saveLibrary({title:'Backup TITLE canary',body:'Version one unique canary',notes:'Why this worked',source:'Claude'}).item;
    source.saveLibrary({title:item.title,body:'Version two unique canary',notes:'Why this worked',source:'Claude'},item.id);
    const trashed = source.saveLibrary({title:'Trashed content',body:'Synthetic trash saved too'}).item;
    source.deleteLibrary(trashed.id);
    const snapshot = source.exportSnapshot();
    assert.equal(snapshot.histories.find(h=>h.id===item.id)?.revisions.length,1);
    const file = encryptBackup(snapshot,passphrase);
    assert.equal(file.includes(Buffer.from('Version two unique')),false,'backup never stores plaintext records');
    assert.equal(file.includes(Buffer.from('Unique synthetic source')),false);
    const decrypted = decryptBackup(file,passphrase);
    assert.equal(decrypted.items.length,2);
    assert.equal(decrypted.captures.length,1);
    const merged = restored.importSnapshot(decrypted);
    assert.deepEqual(merged,{imported:2,skipped:0,captures:1});
    assert.equal(restored.getLibrary(item.id)?.body,'Version two unique canary');
    assert.equal(restored.getLibrary(item.id)?.notes,'Why this worked');
    assert.equal(restored.libraryHistory(item.id).length,1);
    assert.equal(restored.queryLibrary({filter:'trash'}).total,1);
    assert.equal(restored.get('rec-321')?.text,'Unique synthetic source record');
    assert.deepEqual(restored.importSnapshot(decrypted),{imported:0,skipped:2,captures:0});
    const modified = Buffer.from(file);modified[modified.length-1] = modified.at(-1)! ^ 0x01;
    assert.throws(() => decryptBackup(modified,passphrase),/incorrect or file is damaged/);
    assert.throws(() => decryptBackup(file,'wronglongpassphrase-123'),/incorrect or file is damaged/);
    const malicious = structuredClone(decrypted);malicious.items[0]!.body='';
    assert.throws(() => restored.importSnapshot(malicious),/Invalid backup contents/);
    assert.equal(restored.libraryStats().all,1,'invalid imports are rejected without changing library');
    for (const filename of readdirSync(b.directory)) {
      const bytes=readFileSync(join(b.directory,filename));
      assert.equal(bytes.includes(Buffer.from('Version two unique canary')),false,`plaintext found in ${filename}`);
    }
  } finally {source.close();restored.close();a.cleanup();b.cleanup();}
});

test('local API: facets/search/paging/trash/use/duplicate, backup export-import and authorization', async () => {
  const directory = mkdtempSync(join(tmpdir(),'promtesaver-v02-api-'));
  const service = await startLocalWeb({directory});
  try {
    const headers = {Authorization:`Bearer ${service.token}`,Origin:service.origin};
    const request = async (path:string,method='GET',payload?:unknown) => {
      const r = await fetch(service.origin+path,{method,headers:{...headers,...(payload===undefined?{}:{'Content-Type':'application/json'})},
        ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
      return {status:r.status,body:await r.json()};
    };
    await request('/api/setup','POST',{passphrase:'ExamplePassphraseForApi012',confirm:'ExamplePassphraseForApi012'});
    const first = await request('/api/items','POST',{title:'Review incident',body:'Investigate synthetic outage',project:'Infra',tags:['oncall'],source:'Cursor',notes:'Use with logs'});
    assert.equal(first.status,201);
    const id=first.body.item.id;
    assert.equal((await request('/api/facets')).body.projects[0].name,'Infra');
    assert.equal((await request('/api/items?q=incident&limit=1&offset=0')).body.total,1);
    assert.equal((await request('/api/items?limit=-2')).status,400);
    assert.equal((await request('/api/items?filter=unsafe')).status,400);
    assert.equal((await request(`/api/items/${id}/use`,'POST',{})).body.item.useCount,1);
    const dup = await request(`/api/items/${id}/duplicate`,'POST',{});
    assert.equal(dup.status,201);
    assert.notEqual(dup.body.item.id,id);
    assert.equal((await request(`/api/items/${id}`,'DELETE')).body.deleted,true);
    assert.equal((await request('/api/items?filter=trash')).body.total,1);
    assert.equal((await request(`/api/items/${id}/undelete`,'POST',{})).status,200);
    assert.equal((await request('/api/items?filter=trash')).body.total,0);
    const badAuth = await fetch(service.origin+'/api/backup/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passphrase})});
    assert.equal(badAuth.status,401);
    const exportRes = await fetch(service.origin+'/api/backup/export',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({passphrase})});
    assert.equal(exportRes.status,200);
    assert.match(exportRes.headers.get('Content-Type') ?? '',/octet-stream/);
    const data = Buffer.from(await exportRes.arrayBuffer());
    assert.equal(data.includes(Buffer.from('Review incident')),false);
    const imported = await request('/api/backup/import','POST',{backup:data.toString('base64'),passphrase});
    assert.deepEqual(imported.body,{imported:0,skipped:2,captures:0});
    assert.equal((await request('/api/backup/import','POST',{backup:data.toString('base64'),passphrase:'wrong-but-long-passphrase'})).status,400);
    assert.equal((await request(`/api/items/${id}`,'DELETE')).status,200);
    assert.equal((await request(`/api/items/${id}/purge`,'DELETE')).body.deleted,true);
  } finally {await service.close();rmSync(directory,{recursive:true,force:true});}
});
