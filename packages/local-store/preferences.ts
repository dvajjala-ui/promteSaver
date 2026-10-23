/** Stored inside authenticated, encrypted archive metadata, never browser localStorage. */
export interface VaultPreferences {
  idleMinutes: number;
  lowMemory: boolean;
  compactMode: boolean;
  lockOnHide: boolean;
}
export const DEFAULT_PREFERENCES: Readonly<VaultPreferences> = Object.freeze({
  idleMinutes: 15, lowMemory: false, compactMode: false, lockOnHide: false
});
export function validatePreferences(input: unknown): VaultPreferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid preferences');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !Object.hasOwn(DEFAULT_PREFERENCES, key)) ||
      !Number.isInteger(value.idleMinutes) || (value.idleMinutes as number) < 1 || (value.idleMinutes as number) > 120 ||
      typeof value.lowMemory !== 'boolean' || typeof value.compactMode !== 'boolean' || typeof value.lockOnHide !== 'boolean')
    throw new Error('Invalid preferences');
  return { idleMinutes: value.idleMinutes as number, lowMemory: value.lowMemory,
    compactMode: value.compactMode, lockOnHide: value.lockOnHide };
}
