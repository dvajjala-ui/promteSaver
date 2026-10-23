import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { MAX_SNAPSHOT_BYTES, type ArchiveSnapshot } from '../../packages/local-store/archive.ts';
import { deriveKeyAsync } from './crypto-work.ts';
import { checkCancelled } from './work-gate.ts';

const MAGIC = Buffer.from('POMTE-ENCRYPTED-BACKUP\x01', 'latin1');
const MAX_BACKUP_BYTES = MAX_SNAPSHOT_BYTES + 512;
function validatePassword(passphrase: string): void {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024)
    throw new Error('Backup passphrase must be 12-1024 characters');
}
function keyFromPassphrase(passphrase: string, salt: Buffer): Buffer {
  validatePassword(passphrase);
  const input = Buffer.from(passphrase, 'utf8');
  try { return scryptSync(input, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 48 * 1024 * 1024 }); }
  finally { input.fill(0); }
}
/** Wire-compatible format: magic | salt(32) | nonce(12) | encrypted JSON | auth-tag(16). */
function encryptWithKey(snapshot: ArchiveSnapshot, salt: Buffer, key: Buffer): Buffer {
  const plaintext = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const nonce = randomBytes(12);
  try {
    if (plaintext.byteLength > MAX_SNAPSHOT_BYTES) throw new Error('Backup exceeds the 12 MiB portable limit');
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.concat([MAGIC, salt]));
    return Buffer.concat([MAGIC, salt, nonce, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  } finally { plaintext.fill(0); nonce.fill(0); }
}
function validateEnvelope(data: Buffer): void {
  if (!(data instanceof Buffer) || data.byteLength > MAX_BACKUP_BYTES || data.byteLength < MAGIC.length + 32 + 12 + 16 ||
      !data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid or unsupported encrypted backup');
}
function decryptWithKey(data: Buffer, key: Buffer): ArchiveSnapshot {
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(MAGIC.length + 32, MAGIC.length + 44));
    decipher.setAAD(data.subarray(0, MAGIC.length + 32));
    decipher.setAuthTag(data.subarray(data.byteLength - 16));
    plaintext = Buffer.concat([decipher.update(data.subarray(MAGIC.length + 44, data.byteLength - 16)), decipher.final()]);
    const value: unknown = JSON.parse(plaintext.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid backup contents');
    return value as ArchiveSnapshot;
  } catch { throw new Error('Backup password is incorrect or file is damaged'); }
  finally { plaintext?.fill(0); }
}
/** Offline compatibility tools may use the synchronous variants. HTTP always uses async KDF. */
export function encryptBackup(snapshot: ArchiveSnapshot, passphrase: string): Buffer {
  const salt = randomBytes(32); let key: Buffer | undefined;
  try { key = keyFromPassphrase(passphrase, salt); return encryptWithKey(snapshot, salt, key); }
  finally { key?.fill(0); salt.fill(0); }
}
export function decryptBackup(data: Buffer, passphrase: string): ArchiveSnapshot {
  validateEnvelope(data);
  const key = keyFromPassphrase(passphrase, data.subarray(MAGIC.length, MAGIC.length + 32));
  try { return decryptWithKey(data, key); } finally { key.fill(0); }
}
/** Defer gathering plaintext until the KDF finishes; caller must revalidate the vault session. */
export async function encryptBackupAsync(snapshot: () => ArchiveSnapshot, passphrase: string, signal?: AbortSignal): Promise<Buffer> {
  validatePassword(passphrase); checkCancelled(signal);
  const salt = randomBytes(32); let key: Buffer | undefined;
  try {
    key = await deriveKeyAsync(passphrase, salt, true, signal);
    checkCancelled(signal);
    return encryptWithKey(snapshot(), salt, key);
  } finally { key?.fill(0); salt.fill(0); }
}
export async function decryptBackupAsync(data: Buffer, passphrase: string, signal?: AbortSignal): Promise<ArchiveSnapshot> {
  validateEnvelope(data); validatePassword(passphrase); checkCancelled(signal);
  const key = await deriveKeyAsync(passphrase, data.subarray(MAGIC.length, MAGIC.length + 32), true, signal);
  try { checkCancelled(signal); return decryptWithKey(data, key); } finally { key.fill(0); }
}
