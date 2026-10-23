# v0.4 Verification: evidence and limitations

- Date: 22 October 2026; environment Linux, Node 22.16.0 compatibility, Chromium 144.0.7559.96, global TypeScript 5.8.3 with an ephemeral preinstalled local type-definition link.
- `npm run test:compat`: **81/81 passed**. Includes 77 inherited tests, three encrypted draft/API/storage tests, one 90k-character preview rehydration HTTP test. Synthetic fixture only; some tests run a **real loopback Node server** but not a browser connected to it.
- `tsc --noEmit`: passes using the available TypeScript 5.8.3, **not** the pinned 7.0.2 project toolchain; pinned Node 24 + exact dependencies must still be validated in CI.
- `python scripts/browser-smoke.py --mode fixture`: **15/15** passes in Chromium, real DOM and Playwright, mocked in-page API. Includes keyboard, backup review, conflict, passphrase, recoverable draft and long-body on-demand hydration. No actual network or CSP E2E claim.
- `python scripts/browser-smoke.py --mode live`: **blocked** by administrator's browser loopback policy, `ERR_BLOCKED_BY_ADMINISTRATOR`; no security-policy bypass attempted and no silent fixture fallback.
- `python scripts/profile-resources.py`: synthetic isolated local service measured; see [resource budgets](RESOURCE_BUDGET_V0_4.md).
- `python scripts/chromium-perf.py` normal/low-memory modes: Chromium UI profiling only, not a native WebView or an actual HTTP backend.
- `node --experimental-strip-types scripts/bench-reliability.ts 10000`: 10k synthetic record benchmark; [resource budget](RESOURCE_BUDGET_V0_4.md).
- `npm run contracts:check`, `npm run lint:browser`, `npm run typecheck`, synthetic replay in Node 22 with `node --experimental-strip-types apps/harness/replay.ts`, ZIP structure and checksum: see generated source logs under `docs/verification/v0.4/` when present.

## Remaining unverified gates

- Native Windows/macOS build and installed package, bundled Node24 sidecar, system WebView2/WKWebView, startup with many background apps, sleep/lock/lid-close, memory leak soak, accessibility via NVDA/VoiceOver.
- Live browser-to-real-service E2E, actual Chrome/Edge extension installation, real-source editor exclusion tests, OS keychain, full-file database/WAL encryption, signed releases.
- Synthetic samples and cold-cache counts are small; no hardware or security audit certification is implied by passing test totals.

**Compatibility caveat:** On Node 22.16, the unmodified `npm run demo` command cannot execute the `.ts` file without `--experimental-strip-types` (`ERR_UNKNOWN_FILE_EXTENSION`); rerunning with that flag passes. Node 24 is the supported target. `docs/verification/v0.4/synthetic-replay.txt` contains the successful compatibility run.
