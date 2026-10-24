# Verification report - v0.9

## Windows Notepad keyboard-triggered capture, 2026-10-25

**Tested locally on real Windows 11/Node 24.16.0:** The native WinForms preview was opened with `--pilot-temp`, creating a separate encrypted temporary vault. The user-approved Notepad checkbox and Start action changed the native status to “Remembering approved Notepad drafts.” Windows 11 Notepad exposed a focused `Document` named `Text editor`. After harmless sample text and a keyboard event, the native app showed “Notepad draft saved locally”; Refresh displayed one saved item with the sample text, `notepad.exe` source and `draft_snapshot` quality. **Pause all** changed the status to capture off. Further typing in the same Notepad editor followed by a wait and Refresh left the native list at **1–1 of 1**, with only the earlier saved text. The agent-generated scratch document was cleared. The temporary native process was stopped after its exact `--pilot-temp` command and child process were verified; no user vault was opened.

**Synthetic/API checks:** `tests/keyboard-capture.test.ts` exercised explicit approval, wrong source/no consent, forged Origin rejection, encrypted at-rest text exclusion, duplicate suppression, a 15-write/minute bound, pause and lock/re-unlock revocation through actual local HTTP and a temporary vault. The compiled EXE `--self-test` exited 0 and accepted a synthetic Notepad draft as `draft_snapshot` alongside its older browser lifecycle checks. That EXE self-test does not run the real keyboard hook; the UI pilot above is separate evidence. `npm run check` passed **187/187** with no skips/failures, including release, contract, type and browser syntax checks. `npm run demo` and `npm run doctor` passed; doctor still reports no installer/native recorder in its older Tauri-oriented diagnostic fields. `npm run desktop:verify` checked **43** staged runtime files. The portable ZIP was **35,817,129 bytes**, SHA-256 `E0FA3722108C6F1D1329A9A2D2AB1BB34166891F336B775441C6689169BDFB96`; its extracted EXE passed the same synthetic self-test with exit code 0. A 5,000-record synthetic reliability run measured distinct-query p95 **266 ms**, explicit recall p95 **194.35 ms**, same-query cache-hit p95 **2.8 ms** and point-in-time Node RSS **85.41 MiB**. These exclude native whole-process and steady idle cost.

**Unavailable regression runner:** `python scripts/browser-smoke.py --mode fixture` exited before tests because Windows has no `python` command (`py` is also absent). No browser UI source changed in this increment; the prior browser fixture results below remain historical rather than current-run results.

**Open evidence:** Live password/unknown-field exclusion, paste without a following keyboard event, IME/dictation, other Notepad versions, repeated long sessions, actual login/reboot and clean-device installation were not exercised. The Notepad source has no submit signal, so its saved text is an editor draft, not an exact sent prompt. Other applications and browser pages remain outside this native source; live AI-site capture still requires the separate browser helper and remains unverified. A real user vault, provider key and real prompts were not used.

## Read-only Windows Chrome accessibility survey, 2026-10-25

**Tested locally on Windows:** `scripts/windows-chrome-accessibility-survey.ps1 --self-test` compiled the C# diagnostic and passed its private-control classification cases (`off`, `on`, missing and contradictory). The actual diagnostic rejects a non-Chrome foreground window with exit code 2 and `text-read=no` by construction. During a focused real ChatGPT browser check, Windows UI Automation exposed an `Ask ChatGPT` composer with ValuePattern and TextPattern, but the first probe returned `private-mode=unverified`; no editor value was requested by the diagnostic. The browser UI separately showed the normal `Temporary chat` control and, after a test toggle, `Turn off temporary chat` plus the temporary route. A later test tab showed a different logged-out composer and the diagnostic returned `approved-host=unverified` or `foreground=not-chrome` under focus changes. These are compatibility observations, not capture acceptance. All temporary browser tabs were closed; no prompt was sent, saved or uploaded by this survey.

After the metadata-only event probe was added, `npm run check` passed **186/186** Node tests plus release, contract, type and browser syntax checks on this Windows machine. That suite does not run the standalone C# event observer against Chrome; its live Send event remains unverified.

**Synthetic only:** the updated private-control classifier and fail-closed cases. The diagnostic now includes an optional 15-second `--observe` mode that counts UI Automation composer text-change and Send-invoked events without reading text, but no real ChatGPT event result was obtained. **Untested on OS/browser:** whether those accessibility labels or events are stable across Chrome versions, accounts, localization, private windows, Send/Enter, paste, IME and third-party pages; live submit timing and resource cost. **Not implemented:** a persistent native accessibility adapter, desktop UI opt-in for it, event-to-vault write path, per-app capture or all-day recording. The earlier synthetic browser-helper tests below remain separate evidence. This diagnostic does not close the core product gate.

## Pre-push verification and native-capture scope, 2026-10-25

On Windows x64 / Node 24.16.0, `npm run check` passed **186/186** tests with no skips/failures, including release/contracts/type/browser syntax checks. `npm run demo` passed with three synthetic encrypted records retained across restart and one redacted record; no network was used. `npm run doctor` passed for required files and supported Node, reporting that an installer and production native recorder are absent. `npm run bench:reliability` on 5,000 synthetic records measured distinct-query p95 **269.42 ms**, explicit recall p95 **214.56 ms**, warm identical-query p95 **2.95 ms**, and point-in-time Node RSS **88.63 MiB**. These exclude whole-app/browser memory and are not Windows installer or real-user guarantees. `git diff --check` found no whitespace errors.

The product owner requested broad keyboard collection with filtering afterward. The repository's producer-side privacy boundary remains in force: no arbitrary keystroke archive was added. Windows UI Automation had previously been tested only on synthetic owned controls; native source adapters, protected/private exclusions on actual apps and submit detection are still unimplemented. The product direction now prioritizes one native, explicitly approved source and a single-install customer experience. This section documents scope; it is not native capture evidence.

## Windows login launch control, 2026-10-25

**Tested locally on Windows:** the native WinForms EXE was rebuilt with an off-by-default **Start with Windows** checkbox. Its intended per-user Run value points to the current EXE and only starts the visible, locked application. It does not grant a site, unlock the vault or restore browser pairing. A synthetic `--ui-smoke` window was inspected through Windows accessibility and a native screenshot: the site selector and startup checkbox fit on the primary row, and the browser/startup controls were disabled as expected in the fixture. The actual Windows startup registry value remained absent. The rebuilt preview staged and verified 42 files; its `--self-test` exited 0, including the synthetic approved-browser send and DPAPI credential failure cases. The new portable ZIP was extracted and passed the same EXE test: **35,869,906 bytes**, SHA-256 `8339965985FCF81F545756389A86C622A55CC688EBBD6A1C0CE0EB1713C42A9E`.

**Not tested:** toggling the real checkbox, actual Windows sign-in/reboot launch, automatic vault unlock, automatic browser reconnection, real AI-site capture or unattended all-day operation. The checkbox changes only login launch when a user turns it on. The previous 25 October ZIP and its hash below belong to the earlier build before this control.

**Later real-site attempt:** Chrome Browser Use access became available. An isolated `--pilot-temp` native vault was created with no saved prompts. Browser Use rejected `chrome://extensions` under its URL security policy and explicitly disallowed using alternate automation surfaces to achieve the same installation. No helper was installed and no harmless ChatGPT prompt was sent. The temporary service and native window were stopped after verifying their exact process identity; this invalidated pairing. The user was asked to load the helper manually for any continuation. Test-only temporary directories may remain after forced stop.

## Windows password-free preview continuation, 2026-10-25

**Tested locally on Windows:** the native WinForms preview now creates a separate `%LOCALAPPDATA%\promteSaver\desktop-vault` with a random wrapping secret protected by Windows CurrentUser DPAPI. There is no passphrase entry in the native window; the prior `%USERPROFILE%\.promtesaver-local` vault was not opened, changed or imported. A temporary `--pilot-temp` window was opened and its **Create vault** action reached the empty capture screen. A synthetic native window showed the single-site selector and no password field in the accessibility tree. The final EXE `--self-test` exited 0 after setup, wrong-secret rejection, lock/unlock, missing/tampered DPAPI credential rejection, a harmless simulated ChatGPT browser send accepted as `draft_snapshot`, list/review and lease release. `npm run desktop:verify` checked 42 staged files. The 25 October portable ZIP (35,809,124 bytes; SHA-256 `2AFB215A6F756CC29D3A0B700F88C732221BFDA2C7EDD7A0A8DEA84E656B6EF6`) was extracted and passed the same self-test. This is not a clean-device installer or a real website result.

**Synthetic/browser regression:** `npm run check` passed **186/186** Node tests, including a temporary-vault desktop browser flow for pairing, accepted capture, offline review, pause, lock and restart. Chromium 156 passed **30/30** actual-UI fixture scenarios, **20/20** UI-to-temporary-local-service scenarios (one accelerated idle scenario remained fixture-only), and **53/53** core synthetic composer scenarios. No real user prompt, existing vault, cloud key or live provider was used.

**Live-site attempt:** the user approved installing the local helper for `chatgpt.com` and a harmless send. Computer Use continued reporting “Local browser use is disabled in Work settings” even after the user said access was enabled. No helper was installed, no real site permission was granted, and no prompt was sent. Thus the actual ChatGPT composer, extension injection, saved receipt and AI-site delivery remain unverified. Browser pairing itself is only a write authorization, not proof of capture. A temporary native pilot vault was stopped after testing; forced stop leaves test-only directories under `%TEMP%`, with no user prompts. Recursive cleanup was rejected by the execution policy and was not retried through another shell.

**Remaining product limits:** the Windows vault is tied to its original account; loss of its DPAPI credential needs a backup/recovery path. There is no native import of the old passphrase vault yet. The source/browser fallback and encrypted portable backup still use passphrases. Real Codex transcript capture, all-app capture, unattended all-day operation past idle lock, automatic end-of-day AI grammar review, inline suggestions in other apps, installer/signing, macOS native runtime, and whole-app low-memory measurements remain open.

Original release date: 2026-10-23. The original v0.9 results below remain historical. The current local Windows preview evidence is dated 2026-10-24. No real user vault or Groq key was used.

## Current Windows capture preview verification, 2026-10-24

Branch: `codex/capture-reliability`, uncommitted local work. Environment: Windows x64, Node 24.16.0, compiled WinForms/.NET Framework portable preview, Chromium UI fixtures. The current binary is ignored under `.local/windows-preview/`; it is not a published or installed release. The copy at `.local/verification/windows portable proof/` was relocated with its staged resources for a path-with-spaces check. Neither run used the user's vault or actual Codex session files.

| Check | Observed result | Evidence and limit |
| --- | --- | --- |
| Post-gate `npm run check` | **184/184** Node tests with no skips or failures; metadata, contracts, types and browser syntax pass | Real temporary encrypted SQLite and HTTP for relevant tests; Codex JSONL, browser sites and provider responses are synthetic. Includes the fail-closed real-session gate. |
| `npm run demo`, `npm run doctor`, `npm run desktop:plan` | Pass | Synthetic replay, environment diagnostics and source staging plan. Doctor's Tauri/installer flags still describe the uncompiled Tauri release path. |
| Post-gate WinForms preview build and `npm run desktop:verify` | Native `promteSaver.exe` recompiled; **42** staged runtime files verified | Bundled supported Node 24.16, full Node license and unpacked helper. Integrity manifest catches accidental relative alterations, not malicious replacement of both file and manifest. No installer, signing or clean-device execution. |
| Built EXE `--self-test` | Pass after the fail-closed rebuild; previous relocated-folder self-test also passed | [Relocated result](../.local/verification/windows%20portable%20proof/native-smoke-result.txt). Synthetic temporary vault: private sidecar handshake, setup, wrong-passphrase denial, lock/unlock, bounded list, pause, explicit offline review and lease release. A visible synthetic native window was inspected after layout repair. It does not test real-user capture or tray behavior. |
| Final portable ZIP extract and `--self-test` | Exit code **0** | `.local/promteSaver-windows-preview-2026-10-24.zip` (35,806,707 bytes) was extracted to an isolated local folder and ran the same temporary-vault smoke. This tests archive completeness on this machine, not installer behavior or a clean device. |
| `scripts/browser-smoke.py --mode fixture` | **30/30**, no failures | [Ignored local report](../.local/verification/capture-final-fixture/report.json). Actual Capture-first UI against mocked in-page API. [Tracked synthetic screenshot](verification/capture-first-ui.png). |
| `scripts/browser-smoke.py --mode live` | **20/20** executed, one accelerated idle scenario fixture-only | [Ignored local report](../.local/verification/capture-final-live/report.json). Actual Chromium UI talking to a temporary local service/encrypted vault; no live AI websites or provider. |
| `scripts/core-browser-tests.py` | **53/53**, no failures | [Ignored local report](../.local/verification/capture-ui-core/report.json). Actual recorder/UI source on synthetic composer pages with mocked extension and provider boundaries. |
| `npm run bench:reliability` | 5,000 synthetic records; distinct-query search p95 **147 ms**, explicit recall p95 **107.24 ms**, warm-query p95 **1.64 ms** | Point-in-time Node RSS **88.26 MiB**, JS heap **12.67 MiB**. Excludes native host/Chromium process tree, peaks and steady idle CPU; not a 4/8 GiB guarantee or causal improvement claim. |

**Tested locally:** the compiled EXE starts and stops its owned local service, displays a native Capture-first workflow, and survives the bounded temporary-vault self-test. **Synthetic only:** transcript watching through an injected test directory, prompt evidence, approved-site composers, UI captures, offline wording checks and all browser-to-service records. New captures keep encrypted immutable `draft_snapshot` evidence separate from linked editable copies. Capture safety rules may redact obvious secrets before persistence, so evidence is the saved snapshot, not a byte-for-byte raw original. The experimental Codex source baselines existing test files at EOF and stops on pause/lock, but the public Windows preview is gated from the user's real Codex session directory until private/protected-session exclusion is verified. The manual `Review recent wording` action applies local heuristic checks to a bounded recent page without changing the saved snapshot or making an AI request.

**Untested on OS/browser:** the undocumented real Codex session schema and private-mode exclusions; human permission grant, installed-extension injection and real ChatGPT/Claude/Gemini capture; Edge, live Groq, prolonged tray use, clean-device setup, macOS, accessibility and whole-app resource limits. **Not implemented:** usable real Codex transcript capture in the preview, generic keyboard monitoring or arbitrary-application prompt capture, login startup, unattended all-day recording beyond idle lock, automatic end-of-day AI rewriting, cross-app correction overlay, installer/signature. Do not promote this binary as a consumer release. These facts supersede historical statements below that no native binary existed.

## Windows CMD launcher increment, 2026-10-24

Added `start-windows.cmd` after the personal pilot exposed Notepad opening the PowerShell file and errors after its contents were pasted into an interactive shell. This entry point does not invoke PowerShell or change execution policy. It requires the supported Node runtime, selects its own directory and pauses on failure. Users still open the printed private browser address and keep the service console open. It does not grant capture consent or start a login/background collector.

| Check | Observed result | Scope |
| --- | --- | --- |
| Direct Windows CMD launcher fixtures | 3/3 pass | Actual new batch file copied to a temporary path with spaces and launched from another directory. A synthetic server verifies the working directory and normal exit; a failing synthetic server retains its error and reaches Pause; a PATH without Node shows guidance and reaches Pause. No real vault, browser, Explorer double-click or unsupported Node binary was exercised. |
| `npm run check` | 165/165 pass; metadata, contracts, types and syntax pass | Windows x64, Node 24.16.0; unchanged service/UI regressions, synthetic fixtures and mocked provider boundaries. |
| `npm run demo`, `npm run doctor` | Pass | Synthetic offline replay and local environment/source diagnostics. |
| `npm run bench:reliability` | 5,000 records; distinct-query p95 156.03 ms; explicit recall p95 124.40 ms; cached-query p95 2.39 ms | Isolated synthetic run; point-in-time Node RSS 91.18 MiB and JS heap 14.37 MiB exclude browser/WebView and peak memory. Launcher changes do not imply a causal performance change. |

The temporary launcher fixtures were removed after verification. No browser UI source changed; browser suites were not rerun for this increment. Real website capture, human permission grants, live Groq, native installer behavior, macOS and whole-app resource acceptance remain unverified. Login startup, tray controls and general all-day/all-application text capture remain unimplemented. The pilot guide now explains the 15-minute default/1–120-minute configurable idle lock, pairing revocation and eight-hour maximum pairing lifetime; no lock or authorization behavior was weakened.

## Related feedback and capture-gap increment, 2026-10-24

Branch: `codex/capture-reliability`, local uncommitted source. Windows x64, Node 24.16.0, Chromium 153.0.8010.12. Synthetic records and transport only; no real site, provider key or Mac device.

| Check | Observed result | Evidence and limit |
| --- | --- | --- |
| `npm run check` | **162/162** Node tests, type/syntax/contracts/metadata pass | [Output](verification/windows-2026-10-24/suggestions-check.txt). One new real HTTP/encrypted-vault feedback test and one new MV3 gap-history test. |
| Actual-source core Chromium | **53/53**, no page errors | [Report](verification/windows-2026-10-24/core-browser-suggestions.json). Popup gap list/clear is tested with a synthetic private canary that must not display. |
| Baseline Chromium UI fixture | **27/27**, no page errors | [Report](verification/windows-2026-10-24/browser-fixture-suggestions.json). Keyword explanation, feedback, project correction, reversible hide and capture receipt. |
| Chromium to temporary local service | **19/19** executed; accelerated idle scenario remains fixture-only | [Report](verification/windows-2026-10-24/browser-live-suggestions.json). Real local HTTP/encrypted vault, not live AI sites. |
| Real unpacked MV3 worker probe | **8/8** scoped checks | [Report](verification/windows-2026-10-24/extension-worker-suggestions.json). Optional permission grant, real site and localhost capture remain unverified. |
| `npm run demo`, `npm run doctor` | Pass | [Demo](verification/windows-2026-10-24/suggestions-demo.txt), [doctor](verification/windows-2026-10-24/suggestions-doctor.txt). Synthetic replay and environment/source diagnostics. |
| `npm run bench:reliability` | 5,000 synthetic items, ten distinct recall queries: **101.83 ms median / 108.02 ms p95**; distinct search p95 **134.11 ms** | [Raw isolated run](verification/windows-2026-10-24/suggestions-reliability.txt). Sampled Node RSS **85.7 MiB**, excludes browser/native. A simultaneous check/browser run measured higher latency, so these are host/load-sensitive observations, not an optimization claim. |

Feedback is optional encrypted library metadata for the current content revision. Hidden suppresses explicit related-result recall and can be cleared from the library inspector; worked well/not useful do not automatically alter rank or prove a successful outcome. Edits reset feedback for the new revision and older history retains the earlier judgment. Portable backups include the optional fields; older importer code may omit them. The worker stores at most 20 fixed reason/site/time gap entries in trusted session storage, serializes writes, and stores no prompt text, URL path or retry payload. It cannot count failures for unsupported editors that never send a capture request. The capture receipt is a UI explanation of existing evidence fields, not a proof of human-granted permission or message delivery.

## Source-bound refinement increment, 2026-10-24

Branch: `codex/capture-reliability`, uncommitted local work based on `51205e9`. Environment: Windows x64, Node 24.16.0, pinned TypeScript 7.0.2, installed Chromium 153.0.8010.12; Python Playwright 1.64.1 is development-only under ignored `.local/python-deps`. No real prompt, vault or provider key was used.

| Check | Observed result | Evidence and limit |
| --- | --- | --- |
| `npm run check` | **160/160** Node tests; TypeScript, syntax, contracts and metadata pass | [Raw output](verification/windows-2026-10-24/refinement-check.txt). Six new refiner tests use exact-quote validation, mock Groq transport and real local HTTP/encrypted vault. |
| `scripts/core-browser-tests.py` | **52/52**, no page errors | [Report](verification/windows-2026-10-24/core-browser-refinement.json). Actual UI source and three synthetic composer fixtures; mocked provider, extension messaging and page origin. Four new UI cases cover source binding, two fresh approvals, exact quote/default task scope and explicit independent save. |
| `scripts/browser-smoke.py --mode fixture` | **22/22** | [Report](verification/windows-2026-10-24/browser-fixture-refinement.json). Existing UI regressions against an in-page API fixture. |
| `scripts/browser-smoke.py --mode live` | **15/15** executed; accelerated idle scenario fixture-only | [Report](verification/windows-2026-10-24/browser-live-refinement.json). Actual Chromium to a temporary loopback service and encrypted vault; does not call Groq or real AI sites. |
| `npm run demo`, `npm run doctor` | Pass | [Demo](verification/windows-2026-10-24/refinement-demo.txt), [doctor](verification/windows-2026-10-24/refinement-doctor.txt). Synthetic replay and runtime/source diagnostics only. |
| `npm run bench:reliability` | 5,000 synthetic records; ten distinct recall requests **106.28 ms median / 117.47 ms p95**; distinct search p95 **183.08 ms** | [Raw benchmark](verification/windows-2026-10-24/refinement-reliability.txt). Point-in-time Node RSS **89.18 MiB** excludes browser/native host; no causal speedup claim. |

The HTTP tests verify fresh source ETags before/after model work, separate preview digests and consent, no automatic saving, malformed/truncated/unsupported provider output rejection, exact quotes with task/project/personal scope, encrypted at-rest payloads, source deletion behavior and vault/origin authorization. Task-scoped blocks never enter automatic recall; project-scoped blocks require the matching selected project; explicitly personal blocks may cross projects. A reviewed block is an independent editable library item with an encrypted source reference in notes, **not** a structurally linked immutable derivation. UI candidate dismissal is review-local. The server accepts a direct user-reviewed exact quote through the same save endpoint, so the saved item is intentionally tagged as a source extract rather than proof that AI generated it.

Sentence/line boundary validation cannot prove that a quote retains all restrictions in other paragraphs. Human review remains necessary. The first-stage understanding is reviewed/accepted in the UI but is not yet editable or persisted as a versioned record. Real Groq output quality, actual permission dialogs/sites, native installs, Mac runtime and whole-app performance remain open. The Playwright suite selected the preinstalled full Chromium executable explicitly; its browser revision differs from the installed Python package's default expected revision. No browser policy or optional permission was bypassed.

## Capture reliability increment, 2026-10-24

Branch: `codex/capture-reliability`, based on `51205e9`. All vaults/prompts were synthetic. Environment observed in this run: Windows x64, Node **24.16.0**, pinned TypeScript **7.0.2**, Python **3.12**, development-only Playwright **1.64.1**, installed full Chromium **153.0.8010.12**. These are this run's versions, not the different versions in historical results below. Python dependencies were installed into ignored `.local/python-deps`; no production dependency changed.

| Check | Result | Evidence and scope |
| --- | --- | --- |
| `npm run check` | **154/154** Node tests; release metadata, contracts, TypeScript and browser syntax pass | [Raw output](verification/windows-2026-10-24/check.txt). Real encrypted SQLite/local HTTP; provider mocked; worker Chrome APIs doubled. |
| `scripts/core-browser-tests.py` | **48/48**, no page errors | [Report](verification/windows-2026-10-24/core-browser.json). Actual UI/producer source with synthetic documents, mocked extension/origin/provider boundaries. |
| `scripts/browser-smoke.py --mode fixture` | **22/22** | [Report](verification/windows-2026-10-24/browser-fixture.json). Actual UI with mocked API. |
| `scripts/browser-smoke.py --mode live` | **15/15 executed**, no errors; accelerated idle scenario fixture-only | [Report](verification/windows-2026-10-24/browser-live.json). Actual Chromium to temporary local HTTP service/encrypted vault, not live AI websites. |
| `scripts/extension-worker-check.py` | **8/8** scoped checks | [Report](verification/windows-2026-10-24/extension-worker.json). Real unpacked MV3 worker/storage, synthetic approved-origin page; no optional host permission bypass. |
| `npm run demo` | Three records and pending operations survive reopen; one search result, one redacted record | [Output](verification/windows-2026-10-24/demo.txt). Synthetic replay; recording/network off. |
| `npm run doctor`, `npm run desktop:plan` | Pass | [Doctor output](verification/windows-2026-10-24/doctor.txt). Runtime/source checks and staging plan only; not compilation or installation. |
| `npm run bench:reliability` | 5,000 records; ten distinct recall requests: **123.77 ms median / 142.14 ms p95**; distinct search p95 **179.43 ms** | [Raw benchmark](verification/windows-2026-10-24/reliability.json). Point-in-time Node RSS **89.22 MiB**; excludes browser/native host. No causal speedup or whole-app memory claim. |

154 = 147 inherited tests + six worker regressions + one multilingual recall regression. Worker tests cover actual permission denial despite stored enablement, Pause during pending Enable, active-request abort, concurrent site changes without lost settings, failed registration, revocation during async reads, changed pairing identity/invalid port and late old responses preserving a newer token. Recall exercises complete Telugu/Hindi keywords and decomposed accents through the real HTTP service without modifying the saved source.

New browser cases cover focus cancellation, shared private/protected checks before reading a value, transparent ancestors, mixed-language preview, simulated IME composition, multiple composers, a Send button in an unrelated form, out-of-order state, old acknowledgements, and popup preview clearing/changed-host rejection. Composition events are simulated around trusted keyboard input; these are not real OS IME/dictation acceptance tests. All three composer adapters use synthetic fixtures; actual website layouts remain unverified. Network failures are labelled unconfirmed because a lost response/abort cannot establish that the service never accepted the request.

The first core launch could not find the browser revision expected by the newly installed Python Playwright. The harnesses now accept an explicit `--browser-executable` (full Chromium), and the successful runs used the existing installed executable. No browser policy or optional permission was bypassed. This is an explicit cross-version test pairing, not evidence of a freshly installed matched Playwright browser revision. The baseline/live smoke script already supports `--browser`. The worker probe now defaults to ignored `.local/verification/extension-worker.json` so a fresh run cannot overwrite dated historical evidence accidentally.

Final review added a regression for a protected input nested inside an editable composer: neither preview nor Enter may fall back to reading that ancestor. The expanded fixture initially started simulated composition while focus was still outside the editor; it now focuses the editor before composition, matching the intended event sequence. The final core run passes all 48 cases. A read-only native prerequisite check found neither Cargo nor rustc on PATH and no conventional Windows SDK `10/Lib` directory; this does not establish that tooling exists nowhere else. No native compilation or tooling installation was attempted in this increment.

Reproduction uses `npm run check`, `npm run demo`, `npm run doctor`, `npm run desktop:plan`, and `npm run bench:reliability`; browser commands are the table's scripts with `--output` set to a scratch directory, plus `--browser-executable` for core/worker or `--browser` for smoke when selecting an installed Chromium. Full Chromium is required for the worker; Headless Shell is insufficient.

**Still open:** human permission grant/injection, real ChatGPT/Claude/Gemini capture, Edge, real IME/dictation, live Groq quality, native compilation/installers, Mac runtime, OS key protection, full-file encryption, sync and whole-app 4/8 GiB resource acceptance. No consumer release, push or deployment is implied. The implementation sequence is in [NEXT_SPRINTS.md](NEXT_SPRINTS.md).

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

After the popup change, the real Windows local-browser smoke run passed **15/15 executed scenarios** against a temporary encrypted vault and local HTTP service. It covered setup, diagnostics, responsive views, conflict handling, templates, pagination, backup restore, passphrase changes, recall, and lock-time DOM clearing. One accelerated idle scenario remains intentionally fixture-only. Evidence: `verification/windows-2026-10-23/browser-live/report.json` and synthetic screenshots. This still does not exercise real third-party AI sites or the installed extension.

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

## 24 October 2026 retention continuation (Windows)

`npm run check`: 165/165 Node tests passed, including three retention/captured-page tests. They cover bounded windows, an exact candidate digest, stale preview rejection, linked editable copy/history deletion, preservation of newer evidence, tombstones, unlocked authorization, lock rejection and access to older records in a 45-capture archive. `npm run demo` and `npm run doctor` passed on Node 24.16.0. `npm run bench:reliability` on 5,000 synthetic records measured distinct-query search p95 222.69 ms, explicit recall p95 161.31 ms, and point-in-time Node RSS 92.82 MiB. Cache-hit figures and Node RSS do not establish whole-app performance.

The repository Python browser fixture command did not run: the system `python` is only a Windows Store alias, and the bundled Python lacks Playwright. Separate direct Playwright Chromium checks loaded the actual local service and app: one created a synthetic old capture, previewed it in Settings, confirmed deletion and verified removal; another paged across 45 synthetic captures and back. These two scenarios do not replace the full fixture suite. No live site, provider, installer or Mac testing was performed for this increment.
