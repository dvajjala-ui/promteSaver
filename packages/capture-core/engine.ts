import { createHash } from 'node:crypto';
import type { Observation, PromptRecord } from '../contracts/generated.ts';
import { assertObservation } from '../contracts/validate.ts';
import { decideCapture } from './policy.ts';
import type { CapturePolicy, CaptureState } from './policy.ts';
import { redactText } from './redact.ts';

export interface PromptSink { put(record: PromptRecord): boolean; }
interface Draft { event: Observation; text: string; redactions: number; }
export interface CaptureResult { state: CaptureState | 'gap' | 'stale' | 'empty'; persisted: boolean; }

/** Single-device, single-active-editor reconciliation. No keyboard reconstruction is invented. */
export class CaptureEngine {
  #policy: CapturePolicy;
  #sink: PromptSink;
  #deviceId: string;
  #lastSequence = 0;
  #active: Draft | undefined;

  constructor(deviceId: string, policy: CapturePolicy, sink: PromptSink) {
    this.#deviceId = deviceId;
    this.#policy = structuredClone(policy);
    this.#sink = sink;
  }
  setPolicy(policy: CapturePolicy): void {
    this.#policy = structuredClone(policy);
    this.#active = undefined; // No draft survives changed scope, pause, or permission state.
  }
  clear(): void { this.#active = undefined; }

  ingest(input: unknown): CaptureResult {
    assertObservation(input);
    const event = input;
    if (event.deviceId !== this.#deviceId) throw new Error('Unexpected device');
    if (event.sequence <= this.#lastSequence) return { state: 'stale', persisted: false };
    const previousSequence = this.#lastSequence;
    if (this.#lastSequence !== 0 && event.sequence !== this.#lastSequence + 1) this.clear();
    this.#lastSequence = event.sequence;
    const state = decideCapture(this.#policy, event.surface);
    if (state !== 'recording') { this.clear(); return { state, persisted: false }; }
    if (event.kind === 'gap' || event.kind === 'focus') { this.clear(); return { state: event.kind === 'gap' ? 'gap' : state, persisted: false }; }
    if (this.#active && !sameEditor(this.#active.event, event)) this.clear();
    if (event.text !== undefined) {
      const clean = redactText(event.text);
      // Source metadata can contain secrets too. Sanitize before any retained record is built.
      const safeEvent = structuredClone(event);
      let metadataRedactions = 0;
      for (const key of ['surfaceId', 'appId', 'editorId', 'title'] as const) {
        const value = safeEvent.surface[key];
        if (value !== undefined) { const cleanValue = redactText(value); safeEvent.surface[key] = cleanValue.text; metadataRedactions += cleanValue.count; }
      }
      if (safeEvent.sourceMessageId !== undefined) {
        const cleanId = redactText(safeEvent.sourceMessageId);
        safeEvent.sourceMessageId = cleanId.text;
        metadataRedactions += cleanId.count;
      }
      // Never retain the unfiltered snapshot in the in-memory draft.
      safeEvent.text = clean.text;
      this.#active = { event: safeEvent, text: clean.text, redactions: clean.count + metadataRedactions };
    }
    const draft = this.#active;
    if (!draft || !draft.text.trim()) { this.clear(); return { state: 'empty', persisted: false }; }
    if (event.kind === 'snapshot' && !this.#policy.retainDrafts) return { state, persisted: false };
    const record = toRecord(draft, event);
    let persisted: boolean;
    try { persisted = this.#sink.put(record); }
    catch (error) {
      // Persistence failures must remain retryable; the retained draft is already filtered.
      this.#lastSequence = previousSequence;
      throw error;
    }
    if (event.kind === 'submit') this.clear();
    return { state, persisted };
  }
}

function sameEditor(a: Observation, b: Observation): boolean {
  return a.surface.surfaceId === b.surface.surfaceId && a.surface.editorId === b.surface.editorId && a.surface.appId === b.surface.appId;
}
function toRecord(draft: Draft, event: Observation): PromptRecord {
  // Scope IDs are opaque. Hashing avoids separator collisions across device/source identities.
  const id = createHash('sha256').update(JSON.stringify([event.deviceId, event.id])).digest('hex');
  return {
    schemaVersion: 1, id, deviceId: event.deviceId, sourceSequence: event.sequence,
    recordedAt: event.recordedAt, surface: draft.event.surface, text: draft.text,
    quality: draft.event.complete !== true ? 'partial' : event.kind === 'submit' ? 'exact_submitted' : 'draft_snapshot',
    sourceMethod: draft.event.sourceMethod, origin: draft.event.origin, redactions: draft.redactions,
    ...(draft.event.sourceMessageId !== undefined ? { sourceMessageId: draft.event.sourceMessageId } : {})
  };
}
