# Product completion work — 24 October 2026

The goal remains an installed Windows/macOS prompt recorder with offline memory, accurate source evidence, two separate refiners, useful reuse across tools, and optional website sync. The local library and three-site companion are working parts of that goal, not the finished product. Current acceptance status is in [READINESS_V0_9.md](READINESS_V0_9.md).

## Updated customer setup priority — 25 October 2026

The next core increment should remove the unpacked browser extension from the required first-run path. Implement and validate one source-specific Windows accessibility adapter in the native app, with explicit source approval, pre-read password/private exclusions, reliable submit evidence, visible pause and bounded gap reporting. Test with real harmless keyboard, paste, edit, dictation/IME and Send flows, then extend source coverage one app at a time. If a browser site cannot expose a trustworthy submit signal through native APIs, keep the extension as an optional integration and plan a browser-store release rather than requiring Developer mode for customers. The new Start with Windows control launches the locked app only; capture resumption after sign-in or idle lock needs a separately designed and consented lifecycle. Do not claim all-app or all-day coverage from the current preview.

## Implemented in the current local increment

- Local related-result feedback now ties worked/not useful/hidden to a specific encrypted library revision, survives backups, resets after content edits and can be cleared in the inspector. A hidden revision stops appearing in explicit recall. Results explain their keyword match and offer exact copy, editable draft copy and an explicit source-project correction. Captured cards include quality/source/time/delete receipts; the browser helper keeps only 20 fixed-reason/site/time save gaps for its current session. These are bounded partial steps for B07/B08/B14/B15 and S01–S06, not automatic learning, global suggestions or complete coverage.
- Added saved-source-bound understanding and exact-quote extraction as separate reviewed actions. Both cloud requests require an outgoing preview and fresh consent; no candidate saves automatically. The user chooses task/project/personal scope before saving an independent editable template. Task-only blocks are omitted from automatic recall and project blocks require a matching selected project. This is a synthetic-provider-tested slice, not durable learning or live provider validation.
- Shared private/protected input checks for manual preview and send-intent capture. Preview rejects a changed host and clears an earlier preview before another attempt. Single-line inputs are now excluded from manual preview, matching the recorder's conservative policy.
- Permission checks at the worker boundary, serialized site changes, immediate invalidation on Pause, cancellation of pending requests on observed revocation, and pairing identity checks across asynchronous reads. Failed registration leaves the site disabled.
- Focus-bound hint timers; no fallback to a remembered editor when several composers are visible; Send buttons in another form cannot read the lone unrelated composer. Composition state, stale state replies and late acknowledgements receive explicit guards.
- Telugu/Hindi vowel marks and combining accents remain part of local recall keywords. This is keyword retrieval, not semantic understanding or language-quality certification.

No production package, new permission, cloud service, background model or native collector was added. Evidence and exact limitations are recorded in [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md).

The complete pending and suggested-work inventory is [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md).

## Next implementation sequence

Each increment should produce code, focused regressions, measured evidence and an updated handoff. Keep originals, editable copies, learned candidates and accepted reusable blocks distinct.

| Priority | Work and implementation location | Completion evidence |
| --- | --- | --- |
| P0 | Verify actual ChatGPT/Claude/Gemini composers and popup consent in Chrome/Edge; fix observed selectors in apps/browser-helper | Non-sensitive per-site pilot: permission denial/grant/revoke, temporary mode, paste, dictation/IME, edited drafts, send, pause, lock, offline failure. Record browser/site/date and failures. Synthetic fixtures do not close this gate. |
| P0 | Close native Windows build prerequisites and compile the existing apps/desktop host; repeat on a real Mac | A real locked Cargo build, packaged Node/resource integrity, install/restart/upgrade/uninstall, child EOF/duplicate launch, clipboard/download behavior. The 23 October Windows attempt lacked SDK kernel32.lib; confirm the current environment before changing tooling. |
| P0 | Strengthen storage behind packages/local-store/archive.ts and the vault lifecycle | Prototype full database/WAL encryption and opt-in DPAPI/Keychain unlock assistance. Review exact dependency licences first. Test legacy migration, wrong/lost key, interruption, downgrade and recovery on each OS. Current AES-encrypted records remain an interim format. |
| P1 | Add a permission-aware focused prompt adapter to each native platform | Visible disabled-by-default controls, explicit per-source opt-in, protected/private exclusions before reading, focus identity and gap reporting; synthetic canaries and real non-sensitive source tests. Broader desktop recording remains the direction; no universal coverage claim from one adapter. |
| P1 | Finish the two-refiner data model and explicit processing workflow | The UI/API now provide two source-bound, separately consented synthetic-tested stages and independently saved exact quotes. Add correctable understanding, durable versioned understanding/candidate lineage, suppression/feedback and source-deletion semantics. Preserve negation, one-off restrictions, mixed-language wording and authorship; imported/model text cannot authorize execution or become repeated human preference evidence. Then conduct consented real-provider evaluation. |
| P1 | Make reviewed reusable blocks useful while drafting | Keep explicit local recall; add original/derived provenance and user acceptance/dismissal feedback. Build the native picker before overlays. Preview selected text, verify current focus/revision at insertion, support undo, preserve later clipboard changes, and never submit. Measure task completion and characters saved in a consented pilot. |
| P1 | Scale search and backups using measured constraints | Benchmark 5k/10k long-body/history archives and cancellation. Design chunked authenticated export/atomic restore without weakening the existing WorkGate or session-generation checks. Compare encrypted index alternatives with leakage and memory budgets before adopting one. |
| P2 | Add optional account/device sync and the website archive | Select service/auth/hosting only when needed. Use atomic outbox, idempotent ACKs, pull cursors, tombstones and account generations. Test two-account isolation, revoked devices, reordered/replayed traffic, offline edits/deletes and Windows-to-Mac convergence. A static product website is not a synced vault. |
| Release gate | Complete resource, accessibility, security and distribution validation | Whole-process startup/idle/peak memory and search p95 on real 4/8 GiB Windows/Mac devices; keyboard/NVDA/VoiceOver; independent security review; original-source licence decision, dependency notices, signing/notarization, update and rollback drills. |

## Useful optimizations to investigate

1. Keep collection event-driven and avoid retaining drafts in the extension. Measure whether the latest guards affect per-send latency before adding caches or more workers.
2. Improve recall relevance with user-labelled tasks before replacing bounded scans with an index or embeddings. Include Telugu/Hindi/English queries, scope boundaries, deleted sources and AI-generated examples in the evaluation.
3. Measure Node, browser/WebView, extension and native host separately and together. Cache-hit latency and point-in-time Node RSS are not whole-app performance guarantees.
4. Add more sites only after the current three have a recorded consent/capture matrix. Prefer adapters and snapshot reconciliation over attempting to infer pasted/dictated text from key events alone.

## External acceptance still needed

Real provider/model evaluation needs a key configured locally through the supported credential workflow. Real Mac validation requires a Mac. Browser permissions must be granted through the browser's normal controls. Code can progress with synthetic fixtures while those gates remain open; do not replace them with fabricated device evidence or enable capture/inference for existing users.
