import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedArchive, libraryETag, type ArchiveSnapshot } from '../packages/local-store/archive.ts';
import { temporaryArchive, record } from './helpers.ts';

test('ETag detects edits and pinning but does not conflict on a copy/use event', () => {
  const temp=temporaryArchive();const store=new EncryptedArchive(temp.path,temp.key);
  try {
    const item=store.saveLibrary({title:'Version',body:'First'}).item;const etag=libraryETag(item);
    store.recordUse(item.id);assert.equal(libraryETag(store.getLibrary(item.id)!),etag);
    store.saveLibrary({title:item.title,body:item.body,pinned:true},item.id);
    assert.throws(()=>store.checkEdit(item.id,etag),/another window/);
    assert.equal(store.checkEdit(item.id,undefined).pinned,true);
  } finally {store.close();temp.cleanup();}
});

test('batch operations are conditional, bounded and atomic; stale member changes none', () => {
  const temp=temporaryArchive();const store=new EncryptedArchive(temp.path,temp.key);
  try {
    const items=[1,2].map(n=>store.saveLibrary({title:`Batch ${n}`,body:`Synthetic ${n}`}).item);
    const entries=items.map(item=>({id:item.id,etag:libraryETag(item)}));
    assert.throws(()=>store.batchLibrary({operation:'pin',entries:[entries[0]!,{...entries[1]!,etag:'wrong'}]}),/another window/);
    assert.equal(store.libraryStats().pinned,0);
    assert.deepEqual(store.batchLibrary({operation:'pin',entries}),{changed:2});
    const updated=items.map(item=>({id:item.id,etag:libraryETag(store.getLibrary(item.id)!)}));
    assert.equal(store.batchLibrary({operation:'move',entries:updated,project:'Reviewed'}).changed,2);
    assert.equal(store.queryLibrary({project:'Reviewed'}).total,2);
    assert.throws(()=>store.batchLibrary({operation:'trash',entries:[]}),/Invalid library batch/);
    assert.throws(()=>store.batchLibrary({operation:'trash',entries:[updated[0]!,updated[0]!]}),/Invalid library batch/);
  } finally {store.close();temp.cleanup();}
});

test('batch SQL failure rolls back earlier members, including version history', () => {
  const temp=temporaryArchive();const store=new EncryptedArchive(temp.path,temp.key);const db=new DatabaseSync(temp.path);
  try {
    const a=store.saveLibrary({title:'A',body:'A text'}).item;const b=store.saveLibrary({title:'B',body:'B text'}).item;
    db.exec(`CREATE TRIGGER reject_b BEFORE UPDATE ON library WHEN NEW.id='${b.id}' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`);
    assert.throws(()=>store.batchLibrary({operation:'move',project:'Changed',entries:[a,b].map(item=>({id:item.id,etag:libraryETag(item)}))}),/transaction failed/);
    assert.equal(store.getLibrary(a.id)?.project,'');assert.equal(store.libraryHistory(a.id).length,0);
    assert.equal(store.getLibrary(b.id)?.project,'');
  } finally {db.close();store.close();temp.cleanup();}
});

test('bounded search cache invalidates on writes, reuse, trash and external DB commits', () => {
  const temp=temporaryArchive();const store=new EncryptedArchive(temp.path,temp.key);
  try {
    const a=store.saveLibrary({title:'Cache match A',body:'shared phrase'}).item;
    const b=store.saveLibrary({title:'Cache match B',body:'shared phrase'}).item;
    const query={query:'shared',sort:'popular' as const};store.queryLibrary(query);
    store.recordUse(a.id);assert.equal(store.queryLibrary(query).items[0]?.id,a.id);
    store.deleteLibrary(a.id);assert.equal(store.queryLibrary(query).total,1);
    store.undeleteLibrary(a.id);assert.equal(store.queryLibrary(query).total,2);
    const second=new EncryptedArchive(temp.path,temp.key);
    try {second.saveLibrary({title:'Changed elsewhere',body:'no longer matches'},b.id);} finally {second.close();}
    assert.equal(store.queryLibrary(query).total,1);
    const facets=store.libraryFacets();facets.projects.push({name:'fake',count:3});
    assert.equal(store.libraryFacets().projects.some(item=>item.name==='fake'),false);
  } finally {store.close();temp.cleanup();}
});

test('encrypted preferences persist and reject unbounded idle/unknown values', () => {
  const temp=temporaryArchive();let store=new EncryptedArchive(temp.path,temp.key);
  try {
    assert.equal(store.preferences().idleMinutes,15);
    const preferences={idleMinutes:3,lowMemory:true,compactMode:true,lockOnHide:true};
    assert.deepEqual(store.setPreferences(preferences),preferences);
    assert.throws(()=>store.setPreferences({...preferences,idleMinutes:0}),/Invalid preferences/);
    assert.throws(()=>store.setPreferences({...preferences,idleMinutes:121}),/Invalid preferences/);
    assert.throws(()=>store.setPreferences({...preferences,upload:true}),/Invalid preferences/);
    store.close();store=new EncryptedArchive(temp.path,temp.key);assert.deepEqual(store.preferences(),preferences);
  } finally {store.close();temp.cleanup();}
});

test('v3 backups preserve tombstones and do not resurrect captures from an older backup', () => {
  const a=temporaryArchive();const b=temporaryArchive();const source=new EncryptedArchive(a.path,a.key);const dest=new EncryptedArchive(b.path,b.key);
  try {
    source.put(record('deleted-capture','Synthetic evidence'));const older=source.exportSnapshot();
    source.delete('deleted-capture');const newer=source.exportSnapshot();
    assert.equal(newer.version,3);assert.deepEqual(newer.tombstones,['deleted-capture']);
    dest.importSnapshot(older);assert.equal(dest.stats().records,1);
    assert.equal(dest.previewSnapshot(newer).deletions,1);
    dest.importSnapshot(newer);assert.equal(dest.stats().records,0);
    assert.equal(dest.importSnapshot(older).captures,0);assert.equal(dest.stats().tombstones,1);
  } finally {source.close();dest.close();a.cleanup();b.cleanup();}
});

test('backup preview reports collisions without mutating the archive; legacy v1 still imports', () => {
  const a=temporaryArchive();const b=temporaryArchive();const source=new EncryptedArchive(a.path,a.key);const dest=new EncryptedArchive(b.path,b.key);
  try {
    const item=source.saveLibrary({title:'Original',body:'First'}).item;
    const snapshot=source.exportSnapshot();const legacy={...snapshot,version:1} as ArchiveSnapshot;delete legacy.tombstones;delete legacy.styles;
    assert.equal(dest.previewSnapshot(legacy).imported,1);assert.equal(dest.libraryStats().all,0);
    dest.importSnapshot(legacy);source.saveLibrary({title:'Later',body:'Second'},item.id);
    const preview=dest.previewSnapshot(source.exportSnapshot());assert.equal(preview.conflicts,1);assert.equal(preview.skipped,1);
    dest.importSnapshot(source.exportSnapshot());assert.equal(dest.getLibrary(item.id)?.title,'Original');
  } finally {source.close();dest.close();a.cleanup();b.cleanup();}
});

test('malformed history groups, future revisions and duplicate captures reject before any import', () => {
  const a=temporaryArchive();const b=temporaryArchive();const source=new EncryptedArchive(a.path,a.key);const dest=new EncryptedArchive(b.path,b.key);
  try {
    const item=source.saveLibrary({title:'Version 1',body:'one'}).item;source.saveLibrary({title:'Version 2',body:'two'},item.id);
    source.put(record('capture-one','Synthetic capture'));const good=source.exportSnapshot();
    const duplicate=structuredClone(good);duplicate.histories.push(duplicate.histories[0]!);
    assert.throws(()=>dest.importSnapshot(duplicate),/Invalid backup history/);
    const future=structuredClone(good);future.histories[0]!.revisions[0]!.revision=99;
    assert.throws(()=>dest.importSnapshot(future),/Invalid backup history/);
    const dupCapture=structuredClone(good);dupCapture.captures.push(dupCapture.captures[0]!);
    assert.throws(()=>dest.importSnapshot(dupCapture),/Invalid backup duplicate capture/);
    const both=structuredClone(good);both.tombstones=['capture-one'];
    assert.throws(()=>dest.importSnapshot(both),/Invalid backup tombstones/);
    assert.equal(dest.libraryStats().all,0);
  } finally {source.close();dest.close();a.cleanup();b.cleanup();}
});
