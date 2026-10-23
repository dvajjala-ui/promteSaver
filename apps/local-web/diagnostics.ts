import { arch, platform, totalmem } from 'node:os';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { APP_VERSION, SUPPORTED_NODE, supportedNode } from '../../packages/contracts/app-info.ts';
import type { SecureOperation } from './work-gate.ts';

/** On-demand, allowlisted support data. No prompt reads, paths, URLs, secrets, or network calls. */
export function diagnosticSnapshot(input: { directory: string; lowMemory: boolean; keyFormat: number | null; operation: SecureOperation | null; browserCaptureAuthorized?: boolean; externalAIEnabled?: boolean }) {
  const memory = process.memoryUsage();
  const mib = (bytes: number) => Math.round(bytes / 1024 / 1024 * 10) / 10;
  let storageBytes = 0; let storageSizeAvailable = true;
  for (const name of ['vault.sqlite', 'vault.sqlite-wal', 'vault.sqlite-shm', 'keyinfo.json']) {
    try {
      const stat = lstatSync(join(input.directory, name));
      if (stat.isFile() && !stat.isSymbolicLink()) storageBytes += stat.size;
      else storageSizeAvailable = false;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') storageSizeAvailable = false; }
  }
  return {
    schema: 'promtesaver-diagnostics-v1', version: APP_VERSION,
    runtime: { node: process.versions.node, supportedNode: supportedNode(), expectedNode: SUPPORTED_NODE,
      platform: platform(), architecture: arch() },
    resources: { profile: input.lowMemory ? 'low-memory' : 'standard', serviceRssMiB: mib(memory.rss),
      serviceHeapMiB: mib(memory.heapUsed), uptimeSeconds: Math.floor(process.uptime()),
      lowMemoryRecommended: totalmem() <= 8 * 1024 ** 3, secureOperation: input.operation, maxConcurrentSecureOperations: 1 },
    storage: { sizeMiB: storageSizeAvailable ? mib(storageBytes) : null, keyFormat: input.keyFormat,
      recordEncryption: 'AES-256-GCM', wholeDatabaseEncryption: false, portableBackupLimitMiB: 12 },
    privacy: { telemetry: false, automaticCapture: input.browserCaptureAuthorized === true, cloudSync: false, externalAI: input.externalAIEnabled === true },
    limitations: [
      'Memory is a point-in-time Node service measurement, not peak or whole-app memory.',
      'Browser, WebView, OS caches and other applications are not included.',
      'This snapshot does not verify installer signing, native support, or absence of all security flaws.',
      'No prompts, writing samples, file paths, session URLs, passwords or keys are included.',
      'Capture authorization is not evidence of a connected browser or successful capture; AI enablement is not provider verification.'
    ]
  };
}
