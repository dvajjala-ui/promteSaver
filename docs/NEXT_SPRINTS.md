# Next sprints

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Updated: 31 October 2026. Work from the [core objective](CORE_OBJECTIVE.md): a Windows app that captures from approved sources, preserves local history and makes later reuse useful. The current host is WinForms with a private Node sidecar. macOS and optional sync follow the first proven Windows workflow.

## Starting point

The reviewed source includes the approved-app focused-field adapter and writable ValuePattern fallback. The latest recorded source check passed 190/190 tests. Earlier Windows tests covered real Notepad typing/pause and synthetic WPF typing, paste, initial-text baseline, password/read-only exclusions and Pause all. A ValuePattern-only synthetic provider read passed without an end-to-end vault save. These observations do not establish reliable capture from a real third-party prompt editor.

The latest bundled rebuild stopped at an open EXE file lock; no new setup was produced for the ValuePattern change. An earlier setup's isolated install and self-test remain evidence for that earlier build only. See [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md).

## Implementation order

| Order | Work | Acceptance evidence |
| --- | --- | --- |
| 1 | Isolate Windows accessibility work from the UI thread; bound provider stalls and large ValuePattern responses; review executable-name-only consent | Delayed, failing and oversized synthetic providers cannot freeze Pause/Lock/Quit or leak stale results; identity/restart changes reject old approval. Do not claim that a timeout cancels native work that is still running. |
| 2 | Rebuild the latest source and validate one expressly approved real desktop prompt workflow | Harmless typing, paste, edits, initial text, protected/read-only/unknown controls, pause, lock, restart, offline behavior and gap visibility. Inspect encrypted saved history and separate editable copies. Drafts stay drafts; add submission quality only with trustworthy source evidence. |
| 3 | Validate Windows setup and lifecycle | Current build on a disposable account and clean device: normal install, Start Menu, launch, tray Close/Quit, uninstall with vault retention, reinstall, login startup, sleep/resume, duplicate launch and recovery. Record the exact artifact hash. Complete source/dependency/license review and signing before public distribution. |
| 4 | Measure daily utility and resource cost | Consented repeated-use sessions: capture misses, useful old prompts, time/edits to reuse, interruptions and voluntary continued use. Measure native+Node+browser startup, idle and peak memory/CPU on actual 4/8 GiB devices; test keyboard, DPI and screen reader use. Targets are not guarantees. |
| 5 | Finish optional review and reusable instruction records | Correctable source understanding, durable versioned candidates/lineage and source-deletion semantics. Evaluate real-provider quality only with local key setup and explicit reviewed requests. A daily job needs independent consent, outgoing-content review, budgets and cancellation. |
| 6 | Add a native reuse picker, then contextual suggestions | Explain source and match reason, allow original or editable copy, verify focus/revision before insertion, support undo and preserve later clipboard changes. Never submit. Prove usefulness before adding overlays. |
| 7 | Expand sources, then macOS and optional sync | Acceptance per named source/OS; reviewed recovery/key protection; two-account/device isolation and tombstone convergence for any sync service. No coverage claim from synthetic fixtures alone. |

Browser work is a separate integration track. The optional ChatGPT/Claude/Gemini helper still needs ordinary human permission grant, injection and harmless real-site capture checks in each claimed browser. Use normal browser controls. A native field adapter excludes browsers and does not replace these checks. An unpacked helper is not the intended universal customer setup.

## Boundaries for every increment

- Keep source consent, protected/private exclusions, immutable evidence, separate editable/AI copies, revocation and post-await session checks.
- Keep source status and failures visible. No raw-key archive, clipboard polling, prompt retry queue, automatic AI processing or capture resumption for existing users.
- Treat storage hardening as release work: full database/WAL encryption, recovery and migration need design/license review; Windows DPAPI protects the current wrapping secret, not the whole database.
- Retain explicit local recall and measured bounded scans while evaluating indexes or embeddings. Cache-hit latency and Node-only RSS do not establish whole-app performance.
- Update handoff, readiness and dated test evidence. Run the checks appropriate to the changed layer; retain blocked or unavailable results accurately.

The [complete backlog](PRODUCT_BACKLOG.md) retains the wider product inventory. Proposed research, tests and user metrics above have not been completed by this documentation update.
