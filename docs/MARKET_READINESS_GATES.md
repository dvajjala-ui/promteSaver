# Current status: v0.9 developer pilot

See [READINESS_V0_9.md](READINESS_V0_9.md) and [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md) for current evidence. Browser capture and explicit Groq source now exist, but live/native gates remain open. The v0.8 matrix below is retained as historical context, not a current claim that all AI is absent.

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
