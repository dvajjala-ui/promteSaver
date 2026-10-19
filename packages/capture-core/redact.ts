// Deliberately limited recognizers. Scope/protected-field checks are the first line of exclusion.
const rules: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/g,
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}/gi,
  /\b(?:password|passwd|api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\s,;]+)/gi,
  /https?:\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi
];

export function redactText(text: string): { text: string; count: number } {
  let count = 0;
  let result = text;
  for (const rule of rules) result = result.replace(rule, () => { count++; return '[REDACTED]'; });
  return { text: result, count };
}
