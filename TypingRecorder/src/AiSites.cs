// First-class AI-prompt classification (feature 3.3).
//
// Decides whether a captured entry's website host belongs to a known AI chat
// site and, if so, gives it a friendly display label. The classification feeds
// the "AI" library filter and the Site grouping. It is a pure, in-memory lookup:
// nothing is written to disk, so the table is always current and no migration is
// ever needed. The host -> label table is kept in ONE place below so the owner
// can extend it.
//
// The list is the union of the browser companion's permitted hosts
// (apps/browser-helper/popup.js) and the local service bridge hosts
// (apps/local-web/server.ts) as of v0.9. Captured hosts are untrusted data and
// are only ever compared here, never executed.
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace TypingRecorder {

    /// <summary>Static table of known AI chat hosts and their display labels.</summary>
    internal static class AiSites {

        // host -> friendly label, in a single ordered place the owner can extend.
        // Both "perplexity.ai" and "www.perplexity.ai" are listed to mirror the
        // service bridge host set; "www." is also stripped at match time (below),
        // so either spelling classifies regardless.
        static readonly string[] Order;
        static readonly Dictionary<string, string> Map;
        static readonly ReadOnlyCollection<string> HostList;

        static AiSites() {
            string[][] seed = new string[][] {
                new string[] { "chatgpt.com",           "ChatGPT" },
                new string[] { "chat.openai.com",       "ChatGPT" },
                new string[] { "claude.ai",             "Claude" },
                new string[] { "gemini.google.com",     "Gemini" },
                new string[] { "aistudio.google.com",   "Google AI Studio" },
                new string[] { "perplexity.ai",         "Perplexity" },
                new string[] { "www.perplexity.ai",     "Perplexity" },
                new string[] { "copilot.microsoft.com", "Copilot" },
                new string[] { "poe.com",               "Poe" },
                new string[] { "chat.deepseek.com",     "DeepSeek" },
                new string[] { "grok.com",              "Grok" }
            };
            Order = new string[seed.Length];
            Map = new Dictionary<string, string>(seed.Length, StringComparer.Ordinal);
            for (int i = 0; i < seed.Length; i++) {
                Order[i] = seed[i][0];
                Map[seed[i][0]] = seed[i][1];
            }
            HostList = new ReadOnlyCollection<string>(Order);
        }

        /// <summary>True when the host is a known AI chat site (exact host or a subdomain of one).</summary>
        internal static bool IsAiPrompt(string host) {
            return MatchLabel(host) != null;
        }

        /// <summary>Friendly label for a known AI chat host, or null when the host is not an AI site.</summary>
        internal static string Label(string host) {
            return MatchLabel(host);
        }

        /// <summary>The known AI hosts, in declared order. Read-only; safe to share.</summary>
        internal static ICollection<string> Hosts() {
            return HostList;
        }

        // -- matching ----------------------------------------------------------

        // Returns the label for a host that equals, or is a subdomain of, a known
        // host; otherwise null. "www." is stripped from the candidate only (the
        // table already carries the bare host), and comparisons are ordinal on a
        // lower-cased host. Because only full hosts such as "gemini.google.com"
        // are stored (never "google.com"), an unrelated host like "mail.google.com"
        // never matches.
        static string MatchLabel(string host) {
            string h = Normalize(host);
            if (h == null) return null;

            string exact;
            if (Map.TryGetValue(h, out exact)) return exact;

            for (int i = 0; i < Order.Length; i++) {
                string k = Order[i];
                // h ends with "." + k, with at least one non-empty label before
                // the dot (so "gemini.google.com" does not match ".google.com").
                if (h.Length > k.Length + 1 &&
                    h[h.Length - k.Length - 1] == '.' &&
                    h.EndsWith(k, StringComparison.Ordinal)) {
                    return Map[k];
                }
            }
            return null;
        }

        // Trim, lower-case, and drop a single leading "www." for matching.
        static string Normalize(string host) {
            if (host == null) return null;
            string h = host.Trim();
            if (h.Length == 0) return null;
            h = h.ToLowerInvariant();
            if (h.StartsWith("www.", StringComparison.Ordinal)) h = h.Substring(4);
            return h.Length == 0 ? null : h;
        }
    }
}
