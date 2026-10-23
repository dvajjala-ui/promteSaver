import type { Surface } from '../contracts/generated.ts';

export interface CapturePolicy {
  enabled: boolean;
  paused: boolean;
  permissionGranted: boolean;
  allowedAppIds: readonly string[];
  excludedAppIds: readonly string[];
  retainDrafts: boolean;
}
export type CaptureState = 'disabled' | 'paused_by_user' | 'permission_missing' | 'excluded_surface' | 'protected_input' | 'context_unknown' | 'recording';

export function decideCapture(policy: CapturePolicy, surface: Surface): CaptureState {
  if (!policy.enabled) return 'disabled';
  if (policy.paused) return 'paused_by_user';
  if (!policy.permissionGranted) return 'permission_missing';
  if (surface.protection === 'protected') return 'protected_input';
  if (surface.privateMode || policy.excludedAppIds.includes(surface.appId)) return 'excluded_surface';
  if (!policy.allowedAppIds.includes(surface.appId) || surface.classification === 'other') return 'excluded_surface';
  if (surface.protection === 'unknown' || surface.classification === 'unknown') return 'context_unknown';
  return 'recording';
}
