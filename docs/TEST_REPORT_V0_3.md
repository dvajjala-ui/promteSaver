# v0.3 verification report - 22 October 2026

## Provenance and scope

Source base: uploaded `promteSaver-v0.2-enhanced-local-beta.zip`. The v0.2 baseline passed all 39 tests before editing. This report records actual commands/results, not a projected CI status. All records, passwords and prompts used for tests/benchmarks are synthetic. No user vault or private SSH key is packaged.

Environment: Linux x64, Node 22.16.0 compatibility mode, installed TypeScript 5.8.3, Chromium 144.0.7559.96. Node 24.16+ is the intended production branch; the exact pinned TypeScript 7.0.2 and Node types 24.19.2 dependency installation was not repeated. No Rust toolchain was available. No Windows/macOS device or real AI-site extension test was performed.

## Results

| Verification | Result | Evidence |
| --- | --- | --- |
| Original baseline | 39/39 passing | Observed before changes; baseline retained outside source deliverable |
| Current Node unit/integration tests | **77/77 passed**, no skipped tests | [node-tests.tap](verification/node-tests.tap) |
| Browser UI fixture | **13/13 scenarios passed**, no page errors | [report.json](verification/browser/report.json), [run log](verification/browser-fixture.txt) |
| Capture contract generation drift | Passed | `node scripts/generate-contracts.mjs --check` |
| Browser JavaScript syntax | Passed | `npm run lint:browser` |
| Offline TypeScript check | Passed, no diagnostics | Installed TS5.8.3 + global Node typings; not pinned TS7 certification |
| Synthetic capture replay | Passed | `node --experimental-strip-types apps/harness/replay.ts` |
| Runtime resource staging plan | Passed read-only source/target validation | Unit tests and `desktop:plan`; runtime copy not performed |
| 5k and 10k backend benchmark | Completed | [5k](verification/benchmark-5000.json), [10k](verification/benchmark-10000.json) |
| Live browser + actual HTTP E2E | **Not verified** | Initial attempt failed `net::ERR_BLOCKED_BY_ADMINISTRATOR` on loopback navigation |
| Native Rust/Tauri compile and installer | **Not verified** | No toolchain; no fabricated binary, lockfile or CI result |

## What the 77 tests cover

The original contracts/policy/reconciliation/redaction/storage suite remains, plus library CRUD/history/trash/search, HTTP authorization/CORS, encrypted backup behavior, and new fault cases:

- V2 wrapped key setup; wrong password; atomic key-write failure; legacy migration failure; retained ciphertext/history/preferences; missing database fails closed.
- Edit tokens, conservative conflict rejection, history preservation, all-or-none batches, rollback after an injected SQL trigger error.
- Query-cache invalidation after internal/external writes; defensive facet copies; encrypted preference validation.
- Snapshot preview without writes; tombstones suppressing deleted capture resurrection; malformed/duplicate/future history rejection.
- Observational status polling; active-user deadline renewal; strict Content-Type; Unicode prompt byte budgeting.
- Origin-bound extension write token; revocation while a request body is in flight survives subsequent unlock.
- Actual spawned desktop-service child handshake, lock, restricted commands, input limits, parent EOF, graceful shutdown and data reopen.
- Exclusive service leases, failed bind cleanup, live-owner recovery refusal and explicit stale-owner recovery.
- Pure single-pass template expansion, inserted syntax remaining literal, variable/output bounds and malformed token handling.
- Desktop packaging allowlist and target/architecture validation without copying a runtime.

## What the Chromium scenarios do and do not prove

`browser-smoke.py --mode fixture` loads the **actual HTML/CSS/JavaScript** into Chromium with an explicit in-page API fixture. No network request is intercepted to circumvent policy; no browser security policy is changed. A fixture backup is mock JSON and is never described as an encryption test. Actual backup encryption is independently tested in the Node suite.

The scenarios exercise setup/example library, field clearing, ETag recovery UI, literal templates, dirty-editor confirmation, bulk move, bounded pagination, low-memory/compact settings, quick-finder keyboard state, backup preview/confirm, incorrect/current replacement password flows, responsive layout, lock with a late response, and accelerated idle hiding. There are 13 named scenarios with multiple assertions; they are not 13 native end-to-end tests.

`--mode live` is supplied for machines that permit browser loopback. It starts a synthetic temporary server, uses the real API and records an explicit result. It does not silently switch to fixture mode. Run it on the user's Windows/Mac setup and in capable CI before raising readiness claims.

Screenshots are synthetic data: [desktop](verification/browser/desktop-library.png), [mobile](verification/browser/mobile-library.png), [settings](verification/browser/privacy-settings.png). They were visually inspected; a 390px layout check confirmed no horizontal overflow. No NVDA/VoiceOver/WCAG conformance is claimed.

## Benchmark interpretation

5,000 records: distinct query p50 98.34ms, p95 107.19ms; identical cached-query p50 0.77ms; sampled Node RSS 106.98MiB.

10,000 records: distinct query p50 124.88ms, p95 148.69ms; identical cached-query p50 0.61ms; sampled Node RSS 114.88MiB.

Each run has ten distinct search samples and twenty repeated-query samples. Query misses still scan/decrypt rows. Dataset and machine scheduling differ from v0.2, so no direct improvement ratio is claimed. These are not peak measurements, not browser/webview memory, not 50k certification and not guarantees for 4GiB Windows/Mac devices.

## Reproduce

Supported target toolchain:

```sh
npm ci --ignore-scripts
npm run check
npm run demo
npm run bench:reliability
python scripts/browser-smoke.py --mode live
```

Offline compatibility commands actually used here:

```sh
node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs
node scripts/generate-contracts.mjs --check
node --check apps/local-web/public/app.js
node --experimental-strip-types apps/harness/replay.ts
node --experimental-strip-types scripts/bench-reliability.ts 5000
node --experimental-strip-types scripts/bench-reliability.ts 10000
python scripts/browser-smoke.py --mode fixture --browser /usr/bin/chromium
```

Typecheck used `tsc --noEmit --typeRoots /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/node_modules/@types` in this environment only. Do not copy that machine-specific path as a user prerequisite. Install project dev dependencies and run `npm run typecheck` on a network-enabled development machine instead.
