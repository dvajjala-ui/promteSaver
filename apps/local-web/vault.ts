import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EncryptedArchive } from '../../packages/local-store/archive.ts';
import { checkCancelled, OperationBusyError, OperationCancelledError } from './work-gate.ts';
import { readKeyMetadata, unwrapKey, unwrapKeyAsync, validatePassphrase, wrapKey, wrapKeyAsync, writeKeyMetadata, type KeyMetadata } from './key-envelope.ts';

export interface VaultOptions {
  /** Injection point for atomic-write failure tests, not an HTTP option. */
  metadataWriter?: (path: string, metadata: KeyMetadata) => void;
}
/** Password wraps a random archive key. Neither the password nor the unwrapped key is persisted. */
export class LocalVault {
  readonly directory: string;
  #archive: EncryptedArchive | undefined;
  #key: Buffer | undefined;
  #failures = 0;
  #epoch = 0;
  #busy = false;
  get sessionVersion(): number { return this.#epoch; }
  #available(): void { if (this.#busy) throw new OperationBusyError(); }
  #checkEpoch(epoch: number, signal?: AbortSignal): void {
    checkCancelled(signal);
    if (epoch !== this.#epoch) throw new OperationCancelledError();
  }
  #retryAfter = 0;
  #writeMetadata: (path: string, metadata: KeyMetadata) => void;
  constructor(directory: string, options: VaultOptions = {}) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (!lstatSync(this.directory).isDirectory() || lstatSync(this.directory).isSymbolicLink()) throw new Error('Unsafe vault directory');
    if (process.platform !== 'win32') chmodSync(this.directory, 0o700);
    this.#writeMetadata = options.metadataWriter ?? writeKeyMetadata;
  }
  get archive(): EncryptedArchive {
    if (!this.#archive) throw new Error('Vault is locked');
    return this.#archive;
  }
  status(): { initialized: boolean; unlocked: boolean; recording: false; sync: false; keyFormat: number | null } {
    const initialized = existsSync(this.#saltPath());
    let keyFormat: number | null = null;
    if (initialized) { try { keyFormat = readKeyMetadata(this.#saltPath()).version; } catch { /* Unlock reports invalid metadata. */ } }
    return { initialized, unlocked: !!this.#archive, recording: false, sync: false, keyFormat };
  }
  #saltPath(): string { return join(this.directory, 'keyinfo.json'); }
  #dbPath(): string { return join(this.directory, 'vault.sqlite'); }
  #checkRetry(): void { if (Date.now() < this.#retryAfter) throw new Error('Too many attempts; retry later'); }
  #fail(): never {
    this.#failures++;
    if (this.#failures >= 5) this.#retryAfter = Date.now() + Math.min(30_000, (this.#failures - 4) * 5_000);
    throw new Error('Could not unlock vault');
  }
  setup(passphrase: string): void {
    this.#available();
    if (this.status().initialized || existsSync(this.#dbPath())) throw new Error('Vault is already initialized');
    validatePassphrase(passphrase);
    const key = randomBytes(32);
    let archive: EncryptedArchive | undefined;
    try {
      const metadata = wrapKey(passphrase, key);
      archive = new EncryptedArchive(this.#dbPath(), key);
      this.#writeMetadata(this.#saltPath(), metadata);
      this.#archive = archive; this.#key = Buffer.from(key);
    } catch (error) {
      archive?.close();
      // Only a failed brand-new setup without committed metadata may remove its empty database.
      if (!existsSync(this.#saltPath())) for (const suffix of ['', '-wal', '-shm']) {
        try { unlinkSync(this.#dbPath() + suffix); } catch (cleanup) { if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanup; }
      }
      throw error;
    } finally { key.fill(0); }
  }
  unlock(passphrase: string): void {
    this.#available();
    if (this.#archive) return;
    this.#checkRetry(); validatePassphrase(passphrase);
    if (!this.status().initialized) throw new Error('Vault must be set up first');
    if (!existsSync(this.#dbPath())) throw new Error('Vault database is missing; restore a backup');
    let key: Buffer | undefined; let archive: EncryptedArchive | undefined;
    const metadata = readKeyMetadata(this.#saltPath());
    try {
      try { key = unwrapKey(passphrase, metadata); archive = new EncryptedArchive(this.#dbPath(), key); }
      catch { this.#fail(); }
      // Authenticate first. Re-wrap a legacy key without rewriting any prompt records or history.
      if (metadata.version === 1) this.#writeMetadata(this.#saltPath(), wrapKey(passphrase, key!));
      this.#archive = archive!; this.#key = Buffer.from(key!);
      this.#failures = 0; this.#retryAfter = 0;
    } catch (error) { archive?.close(); throw error; }
    finally { key?.fill(0); }
  }
  changePassphrase(current: string, replacement: string): void {
    this.#available();
    if (!this.#archive || !this.#key) throw new Error('Vault is locked');
    this.#checkRetry(); validatePassphrase(current); validatePassphrase(replacement);
    if (current === replacement) throw new Error('Passphrase must be different from the current one');
    let verified: Buffer | undefined;
    try {
      try { verified = unwrapKey(current, readKeyMetadata(this.#saltPath())); }
      catch { this.#fail(); }
      if (verified!.length !== this.#key.length || !timingSafeEqual(verified!, this.#key)) this.#fail();
      this.#writeMetadata(this.#saltPath(), wrapKey(replacement, this.#key));
      this.#failures = 0; this.#retryAfter = 0;
    } finally { verified?.fill(0); }
  }
  /** Async service path: one derivation at a time; lock always invalidates pending work. */
  async setupAsync(passphrase: string, signal?: AbortSignal): Promise<void> {
    this.#available(); checkCancelled(signal);
    if (this.status().initialized || existsSync(this.#dbPath())) throw new Error('Vault is already initialized');
    validatePassphrase(passphrase);
    this.#busy = true; const epoch = this.#epoch; const key = randomBytes(32);
    let archive: EncryptedArchive | undefined; let createdDatabase = false;
    try {
      const metadata = await wrapKeyAsync(passphrase, key, signal);
      this.#checkEpoch(epoch, signal);
      // Revalidate on-disk state after yielding; never overwrite an externally created vault.
      if (this.status().initialized || existsSync(this.#dbPath())) throw new Error('Vault is already initialized');
      createdDatabase = true; archive = new EncryptedArchive(this.#dbPath(), key);
      this.#writeMetadata(this.#saltPath(), metadata);
      this.#archive = archive; this.#key = Buffer.from(key);
    } catch (error) {
      archive?.close();
      if (createdDatabase && !existsSync(this.#saltPath())) for (const suffix of ['', '-wal', '-shm']) {
        try { unlinkSync(this.#dbPath() + suffix); }
        catch (cleanup) { if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanup; }
      }
      throw error;
    } finally { key.fill(0); this.#busy = false; }
  }
  async unlockAsync(passphrase: string, signal?: AbortSignal): Promise<void> {
    this.#available(); checkCancelled(signal);
    if (this.#archive) return;
    this.#checkRetry(); validatePassphrase(passphrase);
    if (!this.status().initialized) throw new Error('Vault must be set up first');
    if (!existsSync(this.#dbPath())) throw new Error('Vault database is missing; restore a backup');
    const metadata = readKeyMetadata(this.#saltPath()); const epoch = this.#epoch;
    this.#busy = true;
    let key: Buffer | undefined; let archive: EncryptedArchive | undefined;
    try {
      try { key = await unwrapKeyAsync(passphrase, metadata, signal); }
      catch (error) { this.#checkEpoch(epoch, signal); this.#fail(); }
      this.#checkEpoch(epoch, signal);
      // Produce the upgraded wrapper before opening SQLite. Never commit it before DB authentication.
      const upgrade = metadata.version === 1 ? await wrapKeyAsync(passphrase, key!, signal) : undefined;
      this.#checkEpoch(epoch, signal);
      if (!existsSync(this.#dbPath())) throw new Error('Vault database is missing; restore a backup');
      try { archive = new EncryptedArchive(this.#dbPath(), key!); } catch { this.#fail(); }
      if (upgrade) this.#writeMetadata(this.#saltPath(), upgrade);
      this.#archive = archive; this.#key = Buffer.from(key!);
      this.#failures = 0; this.#retryAfter = 0;
    } catch (error) { archive?.close(); throw error; }
    finally { key?.fill(0); this.#busy = false; }
  }
  async changePassphraseAsync(current: string, replacement: string, signal?: AbortSignal): Promise<void> {
    this.#available(); checkCancelled(signal);
    if (!this.#archive || !this.#key) throw new Error('Vault is locked');
    this.#checkRetry(); validatePassphrase(current); validatePassphrase(replacement);
    if (current === replacement) throw new Error('Passphrase must be different from the current one');
    const epoch = this.#epoch; this.#busy = true;
    let verified: Buffer | undefined;
    try {
      try { verified = await unwrapKeyAsync(current, readKeyMetadata(this.#saltPath()), signal); }
      catch (error) { this.#checkEpoch(epoch, signal); this.#fail(); }
      this.#checkEpoch(epoch, signal);
      if (!this.#key || verified!.length !== this.#key.length || !timingSafeEqual(verified!, this.#key)) this.#fail();
      const metadata = await wrapKeyAsync(replacement, verified!, signal);
      this.#checkEpoch(epoch, signal);
      this.#writeMetadata(this.#saltPath(), metadata);
      this.#failures = 0; this.#retryAfter = 0;
    } finally { verified?.fill(0); this.#busy = false; }
  }
  lock(): void {
    this.#epoch++;

    try { this.#archive?.close(); }
    finally { this.#archive = undefined; this.#key?.fill(0); this.#key = undefined; }
  }
}
