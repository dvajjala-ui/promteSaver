/** Stage allowlisted source + a trusted local Node runtime. No downloads or installer execution. */
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile, safePath, verifyStaged } from './desktop-integrity.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const nativeTarget = (platform=process.platform, arch=process.arch) => {
  const targets={win32:{x64:'x86_64-pc-windows-msvc',arm64:'aarch64-pc-windows-msvc'},darwin:{x64:'x86_64-apple-darwin',arm64:'aarch64-apple-darwin'},linux:{x64:'x86_64-unknown-linux-gnu',arm64:'aarch64-unknown-linux-gnu'}};
  const target=targets[platform]?.[arch];if(!target)throw new Error('Unsupported native platform/architecture');return target;
};
export function sourcePlan(base=root) {
  const files=[];
  const walk=directory=>{
    for(const entry of readdirSync(safePath(base,directory),{withFileTypes:true})){
      if(entry.isSymbolicLink())throw new Error('Symlink rejected in desktop runtime source');
      const path=`${directory}/${entry.name}`;
      if(/^(?:node_modules|data|captures|exports|\.git|\.env(?:\..*)?|keyinfo\.json|vault)$/.test(entry.name) || /\.(?:pem|key|p12|pfx|sqlite|db|pomte)$/.test(entry.name))
        throw new Error('Private data or dependency directory rejected in runtime source');
      if(entry.isFile() && /\.json$/.test(entry.name) && path!=='packages/contracts/capture.schema.json')
        throw new Error('Unreviewed runtime JSON file; update the explicit allowlist after review');
      if(entry.isDirectory())walk(path);
      else if(entry.isFile() && /\.(?:ts|js|json|html|css|svg)$/.test(entry.name))files.push(path);
    }
  };
  for(const path of ['packages/contracts','packages/capture-core','packages/local-store','packages/writing-style','apps/local-web'])walk(path);
  if(!lstatSync(safePath(base,'apps/desktop/sidecar.ts')).isFile())throw new Error('Missing sidecar source');
  files.push('apps/desktop/sidecar.ts','apps/desktop/codex-source.ts');return files.sort();
}
export function findNodeLicense(execPath=process.execPath) {
  // Official Node archives normally retain LICENSE beside node.exe or above bin/node.
  return [join(dirname(execPath),'LICENSE'),join(dirname(execPath),'..','LICENSE')].find(path => existsSync(path) && lstatSync(path).isFile());
}
export function prepare({base=root,target=nativeTarget(),dryRun=false,nodeLicense}={}) {
  if(target!==nativeTarget())throw new Error('Cross-architecture staging is not supported. Build on the destination OS/architecture.');
  const source=sourcePlan(base);
  const version=JSON.parse(readFileSync(safePath(base,'package.json'),'utf8')).version;
  const [major,minor]=process.versions.node.split('.').map(Number);
  const compatible=major===24&&minor>=16;
  if(dryRun)return {mode:'plan-only',applicationVersion:version,target,node:process.versions.node,nodeTargetMet:compatible,files:source};
  if(!compatible)throw new Error('Desktop packaging requires the supported Node 24.16+ (24.x) runtime; compatibility-mode Node is not bundled.');
  nodeLicense ??= findNodeLicense();
  if(!nodeLicense||!existsSync(nodeLicense)||!lstatSync(nodeLicense).isFile())throw new Error('Supply --node-license with the LICENSE from the exact trusted Node distribution being bundled.');
  const license=readFileSync(nodeLicense);if(license.length<500||license.length>1_000_000)throw new Error('Node distribution license file is invalid');
  const tauri=safePath(base,'apps/desktop/src-tauri');const runtime=join(tauri,'runtime');const binaries=join(tauri,'binaries');
  // Reject symlink output roots, including dangling links, before removing or copying anything.
  for(const name of readdirSync(tauri))if(['runtime','binaries'].includes(name) && lstatSync(join(tauri,name)).isSymbolicLink())throw new Error('Symlink output root rejected');
  const binaryName=`promtesaver-runtime-${target}${process.platform==='win32'?'.exe':''}`;
  if(existsSync(binaries) && readdirSync(binaries).includes(binaryName) && lstatSync(join(binaries,binaryName)).isSymbolicLink())throw new Error('Symlink runtime binary rejected');
  rmSync(runtime,{recursive:true,force:true});mkdirSync(runtime,{recursive:true});mkdirSync(binaries,{recursive:true});
  const manifest={version:2,applicationVersion:version,target,node:process.versions.node,files:[]};
  const record=name=>manifest.files.push({path:name,...hashFile(safePath(tauri,name))});
  for(const path of source){const dest=join(runtime,path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(safePath(base,path),dest);record(`runtime/${path}`);}
  writeFileSync(join(runtime,'package.json'),JSON.stringify({name:'promtesaver-private-runtime',version,private:true,type:'module'})+'\n');
  writeFileSync(join(runtime,'NODE-LICENSE.txt'),license);record('runtime/NODE-LICENSE.txt');record('runtime/package.json');
  const binary=join(binaries,binaryName);
  copyFileSync(process.execPath,binary);if(process.platform!=='win32')chmodSync(binary,0o755);
  record(`binaries/${binaryName}`);
  writeFileSync(join(runtime,'resource-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const verification=verifyStaged(tauri,{version,target});
  return {mode:'staged',applicationVersion:version,target,node:process.versions.node,sourceFiles:source.length,verification};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const value=key=>{const i=args.indexOf(key);if(i!==-1&&!args[i+1])throw new Error(`${key} requires a value`);return i<0?undefined:args[i+1];};
  console.log(JSON.stringify(prepare({dryRun:args.includes('--dry-run'),target:value('--target')??nativeTarget(),nodeLicense:value('--node-license')}),null,2));
}
