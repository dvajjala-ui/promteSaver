export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export interface AISettings { apiKey: string; model: string; enabled: boolean; }
export class AIProblem extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function validateAISettings(value: unknown): AISettings {
  const v = value as AISettings;
  if (!v || typeof v !== 'object' || Array.isArray(v) ||
      Object.keys(v).some(k => !['apiKey','model','enabled'].includes(k)) ||
      typeof v.apiKey !== 'string' || !/^gsk_[A-Za-z0-9_-]{12,200}$/.test(v.apiKey) ||
      typeof v.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,99}$/.test(v.model) ||
      typeof v.enabled !== 'boolean') throw new AIProblem(400, 'Invalid Groq settings. Enter a Groq API key, model ID and explicit enable choice.');
  return {apiKey:v.apiKey, model:v.model, enabled:v.enabled};
}
