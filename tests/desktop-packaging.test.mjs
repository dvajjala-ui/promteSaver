import test from 'node:test';
import assert from 'node:assert/strict';
import { sourcePlan, nativeTarget, prepare } from '../scripts/prepare-desktop.mjs';

test('desktop staging includes only the runtime sources and no user vault, secrets, fixtures or tests',()=>{
  const plan=sourcePlan();assert.ok(plan.includes('apps/desktop/sidecar.ts'));
  assert.ok(plan.some(p=>p.endsWith('index.html')));assert.ok(plan.some(p=>p.endsWith('key-envelope.ts')));
  assert.ok(plan.includes('packages/writing-style/profile.ts'),'Native runtime must include writing profile algorithm');
  assert.ok(plan.includes('packages/writing-style/proofread.ts'),'Native runtime must include on-demand writing checker');
  assert.ok(plan.includes('apps/local-web/public/writing.css'),'Native runtime must include Writing Studio UI');
  assert.ok(plan.every(p=>!/(?:\.sqlite|\.pem|\.key|keyinfo\.json|fixtures|tests|node_modules)/.test(p)));
  assert.equal(prepare({dryRun:true}).mode,'plan-only');
});
test('native targets are explicit and cross-target runtime staging is rejected',()=>{
  assert.equal(nativeTarget('darwin','arm64'),'aarch64-apple-darwin');
  assert.equal(nativeTarget('win32','x64'),'x86_64-pc-windows-msvc');
  assert.throws(()=>nativeTarget('other','mystery'),/Unsupported/);
  assert.throws(()=>prepare({target:'deliberately-wrong-target',dryRun:true}),/Cross-architecture/);
});

test('staging rejects accidental vault metadata rather than copying it as JSON',async()=>{
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'promte-source-'));
  try{
    fs.mkdirSync(path.join(base,'packages/contracts'),{recursive:true});
    fs.writeFileSync(path.join(base,'packages/contracts/keyinfo.json'),'synthetic-not-a-key');
    assert.throws(()=>sourcePlan(base),/Private data/);
    fs.rmSync(path.join(base,'packages/contracts/keyinfo.json'));
    fs.writeFileSync(path.join(base,'packages/contracts/unknown.json'),'{}');
    assert.throws(()=>sourcePlan(base),/Unreviewed runtime JSON/);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});
