# v0.8 verification report

> **Documentation scope (31 October 2026): Historical evidence.** Preserve the recorded environment and outcomes. These results do not certify the current build, another device or a real third-party source. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Date: 2026-10-23. Source: v0.7 ZIP plus changes documented in `CHANGES_FROM_V0_7.md`. All data used by this run was synthetic or a temporary test vault.

## Executed results

| Check | Observed result | Scope |
| --- | --- | --- |
| Baseline Node suite | 96/96 passed | Unmodified v0.7 behavior in the available runtime |
| Final Node suite | **123/123 passed**, no skips | Unit, encrypted storage, real HTTP, child lifecycle, concurrency and source-packaging helpers |
| Chromium UI | **21/21 passed**, no skips/errors | Actual HTML/CSS/JS using a simulated in-page API |
| Type checking | Passed | Available TS 5.8.3, Node types 25.1.0; not pinned TS 7.0.2 / types 24.19.2 |
| Contract generation consistency | Passed | Checked-in schema/generated contract comparison |
| JavaScript/MJS syntax | Passed | Application JS and tooling MJS |
| Synthetic capture replay | Passed | Existing harness, not native capture |
| Version consistency | Passed | Root/lock/server/Tauri/Cargo/helper version 0.8.0 |
| Desktop source staging plan | Passed | Read-only file plan, not executable staging |
| Staged-resource validation | Synthetic tests passed | Fake executable fixtures; missing/tampered/duplicate/path/symlink/version cases |
| Shell launcher syntax | Passed | `sh -n`; no macOS launch or PowerShell execution |
| Workflow YAML parsing | Passed | Static parsing only, not a GitHub Actions run |
| Live browser/service E2E | **Blocked/failing**, zero scenarios | Chromium navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR` |
| Native build preflight | **Refused unsupported runtime**, exit 1 | Node 22 is not allowed into native packages |
| Rust/Tauri build and installer tests | **Not run** | Rust toolchain / native SDKs unavailable; toolchain download probes failed DNS |

## Environment

Linux x64; Node 22.16.0 development compatibility mode; global TypeScript 5.8.3 and available Node typings 25.1.0; Chromium 144.0.7559.96 driven by Python Playwright. The project still targets Node >=24.16.0 <25, TypeScript 7.0.2 and Node typings 24.19.2. Native host manifests are source declarations, not evidence that dependencies resolved.

## What the 27 additional Node tests cover

15 async-security regressions: bounded lane overlap/cancellation/reuse, wrapper interoperability, yielding during KDF, no late setup/unlock, failed metadata writes, passphrase cancellation, legacy migration, backup tampering/cancellation, actual HTTP responsiveness, stale chunked requests across lock/unlock, shutdown draining, failed passphrase/migration writes, and a cancelled HTTP import leaving the library unchanged.

3 diagnostic tests: version classification, allowlisted content/stat-only aggregate sizes, real HTTP authorization/locked behavior and no idle renewal.

3 ranking tests: randomized full-sort equivalence, bounded complexity/retention and stable encrypted-library pagination.

5 additional packaging/release tests: artifact consistency/tamper, duplicate/traversal/untracked files, malformed/missing manifests, symlink roots/ancestors, and accidental vault metadata rejection; plus 1 cross-component version-drift test. Existing native-target and source-selection checks remain.

## Browser evidence

`verification/browser-v0.8/report.json` lists all 21 scenarios. Screenshots are actual Chromium renderings of production UI code populated by synthetic API fixtures. Device-health numbers shown in screenshots (including 102.4 MiB) are **not resource measurements**. Measured backend figures are in `PERFORMANCE_V0_8.md` instead.

Cancellation/reduced motion, narrow-screen diagnostics, profile consent/export, conflict recovery, templates, keyboard confirmation, bulk actions, pagination, preview hydration, backup review, passphrase lock, draft recovery and late/idle lock clearing are exercised. Fixture success does not establish native clipboard/file-dialog behavior, screen-reader quality or a real browser connection to the encrypted service.

One combined verification invocation exceeded the execution deadline; the browser driver ended with EPIPE when its parent was stopped. Its result was not counted. The separate final fixture rerun completed 21/21 on the same application code. The cause of that harness stall was not established.

## Commands actually executed

```sh
node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs
tsc --noEmit --typeRoots /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/node_modules/@types
node scripts/generate-contracts.mjs --check
node scripts/release-check.mjs
node --experimental-strip-types apps/harness/replay.ts
node scripts/prepare-desktop.mjs --dry-run
sh -n start-mac.command
python -u scripts/browser-smoke.py --mode fixture --output <temporary-evidence-directory>
python -u scripts/browser-smoke.py --mode live --output <temporary-evidence-directory>
node scripts/build-desktop.mjs
node --experimental-strip-types scripts/bench-responsiveness.ts
node --experimental-strip-types scripts/bench-reliability.ts 10000
```

The `/opt/...` typecheck path is specific to this environment, not a user setup requirement. For the intended toolchain use `npm ci --ignore-scripts` and `npm run check`. The final two failed preflight/integration commands are listed deliberately, not presented as successful checks.

## Release gates still open

Live browser E2E, native compilation and installed behavior, real Windows/macOS Node 24 acceptance, signed/notarized bundles, OS keychain, full database/WAL encryption, large archive/backup scaling, actual helper-site compatibility, screen readers, independent security review and whole-app low-spec performance. No GitHub write or remote workflow execution occurred.

Raw checked evidence: `verification/v0.8/node-tests.tap`, `checks.json`, `live-browser-blocked.json`, `staging-plan.json`, `responsiveness.json`, `search-v0.8.json`, and `search-v0.7-baseline.json`.
