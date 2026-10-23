/** Reject version drift before shipping; no network or modification. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function checkRelease(base=root) {
  const json=name=>JSON.parse(readFileSync(join(base,name),'utf8'));
  const version=json('package.json').version;
  if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid application release version');
  const lock=json('package-lock.json');
  const sources={
    lockfile:lock.version,lockfilePackage:lock.packages[''].version,
    tauri:json('apps/desktop/src-tauri/tauri.conf.json').version,
    cargo:readFileSync(join(base,'apps/desktop/src-tauri/Cargo.toml'),'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    server:readFileSync(join(base,'packages/contracts/app-info.ts'),'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1],
    extension:json('apps/browser-helper/manifest.json').version
  };
  const invalid=Object.entries(sources).filter(([,value])=>value!==version).map(([name])=>name);
  if(invalid.length)throw new Error(`Version drift: ${invalid.join(', ')}`);
  return {version,consistent:true,checked:Object.keys(sources)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkRelease(),null,2));
