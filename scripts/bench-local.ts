/* Synthetic-only benchmark. No real prompts, network, OS hooks, or production claims. */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { EncryptedArchive } from '../packages/local-store/archive.ts';
const count = Math.min(Math.max(Number(process.argv[2] ?? 2000), 1), 10_000);
if (!Number.isInteger(count)) throw new Error('Count must be integer');
const dir = mkdtempSync(join(tmpdir(), 'promtesaver-bench-'));
const key = randomBytes(32);
let archive: EncryptedArchive | undefined;
try {
  archive = new EncryptedArchive(join(dir, 'vault.sqlite'), key);
  const start = performance.now();
  for (let i = 0; i < count; i++) archive.saveLibrary({
    title: `Synthetic recipe ${i}`, body: `This is a fully synthetic template #${i}. Explain how to refactor a TypeScript function while keeping behavior, testing and accessibility intact. `.repeat(2),
    kind: i % 4 === 0 ? 'template' : 'prompt', project: 'Demo', tags: ['synthetic', i % 4 === 0 ? 'development' : 'general'], pinned: i % 14 === 0
  });
  const writeMs = performance.now() - start;
  let first: number | undefined;
  let last: number | undefined;
  for (let i = 0; i < 10; i++) {
    const before = performance.now();
    const found = archive.listLibrary(i % 2 ? 'refactor' : 'recipe 179', 'all', 100);
    const elapsed = performance.now() - before;
    if (!found.length) throw new Error('Benchmark failed to find synthetic items');
    if (first === undefined) first = elapsed;
    last = elapsed;
  }
  const summary = {
    scenario: 'synthetic local encrypted library', records: count,
    writeTotalMs: Math.round(writeMs), queryFirstMs: Math.round(first!), queryLastMs: Math.round(last!),
    rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    note: 'Linux Node runtime process only; excludes browser/OS; not a Windows/Mac benchmark'
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  archive?.close(); key.fill(0); rmSync(dir, { recursive:true,force:true });
}
