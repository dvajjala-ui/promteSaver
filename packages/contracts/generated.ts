// Generated from capture.schema.json. Run npm run contracts:generate.

export interface Surface {
  surfaceId: string;
  appId: string;
  editorId: string;
  classification: "prompt" | "other" | "unknown";
  protection: "normal" | "protected" | "unknown";
  privateMode: boolean;
  title?: string;
}

export interface Observation {
  schemaVersion: 1;
  id: string;
  deviceId: string;
  sequence: number;
  recordedAt: string;
  kind: "snapshot" | "submit" | "focus" | "gap";
  sourceMethod: "editor_snapshot" | "submission_hook" | "synthetic_replay" | "local_transcript";
  origin: "user" | "suggestion" | "mixed" | "unknown";
  surface: Surface;
  text?: string;
  complete?: boolean;
  sourceMessageId?: string;
}

export interface PromptRecord {
  schemaVersion: 1;
  id: string;
  deviceId: string;
  sourceSequence: number;
  recordedAt: string;
  surface: Surface;
  text: string;
  quality: "exact_submitted" | "draft_snapshot" | "partial";
  sourceMethod: "editor_snapshot" | "submission_hook" | "synthetic_replay" | "local_transcript";
  origin: "user" | "suggestion" | "mixed" | "unknown";
  redactions: number;
  sourceMessageId?: string;
}
