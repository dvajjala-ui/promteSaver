/** Explicit native preview build. No signing, auto-publishing or silent tool installation. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepare, nativeTarget } from './prepare-desktop.mjs';
import { checkRelease } from './release-check.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
const licenseIndex=args.indexOf('--node-license');
if(licenseIndex>=0&&!args[licenseIndex+1])throw new Error('--node-license requires a file path');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major!==24||minor<16)throw new Error('Native preview builds require Node 24.16+ within 24.x. Do not bundle a compatibility runtime.');
checkRelease();
const desktop=join(root,'apps/desktop'),tauri=join(desktop,'src-tauri');
function run(command,parameters,cwd=tauri) {
  const result=spawnSync(command,parameters,{cwd,stdio:'inherit',shell:false});
  if(result.error)throw new Error(`Could not start ${command}. Install the documented native prerequisites first.`);
  if(result.status!==0)throw new Error(`${command} ${parameters.join(' ')} failed (exit ${result.status??'signal'})`);
}
run('cargo',['--version']);run('cargo',['tauri','--version']);
if(!existsSync(join(tauri,'Cargo.lock'))) {
  if(!args.includes('--resolve-lockfile'))throw new Error('Cargo.lock is absent. The first DEVELOPMENT preview may use --resolve-lockfile; review and commit the generated lock before release builds.');
  console.warn('Resolving an experimental Rust graph. This is not a reproducible or production release.');
  run('cargo',['generate-lockfile']);
}
const staged=prepare({target:nativeTarget(),...(licenseIndex<0?{}:{nodeLicense:args[licenseIndex+1]})});
console.log(JSON.stringify(staged,null,2));
run('cargo',['test','--locked']);
const bundle=process.platform==='win32'?'nsis':process.platform==='darwin'?'dmg':'deb';
run('cargo',['tauri','build','--bundles',bundle,'--','--locked'],desktop);
console.log('Native build command completed. Install and test on a clean device before distributing. No release was published.');
