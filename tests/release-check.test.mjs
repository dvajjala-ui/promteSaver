import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelease } from '../scripts/release-check.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('release metadata is aligned and stale native versions fail before packaging',()=>{
  assert.equal(checkRelease().consistent,true);
  const base=mkdtempSync(join(tmpdir(),'promte-release-'));
  const files=['package.json','package-lock.json','apps/desktop/src-tauri/tauri.conf.json','apps/desktop/src-tauri/Cargo.toml','packages/contracts/app-info.ts','apps/browser-helper/manifest.json'];
  try{
    for(const name of files){mkdirSync(join(base,name,'..'),{recursive:true});writeFileSync(join(base,name),readFileSync(join(root,name)));}
    assert.equal(checkRelease(base).consistent,true);
    const config=JSON.parse(readFileSync(join(base,files[2]),'utf8'));config.version='0.1.0';writeFileSync(join(base,files[2]),JSON.stringify(config));
    assert.throws(()=>checkRelease(base),/Version drift: tauri/);
  }finally{rmSync(base,{recursive:true,force:true});}
});
