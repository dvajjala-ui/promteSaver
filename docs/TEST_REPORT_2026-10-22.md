# Verification and performance report — v0.2 local beta · 22 October 2026

> **Documentation scope (31 October 2026): Historical evidence.** Preserve the recorded environment and outcomes. These results do not certify the current build, another device or a real third-party source. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

## Tested build and reproducibility

Source: user-provided `promteSaver-main.zip` → earlier v0.1 source → v0.2 changes made in the working copy. No remote commits, user accounts, private keys or real prompt data were touched. Tests use synthetic strings only.

Execution environment: Linux x86_64 container with **Node 22.16.0 + `--experimental-strip-types`**, npm 10.9.2, built-in Node `node:sqlite`, and globally installed TypeScript compiler (`tsc --noEmit`). **Production target in `package.json` is Node 24.16.x with TS 7.0.2 pinned for dev**; that exact pinned combination was **not verified** here because registry access to one missing dependency was blocked. Actual Windows/macOS are not available to the test environment.

## Observed checks

| Test | Outcome | Interpretation |
| --- | --- | --- |
| `NODE_OPTIONS=--experimental-strip-types npm run check` | **PASS (39/39 tests)** | Contract generation check + available TypeScript type check + unit/integration suite |
| `node --check apps/local-web/public/app.js` | **PASS** | Local browser UI JS parses |
| `node --check apps/browser-helper/popup.js` | **PASS** | Extension popup JS parses |
| `node scripts/doctor.mjs` | **PASS** | Reports Node22 compatibility, OS type, available memory and presence of required source files, no vault data |
| Synthetic capture and policy regression tests | **PASS** | 26 original synthetic cases retained and run |
| New v0.2 storage/query/migration tests | **PASS** | Migration of missing v0.1 deleted column, source/notes search, facets, usage ranking, page boundaries, recoverable trash |
| Backup encryption, merge, corruption/wrong password | **PASS** | AES-GCM backup cannot be decoded without passphrase, imported items and histories roundtrip, modified file rejected, conflicts skipped |
| HTTP API integration | **PASS** | Auth, setup, unlock, CRUD, sort/filter/paging, history/trash, export/import; invalid request validation |
| Browser extension bridge API integration | **PASS** | Pairing, narrow extension Origin/CORS scope, local write-only behavior, lock/revoke/host checks, no unauthorized library read |
| SQLite/WAL canary inspection in tests | **PASS** | Selected synthetic prompt bodies absent in SQLite files; **not** full-file encryption |
| Live browser visual interaction | **NOT RUN** | Chromium sandbox in this environment blocked navigating to loopback with `ERR_BLOCKED_BY_ADMINISTRATOR` |
| Real extension on ChatGPT/Claude/Gemini | **NOT RUN** | Real user Chrome/Edge & site editor permission checks necessary |
| Windows/macOS install + background collector | **NOT RUN / NOT BUILT** | No native installers or collectors in this ZIP |
| Formal security, accessibility, power and E2E QA audit | **NOT RUN** | Public market release blocked |

Tests report **39/39 automated passing** in the available environment; this is not a claim of 39 end-to-end UI tests. The original synthetic capture test count is 26, the original v0.1 local/security addition was 8, and v0.2 adds 5 tests. Where error handling is simulated, real device behavior can differ.

## 5,000-record synthetic search benchmark

Command: `node --experimental-strip-types scripts/bench-beta.ts 5000` (single representative run).

| Metric | Observed |
| --- | ---: |
| Synthetic encrypted library items | 5,000 |
| Sampled search median | **49 ms** |
| Sampled search slowest of 10 (labelled p95 in script) | **88 ms** |
| Cold project/tag facets | **51 ms** |
| Cached facets | **under 1 ms rounded** |
| SQLite main file size | **5.7 MiB** |
| Node process RSS at end | **94 MiB** |

**Interpretation:** These are non-production, single-run synthetic values on Linux Node 22. The sample consists of **10 queries** and the script's "p95" is the last sampled latency, **not** a statistically sound service-level percentile. Actual browser/OS WebView RSS, Windows/macOS idle wakeups, cold startup, 4 GiB machine experience, long encrypted prompts, Unicode retrieval quality, disk durability, and native collectors are not measured. Repeat tests with 10k/50k and 100+ queries per machine before performance marketing.

## High-risk manual checklist when opening on the user's devices

1. Windows 10/11 & macOS: Node 24.16, power shell/terminal launcher, first-run vault, restart/unlock.
2. Readable/high-contrast screen, keyboard-only Create/Edit/Search/Template/Backup, `Ctrl/Cmd+K` and `Ctrl/Cmd+N`, screen reader smoke.
3. Save/restore from Trash; version history and duplicate; verify no plaintext DB, error logs, or browser console leaking sensitive values.
4. Export `.pomte` with long passphrase; import to **new vault** and verify metadata/history; test wrong password, corrupted file and merge duplicates.
5. Chrome and Edge extension on each permitted AI site with a *synthetic* prompt, required editor focus, secret/search field blocking, incognito exclusion, pair/revoke/lock. Do not try with actual credentials.
6. Observe Node + browser combined idle RAM/CPU and power with Task Manager/Activity Monitor; collect numbers for 4–8 GiB reference systems. Check no remote requests.

The release remains a **developer beta**, not a certified secure vault or native recorder. See `docs/MARKET_READINESS_GATES.md` for hard public launch blockers.
