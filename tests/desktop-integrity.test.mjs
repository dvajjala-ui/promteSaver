import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashFile, safePath, verifyStaged } from '../scripts/desktop-integrity.mjs';
import { sourcePlan } from '../scripts/prepare-desktop.mjs';
const target='x86_64-pc-windows-msvc';
function fixture() {
  const base=mkdtempSync(join(tmpdir(),'promte-stage-test-'));
  const source={
    'runtime/package.json':JSON.stringify({version:'0.8.0',type:'module',private:true}),
    'runtime/NODE-LICENSE.txt':'synthetic license fixture; not a distributable Node license',
    'runtime/apps/desktop/sidecar.ts':'// synthetic staged source',
    [`binaries/promtesaver-runtime-${target}.exe`]:'synthetic; not executable'
  };
  for(const [name,body] of Object.entries(source)){mkdirSync(join(base,name,'..'),{recursive:true});writeFileSync(join(base,name),body);}
  const manifest={version:2,applicationVersion:'0.8.0',target,node:'24.16.0',files:Object.keys(source).map(path=>({path,...hashFile(join(base,path))}))};
  const save=()=>writeFileSync(join(base,'runtime/resource-manifest.json'),JSON.stringify(manifest));save();
  return {base,manifest,save,clean:()=>rmSync(base,{recursive:true,force:true})};
}
test('runtime verifier checks all bytes, version and target without executing staged artifacts',()=>{
  const f=fixture();try{
    assert.equal(verifyStaged(f.base,{version:'0.8.0',target}).verified,true);
    assert.throws(()=>verifyStaged(f.base,{version:'0.7.0'}),/version mismatch/);
    assert.throws(()=>verifyStaged(f.base,{target:'different'}),/target mismatch/);
    writeFileSync(join(f.base,'runtime/apps/desktop/sidecar.ts'),'changed');
    assert.throws(()=>verifyStaged(f.base),/Artifact mismatch/);
  }finally{f.clean();}
});
test('runtime verifier rejects duplicate, traversing and untracked runtime files',()=>{
  const f=fixture();try{
    f.manifest.files.push(f.manifest.files[0]);f.save();assert.throws(()=>verifyStaged(f.base),/duplicate/);f.manifest.files.pop();
    const old=f.manifest.files[0].path;f.manifest.files[0].path='runtime/../outside';f.save();assert.throws(()=>verifyStaged(f.base),/Unsafe/);f.manifest.files[0].path=old;f.save();
    writeFileSync(join(f.base,'runtime/unexpected.txt'),'not on manifest');assert.throws(()=>verifyStaged(f.base),/Unexpected/);
    for(const path of ['../x','/etc/passwd','a//b','C:/file','a\\b','a/./b'])assert.throws(()=>safePath(f.base,path),/Unsafe/);
  }finally{f.clean();}
});
test('runtime verifier rejects missing, oversized and invalid manifests',()=>{
  const f=fixture();try{
    const original=readFileSync(join(f.base,'runtime/resource-manifest.json'));
    f.manifest.node='22.16.0';f.save();assert.throws(()=>verifyStaged(f.base),/Invalid/);
    writeFileSync(join(f.base,'runtime/resource-manifest.json'),'x'.repeat(2_000_001));assert.throws(()=>verifyStaged(f.base),/too large/);
    writeFileSync(join(f.base,'runtime/resource-manifest.json'),original);
    rmSync(join(f.base,'runtime/apps/desktop/sidecar.ts'));assert.throws(()=>verifyStaged(f.base),/ENOENT/);
  }finally{f.clean();}
});
test('staging rejects a symlinked source root and verification rejects symlink ancestors',()=>{
  const f=fixture();try{
    mkdirSync(join(f.base,'packages'));
    // Windows directory junctions do not require symlink creation privileges.
    symlinkSync(join(f.base,'runtime'),join(f.base,'packages/contracts'),process.platform==='win32'?'junction':'dir');
    assert.throws(()=>sourcePlan(f.base),/Symlink/);
    symlinkSync(join(f.base,'runtime'),join(f.base,'redirect'),process.platform==='win32'?'junction':'dir');
    assert.throws(()=>safePath(f.base,'redirect/package.json'),/Symlink/);
  }finally{f.clean();}
});
