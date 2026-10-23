# Verification report - v0.9

Date: 2026-10-23. Tests exercise the actual v0.9 working source. No real user vault or Groq key was used. No native Windows/macOS binary was produced.

## Windows working-branch increment, 2026-10-23

Branch: `codex/contextual-recall`. This section describes subsequent development; the original v0.9 release evidence below remains historical. The increment adds explicit local related-prompt recall in the editor and closes a concurrent bridge-write rate-limit race. All tests used synthetic prompts and temporary vaults.

| Check | Observed result | Scope |
| --- | --- | --- |
| `npm run check` with pinned development dependencies | Passed: release metadata, generated contracts, TypeScript 7.0.2, browser JS syntax and 147/147 Node tests | Windows x64, Node 24.18.0 |
| `python scripts/browser-smoke.py --mode fixture` | 22/22 scenarios passed, including recall and review before adding a source to a draft | Chrome 156.0.8078.47, mocked in-page API |
| `python scripts/browser-smoke.py --mode live` | 15/15 executed scenarios passed, including recall through real loopback HTTP; one accelerated idle scenario skipped by design | Chrome 156.0.8078.47, real temporary encrypted SQLite vault; no installed extension |
| `npm run bench:reliability` | 5,000 synthetic items; explicit recall median 255.20 ms, p95 311.11 ms across ten distinct requests; sampled Node RSS 89.5 MiB | Node process only; browser memory and peak usage excluded |

The new Node tests verify local ranking, authorization, lock and deletion behavior, capture-source labeling, and a 16-request concurrency case that admits exactly 15 bridge writes. The browser fixture and live run verify that a user can open the editor, request related sources, reject a source changed after preview, fetch the current full source, add it to the draft, and keep the result unsaved until they act. This is keyword-overlap recall, not learned personal rules or suggestions inside other applications. Both browser runs used local Chrome; they do not establish real ChatGPT/Claude/Gemini capture, installed MV3 worker behavior, a live Groq response, native installers or Mac results. The historical blocked live probe below was on a different environment and is not a current Windows result.

For the Windows browser commands, Python 3.14 required `PYTHONUTF8=1` to read the UTF-8 source. The pinned npm dev dependencies and Python Playwright 1.64.1 were installed for verification; the runtime dependency set did not change. Test screenshots and reports were written to temporary folders rather than committed with vault data.

One `npm run check` attempt ran alongside Chrome fixture QA and finished 146/147: the existing backup-import cancellation test did not observe its brief pending state within its polling window. The same full check passed 147/147 when run on its own. The overlap failure was a timing-sensitive test signal under load, not a demonstrated backup mutation; the release-pilot increment below replaces that timing-dependent setup.

## Windows release-pilot increment, 2026-10-23

Branch: `codex/release-pilot`. The unpacked MV3 probe now launches full Playwright Chromium 156.0.8078.4 instead of Chrome Headless Shell, which cannot load extensions. With a fresh temporary browser profile, **7/7 scoped checks passed**: actual worker startup/manifest, trusted Chrome storage, default-off state, sender rejection, pairing revocation, no token disclosure to content state, and no injection on a synthetic approved-origin page before optional permission. Evidence: `verification/windows-2026-10-23/extension-worker.json`. This uses synthetic senders inside the real worker and an intercepted synthetic page. Headless Chromium did not resolve the optional host-permission prompt during an attempted grant; consented content-script injection, the popup pairing flow, real site layouts, and localhost capture remain unverified. No site permission was bypassed.

An isolated Rust 1.99.1 toolchain generated `apps/desktop/src-tauri/Cargo.lock` with the real Cargo resolver. `cargo metadata --locked` reported 432 packages including the local app, all external packages from crates.io, and no blank external license expressions. Two `r-efi` versions list permissive MIT/Apache alternatives alongside LGPL; this metadata check is not a full source/license/security audit. `cargo check --locked` failed on this machine because the Windows SDK import library `kernel32.lib` is missing, even when run under Visual Studio Build Tools 18's environment. No Rust host tests, native binary, installer, signing, or on-device resource measurements passed. The lockfile is a development resolution, not release approval.

The earlier intermittent backup-import cancellation test failed again under the full suite. Its old 100-poll window could miss request startup, and a completed request could beat the separate lock call. The test now sends HTTP headers while holding the body open, observes the active secure operation, locks the vault, then completes the upload. This deterministically tests the post-await session boundary. After that test change, `node --test tests/async-security.test.ts` passed 15/15 and `npm run check` passed 147/147 with release, contract, TypeScript, and browser syntax checks. `npm run doctor` and `npm run desktop:plan` passed; the doctor still reports no native installer. This does not prove all backup cancellation races on a real device.

The companion popup now checks the current site's optional permission and explains when it is required before enabling capture. It reuses an existing grant without reopening the browser prompt. The actual Chromium core fixture passed with the initial permission-required state and the existing pair/enable/pause flow. Evidence: `verification/windows-2026-10-23/core-browser/report.json` and its synthetic screenshots. This remains a fixture result; the real consent prompt and site layouts still need a human pilot.

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
