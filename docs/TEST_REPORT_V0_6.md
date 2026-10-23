# Verification report — v0.6 Writing Studio private beta

Date: 2026-10-22. Context: Linux x64 container, Node 22.16.0 compatibility runner; Chromium 144.0.7559.96; globally available TypeScript 5.8.x. Production intended toolchain Node 24.16.x and pinned TypeScript 7.0.2 has **not** been validated in this environment.

## Executed checks

| Check | Observed result | Boundary |
| --- | --- | --- |
| `npm run contracts:check` | Passed | Contract generation drift check |
| `npm run lint:browser` | Passed | JS syntax, not full application semantics |
| `npm run typecheck` | Passed | Available TS 5.8.x with an ephemeral pre-installed Node types link, not pinned TS 7.0.2 |
| `npm run test:compat` | **96 / 96 passed** | Node 22 TypeScript stripping, local backend and encrypted DB integration |
| `node --experimental-strip-types apps/harness/replay.ts` | Passed | Synthetic capture replay, not real recorder |
| `python scripts/browser-smoke.py --mode fixture` | **16 / 16 passed** | **Real Chromium DOM with mocked API**, not full E2E |
| Chromium desktop/mobile layout | Screenshots inspected, no horizontal scrolling in fixture | Synthetic fixture data, simulated HTTP responses |
| `node --experimental-strip-types scripts/bench-writing.ts 40` | Completed | CPU microbenchmark, no AI model or network requests |
| Browser-to-live-backend navigation | **Blocked** by `ERR_BLOCKED_BY_ADMINISTRATOR` | No attempt to bypass environment administrator policy |
| `node scripts/prepare-desktop.mjs --dry-run` and `node scripts/doctor.mjs` | Completed; staged source plan explicitly includes both writing-style modules and `writing.css` | **Plan-only**; Node 24 bundling and Rust compilation unverified |
| Native desktop install, Windows/Mac memory, real extension | **Not verified** | Source-only experimental Tauri host |

## Areas specifically exercised

- Profile create/edit/delete, metadata-only listing, DB ciphertext at rest, persistence across process restart, tamper detection, invalid/oversized profile rejection and bounded maximum profile count.
- Stale profile `ETag` conflicts; bearer-required profile API, auth failure and lock denial.
- Writing analysis and best-effort synthetic-secret redaction; generated instructions exclude excerpts and recurring phrases by default; include examples only on request.
- v3 portable snapshot includes profiles; preview is read-only; legacy v1/v2 compatibility; schema validation rejects malformed or smuggled style content; restore cap and non-duplicate IDs.
- Unicode/multibyte request framing regression: properly bounded input is accepted rather than rejected based only on its UTF-8 encoded length.
- Proofreading heuristics return bounded UTF-16 offsets, deterministic issue limits, and cannot auto-modify source; UI requires review and discards offsets after editing.
- Chromium Writing Studio UI: explicit excerpt storage toggle, two ways to export, profile reload/edit, proofreading Apply, clearing decrypted DOM on lock, responsive breakpoints.

## Synthetic writing CPU experiment

Read `verification/writing-v0.6/synthetic-benchmark.json` for exact input size, timing distribution and environment. On this Linux Node 22 build, 40 warm repeated operations observed **0.569 ms median style analysis**, **0.118 ms median proofreading**, and **0.002 ms median instruction generation** for synthetic samples. Node-process RSS snapshot was **75 MiB** during the benchmark. **This is not whole-app memory, not cold-start performance, and not a Windows/Mac claim.** Performance needs workload diversity and real-device p95/peak measurements before release.

## Known limitations

- Native Windows/Mac install and lifecycle untested. Tauri source requires its proper Node runtime packaging, Rust compilation, code-signing and platform-specific OS permissions.
- Browser fixture used mock in-page API, so cross-boundary browser fetch/auth/storage behavior remains a real-device and live-browser gate.
- No OS keychain, whole-file encryption, optional on-device full grammar model, remote style rewriting, OS-level popup, true automated prompt capture, or cloud sync.
- Snapshot size limits remain 12 MiB and 10,000 library/capture items per table, with writing profiles capped at 16. Large streaming backups not yet available.
- Best-effort regex redaction cannot remove every secret or personal detail; user review is essential.
