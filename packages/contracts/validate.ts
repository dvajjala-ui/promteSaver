import { readFileSync } from 'node:fs';
import type { Observation, PromptRecord } from './generated.ts';
import { allowedDesktopFieldSource } from './desktop-source.ts';

/**
 * Tiny fail-closed JSON-schema subset for the currently checked-in capture contract.
 * No runtime packages are required for local-only operation. If the schema gains a
 * keyword, validation refuses to start until this validator is updated.
 * This is NOT a general JSON Schema implementation.
 */
type Schema = {
  $ref?: string; type?: string; additionalProperties?: boolean; required?: string[];
  properties?: Record<string, Schema>; const?: unknown; enum?: unknown[];
  minimum?: number; maximum?: number; minLength?: number; maxLength?: number;
  pattern?: string; allOf?: Schema[]; if?: Schema; then?: Schema;
  not?: Schema; anyOf?: Schema[];
};
const document = JSON.parse(readFileSync(new URL('./capture.schema.json', import.meta.url), 'utf8')) as {
  $defs: Record<string, Schema>;
};
const supported = new Set(['$ref','type','additionalProperties','required','properties','const',
  'enum','minimum','maximum','minLength','maxLength','pattern','allOf','if','then','not','anyOf']);

function auditSchema(node: Schema, seen = new Set<object>()): void {
  if (seen.has(node)) return;
  seen.add(node);
  for (const key of Object.keys(node)) if (!supported.has(key)) throw new Error(`Unsupported contract keyword: ${key}`);
  Object.values(node.properties ?? {}).forEach(child => auditSchema(child, seen));
  node.allOf?.forEach(child => auditSchema(child, seen));
  node.anyOf?.forEach(child => auditSchema(child, seen));
  if (node.if) auditSchema(node.if, seen);
  if (node.then) auditSchema(node.then, seen);
  if (node.not) auditSchema(node.not, seen);
  if (node.$ref && !/^#\/\$defs\/[A-Za-z]+$/.test(node.$ref)) throw new Error('Unsupported contract reference');
}
for (const definition of Object.values(document.$defs)) auditSchema(definition);

function validate(value: unknown, rule: Schema, depth = 0): boolean {
  if (depth > 16) return false;
  if (rule.$ref) {
    const target = document.$defs[rule.$ref.split('/').at(-1)!];
    return !!target && validate(value, target, depth + 1);
  }
  if (rule.type === 'object' || rule.properties || rule.required || rule.additionalProperties !== undefined) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const fields = value as Record<string, unknown>;
    if (rule.required?.some(key => !(key in fields))) return false;
    if (rule.additionalProperties === false && Object.keys(fields).some(key => !(key in (rule.properties ?? {})))) return false;
    for (const [key, child] of Object.entries(rule.properties ?? {})) {
      if (Object.hasOwn(fields, key) && !validate(fields[key], child, depth + 1)) return false;
    }
  } else if (rule.type === 'string') {
    if (typeof value !== 'string') return false;
    if (rule.minLength !== undefined && [...value].length < rule.minLength) return false;
    if (rule.maxLength !== undefined && [...value].length > rule.maxLength) return false;
    if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) return false;
  } else if (rule.type === 'integer') {
    if (!Number.isSafeInteger(value)) return false;
    if (rule.minimum !== undefined && (value as number) < rule.minimum) return false;
    if (rule.maximum !== undefined && (value as number) > rule.maximum) return false;
  } else if (rule.type === 'boolean' && typeof value !== 'boolean') return false;
  else if (rule.type && !['object','string','integer','boolean'].includes(rule.type)) return false;
  if (Object.hasOwn(rule, 'const') && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.allOf && !rule.allOf.every(x => validate(value, x, depth + 1))) return false;
  if (rule.if && validate(value, rule.if, depth + 1) && rule.then && !validate(value, rule.then, depth + 1)) return false;
  if (rule.not && validate(value, rule.not, depth + 1)) return false;
  if (rule.anyOf && !rule.anyOf.some(x => validate(value, x, depth + 1))) return false;
  return true;
}
function validDate(value: string): boolean {
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString() === value;
}
export function assertObservation(value: unknown): asserts value is Observation {
  if (!validate(value, document.$defs.Observation!) || !validDate((value as Observation).recordedAt)) throw new Error('Invalid observation');
  if ((value as Observation).kind === 'submit' && (value as Observation).text !== undefined && (value as Observation).complete === undefined) throw new Error('Invalid observation');
}
export function assertPromptRecord(value: unknown): asserts value is PromptRecord {
  if (!validate(value, document.$defs.PromptRecord!) || !validDate((value as PromptRecord).recordedAt)) throw new Error('Invalid prompt record');
  const record = value as PromptRecord;
  const ordinaryPrompt = record.surface.classification === 'prompt';
  const approvedFieldDraft = record.surface.classification === 'unknown' &&
    record.deviceId === 'windows-focused-field' && record.quality === 'draft_snapshot' &&
    record.sourceMethod === 'editor_snapshot' && record.surface.editorId === 'focused-field' &&
    record.surface.surfaceId === record.surface.appId &&
    allowedDesktopFieldSource(record.surface.appId);
  if ((!ordinaryPrompt && !approvedFieldDraft) || record.surface.protection !== 'normal' || record.surface.privateMode)
    throw new Error('Ineligible prompt surface');
}
