# Verification report - v0.9

Date: 2026-10-23. Tests exercise the actual v0.9 working source. No real user vault or Groq key was used. No native Windows/macOS binary was produced.

## Executed and passed

| Check | Result | Evidence |
| --- | --- | --- |
| Full Node tests | 145/145, 0 failures/skips/cancellations | `verification/v0.9/all-tests.tap` |
| New core tests (included in 145) | 15/15 | `verification/v0.9/core-tests.tap` |
| MV3 worker unit tests (included in 145) | 7/7, Node VM with Chrome API doubles | `verification/v0.9/worker-unit.tap` |
| Existing app Chromium fixtures | 21/21 | `verification/browser-v0.9/report.json` |
| New AI/recorder Chromium fixtures | 23/23 | `verification/core-browser-v0.9/report.json` |
| TypeScript | Passed available 5.8.3 compiler and local installed Node types | `verification/v0.9/typecheck.txt` (empty successful stdout) |
| JavaScript syntax, contracts, versions | Passed | `verification/v0.9/source-checks.txt` |
| Desktop runtime source inclusion plan | New modules included; not a stage/build | `verification/v0.9/desktop-plan.txt` |

145 = 123 inherited tests + 15 core API/storage/provider-boundary tests + 7 worker tests. Core tests verify consent, local preview, preview-digest invalidation, encrypted provider settings, key exclusion, absence of implicit inference, lock cancellation, safe provider errors, timeout and rate limits, capture validation/dedup, evidence/copy separation, backup linkage and imported deletion propagation. Worker tests verify sender/permission scopes, trusted storage, no plaintext queue, expiry/revocation, response/concurrency bounds and loopback-only forwarding.

The Node integration tests use real HTTP servers and temporary encrypted SQLite databases. **The provider transport returns synthetic responses.** They prove request construction and failure handling, not Groq account/model availability or linguistic quality.

The new Chromium tests load the actual interface/recorder on `about:blank` synthetic documents. The recorder's origin dependency, extension messaging, fixture API and provider are mocked explicitly. Known-composer selectors, trusted Playwright input, Send/Enter behavior, debounce, exclusions, pause and failures are exercised. The actual recorder source is used, but this is **not a loaded MV3 extension on real websites**. Existing app tests also use simulated APIs. Screenshots are synthetic evidence, not live captures.

## Failed / blocked / not executed (not hidden)

- Live Chromium -> actual loopback server: `ERR_BLOCKED_BY_ADMINISTRATOR`. Report: `verification/v0.9/live-probe/report.json`. No policy bypass attempted.
- Navigation to a synthetic website origin with intercepted requests was likewise blocked; retained `blocked-site-fixture-probe.log`. Offline fixtures explicitly isolate the origin dependency instead of claiming a live host.
- Normal unpacked extension worker launch: no service-worker event within eight seconds. `verification/v0.9/extension-worker.json` records `blocked-or-failed`, no passed cases. VM worker tests are separate, not a substitute presented as installed validation.
- No live Groq call: credential absent from runtime. No user key solicited in chat or bundled.
- Node 24.16+/pinned compiler, real Windows/macOS runtime, native Tauri compilation, signed installation, true installed browser compatibility and 4/8 GiB hardware profiles were not run.

## Environment

Linux; Node 22.16.0 with experimental type stripping; TypeScript 5.8.3; Chromium 144.0.7559.96; Python Playwright. These are available development tools, not proof of the exact production/pinned toolchain. Neither package-manager network installation nor native compilation is implied.

## Resource samples

`verification/v0.9/node-profile.json`: isolated real Node service, 300 synthetic prompts; 163.39 ms service readiness, 1.48 ms median paged reads, 5.86 ms median distinct text query, 123.45 MiB sampled RSS, 0.0% of one core over a four-second idle sample. Browser, extension and provider work excluded. Readiness is not full UI readiness; RSS is not peak.

`verification/v0.9/chromium-profile.json`: 2,000 synthetic records, 20 visible cards in low-memory mode, four-times CPU throttle; 1,528.83 ms page/setup, 410.47 ms median search including debounce/fixture wait, 5.64 MiB JS heap, 554.53 MiB Chromium process-tree RSS, 1.5% sampled idle core usage. No overflow or page errors in that run. Full browser RSS is not incremental extension overhead or a Windows WebView prediction. These samples do not prove lower whole-app memory than v0.8.

## Reproduction

```sh
# Intended supported runtime:
npm run check
npm run test:core
python scripts/browser-smoke.py --mode fixture --output qa-baseline
python scripts/core-browser-tests.py --output qa-core
python scripts/browser-smoke.py --mode live --output qa-live
python scripts/extension-worker-check.py
python scripts/profile-resources.py --records 300 --idle-seconds 4 --output node-profile.json
python scripts/chromium-perf.py --items 2000 --low-memory --output chromium-profile.json
```

Here the test command was `node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs`; typecheck used the available compiler with an explicit installed typeRoots path. `npm run check` under the pinned toolchain was not asserted. Live commands are included to reproduce known limits on permitted devices, not labelled passing.

## Release decision

Source pilot acceptable for non-sensitive developer testing, with the caveats prominent. Not acceptable as a consumer all-app recorder or market-ready desktop release. Remaining acceptance checks are in [READINESS_V0_9.md](READINESS_V0_9.md), not converted into an unsupported percentage.
