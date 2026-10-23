/**
 * Conservative recognizers for obvious credentials only. NOT a secret classifier.
 * Unknown/protected contexts must be rejected before reaching this function.
 * Unquoted credential values are redacted until a delimiter or line break, not
 * merely the first whitespace-separated word (avoids retaining password tails).
 */
const rules: readonly RegExp[] = [
  /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----|$)/g,
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]{12,}={0,2}/gi,
  /\b(?:password|passwd|passphrase|api[_ -]?key|access[_ -]?token|client[_ -]?secret|secret)\s*[:=]\s*(?:"[^"\r\n]+"|'[^'\r\n]+'|[^\r\n,;]+)/gi,
  /https?:\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi
];

export function redactText(text: string): { text: string; count: number } {
  let count = 0;
  let result = text;
  for (const rule of rules) result = result.replace(rule, () => { count++; return '[REDACTED]'; });
  return { text: result, count };
}
