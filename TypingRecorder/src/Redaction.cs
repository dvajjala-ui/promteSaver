// Conservative redaction of obvious credentials before captured text is written.
// Ported from packages/capture-core/redact.ts. This is NOT a secret classifier:
// it masks clear API keys / tokens, PEM private keys, "password = ..." style
// assignments and URL-embedded credentials, and leaves everything else untouched.
// Password / credential *windows* are already excluded upstream; this is a second
// net for a secret a user happens to type into an ordinary field.
//
// Each rule carries a match timeout so pathological input can never hang the
// capture thread, and the whole function is exception-safe.
using System;
using System.Text.RegularExpressions;

namespace TypingRecorder {

    internal static class Redaction {
        const string Placeholder = "[REDACTED]";
        static readonly TimeSpan MatchTimeout = TimeSpan.FromMilliseconds(250);

        static readonly Regex[] Rules = new Regex[] {
            // PEM private key blocks (terminated, or running to end of text).
            new Regex(
                @"-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----|$)",
                RegexOptions.None, MatchTimeout),
            // Well-known token shapes: OpenAI, Groq, GitHub, AWS access key id.
            new Regex(
                @"\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b",
                RegexOptions.None, MatchTimeout),
            // Authorization headers.
            new Regex(
                @"\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}={0,2}",
                RegexOptions.IgnoreCase, MatchTimeout),
            // key = value / key: value assignments for sensitive names.
            new Regex(
                @"\b(?:password|passwd|passphrase|api[_ -]?key|access[_ -]?token|client[_ -]?secret|secret)\s*[:=]\s*(?:""[^""\r\n]+""|'[^'\r\n]+'|[^\r\n,;]+)",
                RegexOptions.IgnoreCase, MatchTimeout),
            // Credentials embedded in a URL (user:pass@host).
            new Regex(
                @"https?://[^\s/@]+:[^\s/@]+@[^\s]+",
                RegexOptions.IgnoreCase, MatchTimeout)
        };

        /// <summary>Returns text with obvious secrets masked. Never throws.</summary>
        internal static string Mask(string text) { int n; return Mask(text, out n); }

        /// <summary>As Mask, also reporting how many secrets were masked.</summary>
        internal static string Mask(string text, out int count) {
            count = 0;
            if (string.IsNullOrEmpty(text)) return text;
            string result = text;
            for (int i = 0; i < Rules.Length; i++) {
                try {
                    int local = 0;
                    result = Rules[i].Replace(result, delegate { local++; return Placeholder; });
                    count += local;
                } catch (RegexMatchTimeoutException) {
                    // Pathological input for this rule: leave the text unchanged for it.
                } catch {
                    // Redaction must never break capture.
                }
            }
            return result;
        }
    }
}
