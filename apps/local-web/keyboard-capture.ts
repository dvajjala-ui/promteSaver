import type { PromptRecord } from '../../packages/contracts/generated.ts';

/** The first native keyboard-triggered source is fixed to Notepad. Never accept a
 * client-selected process name or window title as proof of source identity. */
export function notepadSnapshot(input: unknown): PromptRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid Notepad snapshot');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['eventId', 'text', 'recordedAt'].includes(key)) ||
      typeof value.eventId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.eventId) ||
      typeof value.text !== 'string' || !value.text.trim() || value.text.length > 50_000 ||
      typeof value.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.recordedAt) ||
      !Number.isFinite(Date.parse(value.recordedAt)) || Math.abs(Date.now() - Date.parse(value.recordedAt)) > 300_000)
    throw new Error('Invalid Notepad snapshot');
  // The user-designated Notepad source is stored in the prompt inbox. This is
  // source approval, not a semantic determination that the text is a prompt.
  return {schemaVersion: 1, id: value.eventId, deviceId: 'windows-keyboard-notepad', sourceSequence: 1,
    recordedAt: value.recordedAt,
    surface: {surfaceId: 'notepad.exe', appId: 'notepad.exe', editorId: 'active-editor',
      classification: 'prompt', protection: 'normal', privateMode: false},
    text: value.text, quality: 'draft_snapshot', sourceMethod: 'editor_snapshot', origin: 'unknown', redactions: 0};
}
