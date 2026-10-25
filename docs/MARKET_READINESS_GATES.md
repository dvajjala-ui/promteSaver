# Current status: v0.9 developer pilot

See [READINESS_V0_9.md](READINESS_V0_9.md) and [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md) for current evidence. A native WinForms Windows preview now compiles and passes synthetic temporary-vault lifecycle checks. Its new vault opens without a password through Windows CurrentUser DPAPI; the older passphrase vault remains separate and has no native migration path. The portable folder and per-user setup prototype are unsigned and are not a clean-device/public release; the separate Tauri/Rust host still cannot compile on this machine because the Windows SDK import library is missing. Browser capture and explicit Groq source exist, but consented real-site capture and live provider behavior remain unverified. Real Codex transcript capture is disabled in the public Windows preview until private/protected-session exclusions are verified. The v0.8 matrix below is retained as historical context, not current implementation status.

An unsigned per-user setup prototype now embeds the portable payload and passed an isolated temporary install plus synthetic self-test from the copied EXE. The normal shortcut/uninstall/update and clean-device paths remain unverified; this is still not a public installer. The native UI now puts saved prompts and source/time first, with advanced controls under More options. Its current screenshot used synthetic data.

The new Notepad source passed one real keyboard typing/pause pilot on Windows 11 with a temporary encrypted vault. It stores editor draft snapshots under explicit source approval, without raw key values or a send claim. It does not close the broader native-source or all-app capture gate.

## Current capture-first market gates — 25 October 2026

| Gate | Current evidence | Still needed before sale |
| --- | --- | --- |
| Windows desktop setup | Compiled WinForms EXE, bundled Node runtime/license/helper, 43 staged files verified, one-click DPAPI vault, optional off-by-default login launch UI, unsigned per-user setup with isolated install and installed-path synthetic self-test | Ordinary setup UI/Start Menu/uninstall/update, login/reboot, clean-device install, old-vault migration, cross-account recovery, signing and distribution/license review |
| Reliable automatic prompt capture | Browser producer on synthetic composer fixtures; extension worker scoped default-off checks; private local bridge and synthetic send accepted by native vault | Human-granted permission, installed extension and repeated real-site captures on each claimed browser/site; meaningful failure receipts. Browser control still reported disabled in this chat after user enabled Chrome access. |
| Native application sources | Opt-in Notepad keyboard-triggered editor snapshot passed one real Windows 11 typing/pause pilot; bounded internal Codex JSONL producer passed injected synthetic tests but real source remains gated off | Other Notepad versions, live protected/unknown field checks, endurance, reliable send evidence where applicable, and separate opt-in adapter acceptance for each additional app |
| Daily review and contextual improvement | Explicit bounded offline wording review and manual related-prompt recall | Real usefulness/language evaluation; consented, budgeted end-of-day AI processing and safe cross-app suggestions if added later |
| Trust and resource cost | Synthetic vault/security tests and backend benchmark; temporary native lifecycle | Independent privacy/security review; whole native+Node+browser startup, idle/peak RSS/CPU on 4/8 GiB devices; accessibility and recovery study |

No readiness percentage follows from these test counts. Do not sell or describe this preview as an all-day, all-app recorder. The older v0.8 table follows for historical decisions only.

# Readiness gates - 0.8

A useful manual local beta is not the same product as an audited, signed, automatically capturing cross-platform desktop application. We do not infer a market-readiness percentage from test counts.

| Gate | Evidence available | Remaining before public release |
| --- | --- | --- |
| Manual save/search/templates/history/Trash | Real storage/API tests and Chromium UI fixtures | Real Windows/Mac workflows, networked UI E2E and user sessions |
| Upgrade / credential / recovery safety | Atomic metadata failure tests, legacy upgrades, passphrase changes, backup preview, encrypted unsaved editor recovery (best effort), tombstones | Cross-OS faults, actual existing vaults, restore drills, streaming large backups and unfinished draft semantics |
| Resource behavior | Bounded API preview/hydration, DOM/cache modes; Node process and headless Chromium process-tree profiles; 5k/10k distinct/cached backend benchmarks | Whole-process-tree RSS/peak/idle CPU on 4-8GiB machines; realistic long prompts; 50k gates |
| Native experience | Tauri source, runtime staging plan, actual Node child lifecycle tests | Rust compilation, frozen Cargo graph, resource packaging, native menus/clipboard/downloads and OS lifecycle |
| Data-at-rest security | AEAD payloads and wrapped archive keys, disclosed limitations | OS keychain, fully encrypted DB/WAL, audited migration/recovery; independent review |
| Browser helper | Write-only origin-bound bridge and revocation tests | Actual Chrome/Edge supported-site and protected/private-field tests, extension publication review |
| Accessibility | Semantic controls, HTML dialogs, keyboard fixture checks, responsive screenshot QA | NVDA/VoiceOver, zoom, contrast audit and complete WCAG assessment |
| Writing Studio | Encrypted profiles, separate excerpt consent, opt-in heuristic checks, v3 backup, Chromium fixture and Node API tests | Independent usability/a11y testing, true language-quality evaluation, native integration and live browser/service checks; AI rewriting only with explicit consent |
| Native capture | Synthetic policies and historical Windows proof only | Per-source opt-in, trustworthy submit evidence, visible stop/pause, secure OS adapter validation |
| Distribution | Complete source and checksums; explicit limitations | Original-source license decision, third-party notices, signing/notarization, updates/uninstall/privacy policy |
| Customer validation | Structured study protocol documented | Eight consented developer/everyday-user sessions; fix observed friction before adding speculative features |
| Cloud and AI | Deliberately absent | Optional later scope, independently threat-modelled; not required for first manual offline beta |

## v0.8 evidence added, without closing native release gates

123 Node tests and 21 Chromium fixture scenarios cover bounded async key derivation, cancellation/session races, diagnostic privacy, stable heap ranking and build-resource validation. On-demand diagnostics expose service-only memory. A manual native preview workflow is now included but has not run here. No installer, whole-app memory target, pinned toolchain, live browser E2E, OS keychain or independent security gate is closed by these source changes.

## Product decisions for the next release

**P0: prove the beta on the real target systems.** Run the supplied live browser tests, upgrade/backup drill, keyboard workflows and extension negative cases on Windows and macOS. Do not wait for background capture to validate the manual library.

**P0: finish native packaging, not another UI rewrite.** Compile/fix the supplied host; verify child shutdown and resource integrity; resolve source/transitive licenses; sign packages only after the security checklist passes.

**P0: strengthen the storage boundary.** Prototype OS-protected key unwrapping and full-file encryption behind the existing archive contract. Include legacy migration, recovery, lost-key and WAL tests. Do not remove honest metadata-leakage warnings until evidence supports that claim.

**P1: scale safely.** Stream portable backups; choose encrypted indexed search using a measured latency/memory/leakage budget; add peak-memory tests with large body/history datasets. Cold scans and small caches remain honest interim choices.

**P1: daily utility.** Verified OS global picker, accessibility improvements, explicit retention controls and outcome-based reusable templates. Add features in response to observed tasks, not a competitor checklist.

**P2: native collection, then optional sync/AI.** Prove permissions, exclusions and evidence quality per source. Keep cloud/AI processing off unless the user explicitly enables the specific purpose and data scope.

## Device pilot exit criteria

No crashes or data loss across setup/restart/edit/lock/restore; reliable copy/template workflows offline; cross-device backup restore; no stale plaintext view after lock; safe denial of permissions; successful native exit; measured resource budgets; screen-reader usability; no unsupported marketing claims. Record failures with synthetic data and add regressions before raising release status.


## Writing Studio-specific release criteria

- Recruit opt-in participants to check whether inferred tone/length habits produce **useful** instructions and whether examples are kept/private as they expect. Measure task completion and accidental personal-data disclosure, not just computed metrics.
- Evaluate punctuation and repeated-word false-positive rates with synthetic, varied English text. Test screen-reader announcements, keyboard flow, 200% zoom and cramped windows on actual OS WebViews.
- No floating inline assistant until editor selection/blur/submit race conditions, protected fields, per-domain exclusions, visibility and pause/revoke have been validated. OS global capture is still off.
- No production market-readiness percentage should be inferred solely from 96 passing backend tests or 16 fixture scenarios.
