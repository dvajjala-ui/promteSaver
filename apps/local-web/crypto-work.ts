import { scrypt } from 'node:crypto';
import { checkCancelled } from './work-gate.ts';

/** Reviewed profiles only. No user-supplied work factors, workers or unlimited work queue. */
export async function deriveKeyAsync(passphrase: string, salt: Buffer, legacy: boolean, signal?: AbortSignal): Promise<Buffer> {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024)
    throw new Error('Passphrase must be 12-1024 characters');
  checkCancelled(signal);
  const input = Buffer.from(passphrase, 'utf8');
  const localSalt = Buffer.from(salt);
  let key: Buffer | undefined;
  try {
    key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(input, localSalt, 32, { N: legacy ? 16384 : 32768, r: 8, p: legacy ? 1 : 3, maxmem: 64 * 1024 * 1024 },
        (error, value) => error ? reject(error) : resolve(value));
    });
    checkCancelled(signal);
    return key;
  } catch (error) { key?.fill(0); throw error; }
  finally { input.fill(0); localSalt.fill(0); }
}
