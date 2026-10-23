/** Non-sensitive release readiness report. Never read or display user vault contents. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { totalmem, freemem, platform, arch, release } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const parts = process.versions.node.split('.').map(Number);
const nodeTarget = parts[0] === 24 && parts[1] >= 16;
const files = ['apps/local-web/server.ts','apps/local-web/public/index.html',
  'apps/local-web/public/app.js','apps/local-web/public/writing.css','apps/local-web/backup.ts',
  'apps/local-web/work-gate.ts','apps/local-web/diagnostics.ts','packages/contracts/app-info.ts',
  'packages/writing-style/profile.ts','packages/writing-style/proofread.ts',
  'apps/browser-helper/manifest.json','packages/local-store/archive.ts'];
const safe = (bytes) => Math.round(bytes / 1024 / 1024);
const report = {
  application:'promteSaver Local Beta',
  version:JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,
  nodeVersion:process.version,
  recommendedNode:'>=24.16.0 <25',
  nodeTargetMet:nodeTarget,
  os:platform(), architecture:arch(), kernelRelease:release(),
  totalMemoryMiB:safe(totalmem()), freeMemoryMiB:safe(freemem()),
  requiredFilesPresent:files.every(name => existsSync(join(root,name))),
  nodeRuntimeRequired:true,
  nativeRecorderIncluded:false,
  desktopInstallerIncluded:false,
  desktopHostSourceIncluded:existsSync(join(root,'apps/desktop/src-tauri/src/main.rs')),
  desktopHostCompiledInThisRelease:false,
  keyEnvelopeFormat:2,
  browserHelperManualOnly:true,
  note:'Diagnostic reports environment and repository files only; it does not inspect your prompts or use the network.'
};
console.log(JSON.stringify(report,null,2));
if (!report.requiredFilesPresent) process.exitCode=1;
