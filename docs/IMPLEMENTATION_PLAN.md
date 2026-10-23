# Implementation plan

Prepared: 19 October 2026. Status: M0 in progress. This document is the implementation plan; see [M0 progress](M0_PROGRESS.md) for the executable synthetic foundation and measured checks. Research, native runtime validation, and product validation are separate activities.

## 1. Product objective

Help the user avoid retyping familiar instructions across AI tools and projects, recover prompts from months ago, and remember relevant constraints. Collection happens automatically in permitted desktop surfaces. Local operation continues offline; a connected account synchronizes records and receives refined templates from the service.

The differentiator is the learning loop: retained source history becomes reusable instructions and returns during the user's work. A growing archive without easy reuse is insufficient.

## 2. First-release scope

### Included

- Installable Windows and Mac app with visible recording status, pause, exclusions, startup option, and permission diagnostics.
- Broad input observation plus focused editor snapshots where available; source confidence and capture gaps are visible.
- Encrypted local source archive, search, retention, export, and offline upload queue.
- Account connection, device management, eventual sync, deletion propagation, and a web archive.
- Automatic understanding followed by separate pattern/template extraction, linked to source prompts.
- Personal and project scopes, reusable instruction blocks, template versions, and original wording.
- Global search/picker and user-triggered insertion; contextual suggestions only in measured supported surfaces.

### Deferred

- Android/iPhone keyboards, screenshots/video, always-on audio, enterprise monitoring, team sharing, automated task execution, autonomous submission, and model fine-tuning.
- Full editor-like inline completion in every application. Native picker works first; per-surface contextual assistance expands later.
- A graph database, CRDT collaboration, custom vector service, and multiple competing memory frameworks.

These boundaries do not remove the broad desktop recorder from the design. They keep expensive media and unrelated execution features outside the first release.

## 3. User experience to deliver

1. Install and connect an account; enable permitted collection after seeing its scope.
2. Work across selected desktop AI/development tools as normal. Tray shows recording, pending uploads, and capture limitations.
3. Open the archive and see retained original prompts with source, time, project, and capture quality.
4. Search “the project-starting prompt I used months ago.” Find an original and any derived template.
5. Use a global shortcut from another tool, pick a prompt, fill only genuinely missing fields, and insert it.
6. Receive occasional suggestions based on the current draft. Edit, accept, or dismiss without leaving the task.
7. Change computers and see the same synchronized history and templates after connection.

Primary web views: archive/search, prompt detail with original/understanding/template links, projects, template editor/history, devices/sync, and capture/retention settings. Daily recap is optional and secondary to retrieval.

## 4. Initial surface matrix

Test the exact installed versions during M0. This table describes intended tests, not existing compatibility.

| Surface | Initial route | What to establish |
| --- | --- | --- |
| ChatGPT, Claude, Gemini in Chrome/Edge | Broad native collector plus later DOM adapter | Long drafts, contenteditable inputs, paste, dictation, conversation identity, send detection |
| Codex desktop | Native collector/editor access; evaluate documented hooks for installed configuration | Whether full draft text and submitted text are accessible; no blanket hook-support assumption |
| Cursor | Native collector plus submission hook adapter | Agent chat text versus normal code editing; workspace identity |
| VS Code | Native collector; add specific chat adapter only where exposed | Distinguish editor code from chat prompts; extension-specific coverage |
| Claude Code / OpenCode terminal | Native collector plus native hook/plugin where available | Multiline prompts, terminal rendering, session identity, edits; terminal observation alone is partial |
| Antigravity | Native collector; evaluate lifecycle integration | Inspect actual payloads before committing an adapter |
| Kimi and Qwen web | Generic native collection followed by site-specific adapters | User referred to “queen”; Qwen is a tentative interpretation, not confirmed |
| Other tools | Same recorder plus optional explicit capture | Unknown sources remain unknown; no invented project or successful-send labels |

Support labels: exact submitted capture, exact draft snapshot, partial/reconstructed, explicit-save only, or unavailable. Publish measured labels per OS/tool/version, with known failure examples.

## 5. Stack and adoption decisions

Use Tauri 2 + Rust + React/TypeScript for the installed app; SQLCipher-backed local storage; Next.js web/API; a separate TypeScript worker; PostgreSQL with pgvector introduced for semantic retrieval. Share typed contracts and selected UI components. See [technical design](TECHNICAL_DESIGN.md) for boundaries and data flow.

Candidate libraries are evaluated behind interfaces rather than embedded throughout the product. rdev may help input observation; Enigo may help insertion. ActivityWatch and Espanso inform interaction/context choices. Memento is a close system reference. Current Screenpipe source is commercially restricted and is not a free foundation for this build. See [research](RESEARCH.md) for exact licence evidence and revisions.

No provider-specific AI SDK or hosted memory backend is selected yet. The first milestones use synthetic fixtures and deterministic processing; provider credentials are configured before real model calls. Account creation, paid hosting, production deployment, and signing credentials are not assumed to exist.

## 6. Milestones and acceptance criteria

Effort ranges below are planning assumptions in engineering days for one experienced developer with working Windows and Mac test access. They are not delivery commitments. Distribution credentials, native bugs, and iteration on the user's data can extend them. Do not implement every milestone in one undifferentiated change.

### M0 — Prove collection and encrypted storage

Estimated effort: 4–7 days.

Deliver a small local-only harness with a visible capture switch, permission status, selected-app scope, text-event/snapshot reconciliation, and encrypted storage. Run the same synthetic scenarios on Windows and Mac. Keep AI and cloud work out of this experiment.

Acceptance:

- Capture at least 95% of complete final text in the declared supported fixture cases; measure both exact-match and character error rate. Report numerator/denominator per surface, not only a combined average.
- Incorrect or unsupported reconstructions are marked partial/unknown. App switching does not combine text from two editors.
- Typed text, large paste, dictation-to-text, mouse selection/replacement, undo/redo, multiline edits, non-Latin input, and emoji are represented in the test set.
- Protected/excluded fixtures do not reach database, WAL, logs, outbox, or exports. Include credential canaries and permission-revocation tests. Passing fixtures does not prove universal credential filtering.
- Crash/restart preserves committed records without duplicating them. Sleep/resume and app closure produce explicit gaps/status when necessary.
- SQLCipher opens only with the correct key; database/WAL/temp inspection finds no synthetic plaintext canaries at rest.
- Run a 4-hour soak on each platform and record CPU, memory, event loss, and database growth. Proposed budget: idle average CPU under 1%, normal text-collection average under 3%, combined desktop RSS under 250 MB. Targets must be measured on named hardware; investigate failures before adding media or models.

Decision: retain the broad recorder even if a few surfaces need adapters, but do not claim exact universal capture. If essential surfaces cannot be reconstructed, resolve them with snapshots/hooks before progressing to AI features.

### M1 — Useful desktop archive

Estimated effort: 5–8 days after M0.

Implement the Tauri shell, tray/menu bar, capture controls, local archive/search, source-quality labels, pause/exclusions, retention, deletion, export, and startup preference. Support original text and manual project assignment. No cloud dependency for these actions.

Acceptance:

- Closed window does not imply recording stopped; tray state is accurate. Quit actually stops collection. Startup capture respects saved enablement and OS permissions.
- Local search returns known results from a 50,000-item synthetic archive; proposed p95 response target below 200 ms on named test hardware.
- Raw and derived content cannot appear in diagnostic logs. Export is explicit and shows what is included.
- Local delete and retention purge associated indexes and pending upload intents.
- First personal-use trial shows the user can recover previously captured prompts without creating folders or templates first.

### M2 — Account, web archive, and reliable offline sync

Estimated effort: 7–10 days after M1; schema/service scaffolding can overlap later M1 work.

Implement browser-based device sign-in, revocable device tokens, server archive, atomic outbox, push/pull cursors, per-item acknowledgments, batch bounds, and deletion barriers. Website supports account-owned search and prompt details. Deploy to a local development service first; choose staging hosting before external rollout.

Acceptance:

- Simulate 48 hours offline, reconnect, drop/reorder/replay requests, kill client mid-batch, and verify eventual convergence with zero duplicate logical operations.
- Acknowledged records survive client restart; unacknowledged records remain queued. Invalid credentials show actionable status.
- Delete a prompt on computer A while computer B is offline. B applies deletion before attempting a stale upload; derived records do not recreate deleted content.
- Concurrent template edits keep a conflict copy rather than losing work. Account wipe rejects old-generation writes.
- Automated two-account tests demonstrate isolation for direct IDs, search, exports, workers, and sync. A revoked device cannot sync.
- Test actual Windows-to-Mac and Mac-to-Windows flow; one-machine simulated clients alone are insufficient for sign-off.

### M3 — Two AI refiners and historical semantic search

Estimated effort: 7–11 days after M2.

Configure an AI provider through the supported credential workflow. Implement structured-output understanding, reusable-pattern candidates, source attribution, scoped preferences, pipeline versioning, retries, budgets, and hybrid keyword/semantic search. Processing runs in the worker, outside ingestion requests.

Acceptance:

- Evaluate on at least 100 consented prompts spanning several projects, plus synthetic adversarial cases and a time-separated holdout. Keep test data out of Git unless explicitly sanitized and approved for that use.
- Original text is unchanged; candidates reference valid source spans. A changed model/prompt version can reprocess without duplicating active results.
- Holdout scenarios preserve negation, “research only” boundaries, variable names, mixed language, and project-specific facts. Any critical scope escalation or cross-project leak blocks release.
- At least 80% of a user-labelled set of 30 or more historical retrieval tasks return a useful result in the top three. This is a proposed product gate, not a benchmark claim.
- User feedback determines usefulness; model self-reported confidence is not sufficient. Suggested text is not counted as independent repeated user authorship.
- Worker timeouts or exhausted budget do not break capture, sync, keyword search, or existing templates.

### M4 — Fast reuse and contextual suggestions

Estimated effort: 6–10 days after M1/M3; picker can ship before model features.

Deliver global shortcut, local cached search, project selection, original/template previews, explicit insertion, and minimal field filling. Add browser draft adapters for the user's most-used sites. Introduce suggestion panel after pause only where draft access is verified.

Acceptance:

- Capture-to-reuse demonstration: a prompt from one tool is found and adapted in another, on both computers.
- Focus changes and newer draft revisions invalidate stale suggestions; insertion never targets an unexpected editor.
- The tool never submits a prompt automatically. Clipboard restoration does not overwrite a later user copy operation.
- Suggestion acceptance, modification, dismissal, and “do not suggest again” are persisted against a template revision.
- Local picker retains the M1 speed target; live suggestions should begin showing cached results within 300 ms after the configured pause on reference hardware.
- Five working days of user trial show a proposed minimum 30% reduction in manually entered characters for at least three recurring workflows, without critical changes to intended scope. Measure only permitted prompt fields and compute locally. Dismissal rate and post-insertion editing are reviewed alongside savings.

### M5 — Installers, updates, and beta hardening

Estimated effort: 5–9 days, partly overlapping earlier milestones.

Deliver signed Windows installer and signed/notarized Mac build, controlled startup, signed updater, migration/rollback strategy, permission diagnostics, support bundle without content, and accurate compatibility/retention documentation. Initial test architecture is Windows x64 and Apple Silicon Mac; Intel Mac support requires its own build and runtime test before advertising it.

Acceptance:

- Fresh install, upgrade, uninstall, permission denial/revocation, screen lock, sleep/resume, disk-full, and network failure have tested outcomes.
- Upgrade preserves encrypted data and does not broaden collection without an explicit setting change. A bad update cannot replace a working build without a recovery route; database migrations preserve a recoverable encrypted backup.
- Uninstall stops background collection; data removal versus retention is explicit. OS permission changes do not trigger attempts to bypass them.
- A seven-day pilot has no unexplained data mixing, silent collector loss, or uncontrolled storage growth.
- Dependency notices, licence review, auth/tenant tests, and deletion/backup behavior are checked before distributing outside the personal pilot.

Milestone effort sum is roughly 34–55 engineering days before contingency. Native platform issues and product iteration can add substantially. The first useful local archive is M1; it does not need to wait for cloud or AI completion.

## 7. First engineering backlog

| ID | Task | Depends on | Concrete completion evidence |
| --- | --- | --- | --- |
| F01 | Validate desktop prerequisites and select stable dependency releases | None | Windows toolchain checklist; Mac toolchain/hardware availability; version pins |
| F02 | Define observation, prompt, capability, and capture-state contracts | None | JSON Schemas and generated Rust/TS round-trip fixtures |
| F03 | Implement capture policy and exclusion decision function | F02 | Table-driven allowed/excluded/unknown/protected fixtures |
| F04 | Prototype Windows focused-editor/context collector | F02/F03 | Synthetic scenario output with quality flags |
| F05 | Prototype Mac event/context/editor collector | F02/F03, Mac access | Same scenario output and permission behavior |
| F06 | Reconcile snapshots/events without assuming final submission | F04/F05 | Replay fixtures for paste/edit/focus/undo/dictation |
| F07 | Prove SQLCipher packaging and OS secret storage | F01/F02 | Correct/wrong-key tests plus database/WAL/temp canary inspection |
| F08 | Add visible harness controls and collector health | F04/F05/F07 | Recording/pause/permission/gap demonstration |
| F09 | Publish capture coverage and resource results | F06/F08 | Per-tool/OS measurements and unresolved limitations |
| F10 | Build desktop archive and first search/picker | M0 pass | Recover a prompt without cloud or manual filing |

No recorder is installed or enabled merely by writing this backlog. Run the eventual harness visibly with synthetic text first, then the user's chosen scope.

## 8. Environment and release prerequisites

Observed on this Windows workspace: x64; Git, Node, npm, pnpm, and Python resolve on PATH. Rust/Cargo, CMake, and Docker did not resolve on PATH. This is not proof that no installation exists elsewhere. MSVC build tools, WebView2, compatible compiler versions, and SQLCipher crypto dependencies have not been verified.

Before desktop development, install/verify the required Windows Rust/native toolchain. Docker is optional if PostgreSQL is run another way. Before Mac sign-off, obtain a Mac with Xcode command-line tools and test permission prompts on real hardware. A remote/CI Mac can build packages, but it does not replace all interactive capture tests. Signing accounts and secrets are needed before public distribution, not for the initial plan.

## 9. Capacity and cost model

No hosting or model prices have been quoted or purchased. These are workload assumptions to help choose services later:

- At 100 prompts/day and 5 KB of retained text per prompt, text payload alone is about 182.5 MB/year. Metadata, indexes, embeddings, replicas, and backups add to it.
- Low-level events and repeated snapshots can be much larger than final prompts. Measure a representative day and enforce retention, snapshot deduplication, and queue limits.
- At 100 prompts/day, 1,000 input tokens and 100 output tokens per understanding job, the first stage uses about 3 million input and 300,000 output tokens per 30 days. Clustering, retries, embeddings, and adaptations are additional.
- Monthly AI spend = input tokens × selected input rate + output tokens × selected output rate + embeddings + retry/adaptation overhead. Apply a per-account budget before scheduling jobs.
- Deployment initially needs a web/API process, worker, PostgreSQL, TLS, encrypted backups, and update hosting. Text-only records can stay in PostgreSQL; add object storage only when exports/media size warrants it.
- Open-source code does not eliminate hosting, inference, signing, backup, or maintenance costs. Paid binaries/services are evaluated separately from source licences.

## 10. Risks to resolve in order

| Risk | First mitigation | Stop/rethink signal |
| --- | --- | --- |
| Recorded keys do not reconstruct real prompts | Focused snapshots, explicit quality labels, adapter reconciliation | Core daily surfaces remain unusable after M0 |
| Sensitive or unrelated text reaches storage | Local exclusions, protected-field detection, canary fixtures, visible scope | Protected/excluded fixture appears in any durable sink |
| User cannot identify what was captured | Capture preview and per-source quality state | Archive regularly labels guesses as observed facts |
| Duplicate ingestion or stale-device resurrection | Transactional outbox, per-item ACK, tombstones and generations | Fault-injection convergence/deletion tests fail |
| Refinement changes meaning | Source spans, scope/negation tests, editable suggestions | A critical intent escalation reaches suggestions |
| Noise outweighs saved typing | Picker first, few suggestions, user dismissal feedback | No measurable improvement in recurring workflows |
| Native upkeep becomes excessive | Narrow interfaces, published compatibility matrix | Platform-specific fixes repeatedly break other collectors |
| Dependency licence/hosting mismatch | Independent core and release-specific review | Required component cannot be used under chosen distribution model |

## 11. Next implementation action

Begin M0/F01–F03: verify toolchains, establish shared contracts, create synthetic input fixtures, and implement capture policy. Then build the Windows harness and the matching Mac harness before implementing the website or real AI processing. The plan intentionally leaves provider choice and branding open while resolving the largest engineering uncertainty first.
