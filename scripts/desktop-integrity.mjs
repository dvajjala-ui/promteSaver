/** Build-time consistency checks, NOT a code signature or runtime trust boundary. */
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function safePath(base, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || /[\x00-\x1f:]/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error('Unsafe relative artifact path');
  }
  let current = resolve(base);
  if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink root rejected');
  for (const part of name.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink artifact rejected');
  }
  return current;
}

export function hashFile(path) {
  // Streaming avoids retaining a second complete Node executable in memory.
  const handle = openSync(path, 'r');
  const buffer = Buffer.allocUnsafe(128 * 1024);
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for (;;) {
      const length = readSync(handle, buffer, 0, buffer.length, null);
      if (!length) break;
      bytes += length; hash.update(buffer.subarray(0, length));
    }
    return { bytes, sha256: hash.digest('hex') };
  } finally { buffer.fill(0); closeSync(handle); }
}

export function listFiles(base, prefix) {
  const directory = safePath(base, prefix);
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('Symlink artifact rejected');
    if (entry.isDirectory()) result.push(...listFiles(base, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error('Non-regular artifact rejected');
  }
  return result.sort();
}

export function verifyStaged(tauri, { version, target } = {}) {
  const manifestPath = safePath(tauri, 'runtime/resource-manifest.json');
  if (lstatSync(manifestPath).size > 2_000_000) throw new Error('Manifest too large');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 2 || !/^\d+\.\d+\.\d+$/.test(manifest.applicationVersion) ||
      !/^[a-zA-Z0-9_-]+$/.test(manifest.target) || !/^24\.(?:1[6-9]|[2-9]\d|\d{3,})\.\d+$/.test(manifest.node) ||
      !Array.isArray(manifest.files) || manifest.files.length < 4 || manifest.files.length > 10000) throw new Error('Invalid runtime manifest');
  if (version && version !== manifest.applicationVersion) throw new Error('Application version mismatch');
  if (target && target !== manifest.target) throw new Error('Runtime target mismatch');
  const binary = `binaries/promtesaver-runtime-${manifest.target}${manifest.target.includes('windows') ? '.exe' : ''}`;
  const seen = new Set();
  for (const item of manifest.files) {
    if (!item || typeof item.path !== 'string' || (!item.path.startsWith('runtime/') && item.path !== binary) ||
        item.path === 'runtime/resource-manifest.json' || !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(item.sha256) || seen.has(item.path)) throw new Error('Invalid or duplicate manifest entry');
    const path = safePath(tauri, item.path);
    if (!lstatSync(path).isFile()) throw new Error('Non-regular artifact rejected');
    const actual = hashFile(path);
    if (actual.bytes !== item.bytes || actual.sha256 !== item.sha256) throw new Error(`Artifact mismatch: ${item.path}`);
    seen.add(item.path);
  }
  for (const required of [binary, 'runtime/package.json', 'runtime/NODE-LICENSE.txt', 'runtime/apps/desktop/sidecar.ts']) {
    if (!seen.has(required)) throw new Error('Required artifact missing from manifest');
  }
  const actualNames = listFiles(tauri, 'runtime').filter(name => name !== 'runtime/resource-manifest.json');
  if (actualNames.some(name => !seen.has(name)) || actualNames.length !== seen.size - 1) throw new Error('Unexpected or missing runtime files');
  const runtimePackage = JSON.parse(readFileSync(safePath(tauri, 'runtime/package.json'), 'utf8'));
  if (runtimePackage.version !== manifest.applicationVersion || runtimePackage.type !== 'module' || !runtimePackage.private) throw new Error('Runtime package metadata mismatch');
  return { verified: true, applicationVersion: manifest.applicationVersion, target: manifest.target, node: manifest.node, files: seen.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  console.log(JSON.stringify(verifyStaged(join(root, 'apps/desktop/src-tauri'), { version }), null, 2));
}
