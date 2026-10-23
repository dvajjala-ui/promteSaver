/** A single bounded lane for expensive cryptographic work. No background queue. */
export class OperationBusyError extends Error {
  constructor() { super('Another secure operation is running; retry shortly'); }
}
export class OperationCancelledError extends Error {
  constructor() { super('Operation cancelled; unlock the vault and try again'); }
}
export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new OperationCancelledError();
}
export type SecureOperation = 'setup' | 'unlock' | 'passphrase' | 'backup-export' | 'backup-import' | 'backup-preview';

export class WorkGate {
  #controller: AbortController | undefined;
  #operation: SecureOperation | null = null;
  #idle: Promise<void> = Promise.resolve();
  get operation(): SecureOperation | null { return this.#operation; }
  /** Cancellation discards the result; native scrypt cannot be interrupted once started. */
  cancel(): void { this.#controller?.abort(); }
  whenIdle(): Promise<void> { return this.#idle; }
  async run<T>(kind: SecureOperation, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.#controller) throw new OperationBusyError();
    const controller = new AbortController();
    this.#controller = controller; this.#operation = kind;
    let release!: () => void;
    this.#idle = new Promise<void>(resolve => { release = resolve; });
    try {
      checkCancelled(controller.signal);
      const result = await task(controller.signal);
      checkCancelled(controller.signal);
      return result;
    } finally {
      this.#controller = undefined; this.#operation = null; release();
    }
  }
}
