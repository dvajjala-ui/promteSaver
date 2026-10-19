import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import type { Observation, PromptRecord } from './generated.ts';

const schema = JSON.parse(readFileSync(new URL('./capture.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true, strictRequired: false, allErrors: false });
ajv.addSchema(schema);
const observationValidator = ajv.compile<Observation>({ $ref: `${schema.$id}#/$defs/Observation` });
const promptValidator = ajv.compile<PromptRecord>({ $ref: `${schema.$id}#/$defs/PromptRecord` });

function validDate(value: string): boolean {
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString() === value;
}
export function assertObservation(value: unknown): asserts value is Observation {
  if (!observationValidator(value) || !validDate(value.recordedAt)) throw new Error('Invalid observation');
  if (value.kind === 'submit' && value.text !== undefined && value.complete === undefined) throw new Error('Invalid observation');
}
export function assertPromptRecord(value: unknown): asserts value is PromptRecord {
  if (!promptValidator(value) || !validDate(value.recordedAt)) throw new Error('Invalid prompt record');
  if (value.surface.classification !== 'prompt' || value.surface.protection !== 'normal' || value.surface.privateMode) {
    throw new Error('Ineligible prompt surface');
  }
}
