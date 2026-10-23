import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { closeSync, constants, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deriveKeyAsync } from './crypto-work.ts';

const CONTEXT = Buffer.from('promteSaver:wrapped-archive-key:v2:N32768:r8:p3');
const MAX_METADATA_BYTES = 4096;
export interface KeyMetadataV1 { version: 1; kdf: 'scrypt'; salt: string; }
export interface KeyMetadataV2 {
  version: 2; kdf: 'scrypt'; params: { N: 32768; r: 8; p: 3 };
  salt: string; nonce: string; ciphertext: string; tag: string;
}
export type KeyMetadata = KeyMetadataV1 | KeyMetadataV2;

export function validatePassphrase(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024)
    throw new Error('Passphrase must be 12-1024 characters');
}
function bytes(value: unknown, length: number): Buffer {
  if (typeof value !== 'string') throw new Error('Unsupported vault format');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== length || decoded.toString('base64') !== value) throw new Error('Unsupported vault format');
  return decoded;
}
function derive(passphrase: string, salt: Buffer, legacy: boolean): Buffer {
  validatePassphrase(passphrase);
  const input = Buffer.from(passphrase, 'utf8');
  try { return scryptSync(input, salt, 32, { N: legacy ? 16384 : 32768, r: 8, p: legacy ? 1 : 3, maxmem: 64 * 1024 * 1024 }); }
  finally { input.fill(0); }
}
export function readKeyMetadata(path: string): KeyMetadata {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_METADATA_BYTES) throw new Error('Unsupported vault format');
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object') throw new Error('Unsupported vault format');
  const data = value as KeyMetadata;
  if (data.kdf !== 'scrypt' || ![1, 2].includes(data.version)) throw new Error('Unsupported vault format');
  bytes(data.salt, 32).fill(0);
  if (data.version === 2) {
    // Only the reviewed profile is accepted. Untrusted metadata cannot request unbounded KDF work.
    if (data.params?.N !== 32768 || data.params.r !== 8 || data.params.p !== 3) throw new Error('Unsupported vault format');
    bytes(data.nonce, 12).fill(0); bytes(data.ciphertext, 32).fill(0); bytes(data.tag, 16).fill(0);
  }
  return data;
}
function unwrapDerived(metadata: KeyMetadata, key: Buffer): Buffer {
  if (metadata.version === 1) return Buffer.from(key);
  const decipher = createDecipheriv('aes-256-gcm', key, bytes(metadata.nonce, 12));
  decipher.setAAD(CONTEXT); decipher.setAuthTag(bytes(metadata.tag, 16));
  return Buffer.concat([decipher.update(bytes(metadata.ciphertext, 32)), decipher.final()]);
}
function wrapDerived(archiveKey: Buffer, salt: Buffer, key: Buffer): KeyMetadataV2 {
  if (archiveKey.length !== 32) throw new Error('Invalid archive key');
  const nonce = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(CONTEXT);
    const ciphertext = Buffer.concat([cipher.update(archiveKey), cipher.final()]);
    return { version: 2, kdf: 'scrypt', params: { N: 32768, r: 8, p: 3 },
      salt: salt.toString('base64'), nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  } finally { nonce.fill(0); }
}
/** Synchronous variants are retained for offline tools/tests; the HTTP service uses async variants. */
export function unwrapKey(passphrase: string, metadata: KeyMetadata): Buffer {
  const salt = bytes(metadata.salt, 32); let key: Buffer | undefined;
  try { key = derive(passphrase, salt, metadata.version === 1); return unwrapDerived(metadata, key); }
  finally { key?.fill(0); salt.fill(0); }
}
export function wrapKey(passphrase: string, archiveKey: Buffer): KeyMetadataV2 {
  if (archiveKey.length !== 32) throw new Error('Invalid archive key');
  const salt = randomBytes(32); let key: Buffer | undefined;
  try { key = derive(passphrase, salt, false); return wrapDerived(archiveKey, salt, key); }
  finally { key?.fill(0); salt.fill(0); }
}
export async function unwrapKeyAsync(passphrase: string, metadata: KeyMetadata, signal?: AbortSignal): Promise<Buffer> {
  const salt = bytes(metadata.salt, 32); let key: Buffer | undefined;
  try { key = await deriveKeyAsync(passphrase, salt, metadata.version === 1, signal); return unwrapDerived(metadata, key); }
  finally { key?.fill(0); salt.fill(0); }
}
export async function wrapKeyAsync(passphrase: string, archiveKey: Buffer, signal?: AbortSignal): Promise<KeyMetadataV2> {
  if (archiveKey.length !== 32) throw new Error('Invalid archive key');
  const localArchiveKey = Buffer.from(archiveKey); const salt = randomBytes(32); let key: Buffer | undefined;
  try { key = await deriveKeyAsync(passphrase, salt, false, signal); return wrapDerived(localArchiveKey, salt, key); }
  finally { key?.fill(0); salt.fill(0); localArchiveKey.fill(0); }
}
/** Same-directory, exclusive temporary file, fsync and rename: never truncate the active envelope. */
export function writeKeyMetadata(path: string, metadata: KeyMetadata): void {
  if (existsSync(path) && !lstatSync(path).isFile()) throw new Error('Unsafe vault metadata');
  const temp = `${path}.${randomBytes(12).toString('hex')}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    writeFileSync(fd, JSON.stringify(metadata) + '\n'); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temp, path);
    // POSIX directory fsync makes the rename durable. Windows does not expose it through fs.
    if (process.platform !== 'win32') {
      let directory: number | undefined;
      try { directory = openSync(dirname(path), constants.O_RDONLY); fsyncSync(directory); }
      catch { /* The atomic rename already committed; not every filesystem supports directory fsync. */ }
      finally { if (directory !== undefined) closeSync(directory); }
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
