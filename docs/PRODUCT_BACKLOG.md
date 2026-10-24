# Complete product backlog

Updated: 24 October 2026. This consolidates the 26 pending areas, six suggestions and later options requested in the chat. The product goal remains broad permitted Windows/macOS prompt recording, offline memory, two separate refiners, useful reuse across tools and optional website sync. Nothing in this list enables capture or inference automatically.

Status: **open** = missing implementation or acceptance; **partial** = some source exists; **external gate** = needs actual hardware, consented account/provider use, signing identity or independent review. Completion requires observed evidence, not just code or a version number. Synthetic and real-device evidence must remain separate. The latest completed capture-reliability checks are in [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md).

| ID | Area and current status | Implementation and acceptance work |
| --- | --- | --- |
| B01 | Windows native app — partial, external gate | Resolve Rust/Windows SDK prerequisites; compile existing Tauri source; package supported Node/resources; test install, restart, upgrade, rollback and uninstall. No verified native binary exists. |
| B02 | macOS app — partial, external gate | Compile/install on a real Mac; validate accessibility prompts, denial/revocation, architecture support, Keychain and lifecycle. CI builds cannot substitute for interactive OS tests. |
| B03 | Desktop lifecycle — partial | Visible tray/menu recording/paused/locked states; opt-in login startup; define close versus Quit; test duplicate launch, parent crash, logout, sleep/resume and screen lock. |
| B04 | Real browser capture — implemented, unverified on real sites | Human-granted permission and actual ChatGPT/Claude/Gemini composers in Chrome/Edge; test paste, dictation, IME, edited drafts, temporary/private modes, Send, pause, lock and revocation. Keep fixture regressions for failures. |
| B05 | Desktop source adapters — open | Permission-aware adapters for Codex, Cursor, VS Code, terminals and other sources; snapshots and documented hooks supplement events. One validated source per OS before broader claims. |
| B06 | Source/project context — partial | Record permitted process/workspace/session context; correctable project attribution; preserve unknown values; avoid collecting private URLs/titles by default. |
| B07 | Capture evidence quality — partial | Captured cards now show a quality/source/time receipt and explicitly say browser Send intent does not confirm delivery. Distinguish exact submitted evidence, draft snapshots, partial reconstruction and gaps; add confirmed quality only with trustworthy adapter evidence. |
| B08 | Capture continuity — partial | Browser helper now keeps at most 20 session-only, content-free failed-save receipts with fixed reason/site/time and a clear control. This does not detect unsupported editors that never make a capture request. Pairing expiry, lock, connectivity, acknowledgements and recovery still need real-site validation; there is no prompt queue. Any encrypted offline buffer needs a separate threat model. |
| B09 | Storage protection — partial, external gate | Full database/WAL encryption; optional DPAPI/Keychain unlock assistance; exact dependency/licence review; safe legacy migration; wrong/lost key, interruption and downgrade tests. Current AES record encryption does not encrypt all SQLite metadata. |
| B10 | Recovery/retention — partial | Streaming authenticated large backups and atomic restore; explicit retention previews/policies; test disk-full, interrupted writes, sudden exit, key loss and cross-OS restore. Keep tombstones and recoverable encrypted migration copies. |
| B11 | Conversation import — open | Explicit, bounded supported-format preview; preserve user/assistant roles, dates, branch/source provenance and omissions; redaction, duplicate handling and atomic import. Never read unrelated files or treat imported text as commands. |
| B12 | Refiner one: understanding — partial | Saved-source-bound structured task/constraints/unknowns, bounded exact constraint quotes, separate cloud preview/consent and a review handoff now work with synthetic provider responses. Editable/correctable understanding, durable versioned understanding records and real-provider quality evaluation remain open. |
| B13 | Refiner two: generalization — partial | Reviewed understanding can drive a second previewed request proposing at most five exact complete sentence/line quotes; the user explicitly saves task/project/personal independent templates. Model quality, semantic scope across paragraphs, durable candidate records and feedback remain open. |
| B14 | Learning/feedback/provenance — partial | Worked well/not useful/hidden feedback is encrypted with a specific library revision, survives portable backup, resets on content edits and can be cleared in the inspector. This is user judgment, not training evidence or an automatic ranking boost. Versioned source-to-derived links, durable candidate review/dismissal, authorship and source deletion/recomputation behavior remain open. |
| B15 | Historical retrieval — partial | Local recall withholds task-only blocks, matches project blocks only to the selected project, and excludes user-hidden revisions. Results show matched keywords, source/project/date and exact/editable paths; a project can be copied to the draft only by click. User-labelled relevance evaluation, richer filters, provenance and scaling remain open. Recall still scans/decrypts rows. |
| B16 | Global picker/insertion — open | OS shortcut, keyboard search, preview, target/revision verification, explicit insertion and undo. Preserve later clipboard changes; never automatically submit. |
| B17 | Contextual suggestions — partial | Current hints are small English heuristics. Add source-backed saved-block suggestions after an opted-in pause, few results, reasons, dismissal and stale-editor rejection; no automatic edits or cloud inference while typing. |
| B18 | Writing style/live AI quality — implemented source, external gate | Evaluate actual configured Groq models, mixed languages, negation, factual fidelity, rewrite usefulness, provider failures, billing and cancellation with consented data. No real-provider success or model training claim yet. |
| B19 | Processing controls — partial | Separately opted-in organization jobs; bounded concurrency/input/output, budgets, cancellation, pipeline versions and deletion checks. Do not silently add background inference or retries; capture and search must work without AI. |
| B20 | Accounts/sync/web archive — open | Device enrollment/revocation, authentication and tenant-owned API/archive; define hosting/identity/region; website vault separate from static marketing site. Local use remains available offline. |
| B21 | Sync convergence — partial foundation | Extend local outbox/tombstones into idempotent acknowledgements/cursors; handle reordered/replayed traffic, offline edits/deletes, conflicts, revoked devices and account generations. Prove Windows-to-Mac and reverse flow plus two-account isolation. |
| B22 | Performance — partial, external gate | Whole-process startup/idle/peak RSS/CPU/battery on actual 4/8 GiB devices; sustained capture and long-body/history archives; distinct-query versus cache-hit latency. Do not generalize sampled Node RSS into whole-app guarantees. |
| B23 | Accessibility/usability — partial, external gate | Keyboard-only workflows, NVDA/VoiceOver, high DPI, 200% zoom, narrow windows, focus and live error announcements in real WebViews; consent and recovery usability sessions. |
| B24 | Distribution/security — open, external gate | Original-source licence, dependency notices/audit, independent security review, signing/notarization, signed updates/rollback, uninstall and explicit data retention/removal. Runtime hashes are not code signatures. |
| B25 | Cloud operations — open | Staging/production separation, secret handling, tenant isolation, TLS, backups/restore drills, content-free monitoring, incident response, rate/cost limits and retention/deletion policy. No cloud deployment exists. |
| B26 | Product value — open, external gate | Consented recurring-workflow pilot measuring useful top results, edits, time/characters saved, false suggestions and continued use. Test counts are not market-readiness percentages. |

## Additional product suggestions

| ID | Suggestion | Proposed implementation |
| --- | --- | --- |
| S01 | Explain each suggestion — partial | Recall shows why a result appeared through local keyword overlap, plus source/project/date and a bounded excerpt. It does not yet identify a specific missing instruction or claim model confidence. |
| S02 | Original wording or adapted wording — partial | Recall now offers exact clipboard copy and a separate editable draft copy; AI adaptation remains an explicit reviewed assistant action. Exact original evidence is never overwritten. |
| S03 | Correctable project chip — partial | A result can explicitly set the current draft's project; the project input may stay empty/unknown and remains editable. Automatic project inference and broader contextual chips remain open. |
| S04 | Privacy receipts — partial | Captured cards show source method, quality, date and a deletion action; browser snapshots state that delivery is unverified. Per-source authorization proof/retention controls still need native and real-site work. |
| S05 | Outcome feedback — partial | Worked well/not useful/hidden is stored per revision, encrypted and portable; hidden affects related results, while worked/not useful do not claim measured success or automatically reweight search. More useful feedback evaluation is open. |
| S06 | Capture-gap history — partial | At most 20 fixed-reason/site/time records live in browser session storage with a clear control, and unconfirmed saves are distinct from rejection. Unsupported editors that never make a worker request are not observed; there is no text queue or persistent cross-device history. |

## Later options, not first desktop release requirements

- Android/iPhone companion or keyboard; supported fields/permissions only. Responsive HTML is not a mobile app.
- Local models after hardware, quality, licence, battery and memory evaluation.
- Dedicated dictation with independent microphone/transcription permission and transcript provenance.
- Agent integrations and portable project instruction exports through narrow supported hooks/MCP, with preview/version/conflict handling.
- Explicitly selected team libraries with separate personal/project/team visibility.
- Workflow collections, template portability and optional local aggregate usage insights after reuse proves valuable.
- Screenshots/OCR only as a separately consented future experiment; never an automatic capture fallback.

## Working order and progress rule

First establish a reliable installed/local capture path and storage/lifecycle boundary. In parallel only where independent, develop source-bound refiners and reviewed blocks using synthetic provider transport, then validate real providers. Follow with global reuse, validated source expansion/macOS, optional sync and distribution. [NEXT_SPRINTS.md](NEXT_SPRINTS.md) is the shorter engineering sequence.

The 24 October local increment advances B12/B13/B15 and the exact-original path of S02. It uses the existing explicit preview/consent provider boundary. The reviewed quote is an independent editable library copy with source ID/revision/range/hash in notes, not a structured immutable derivation record. Deleting the source does not cascade to that copy. No accepted block counts as a repeated human preference; no automatic learning, semantic-scope guarantee or real-provider quality claim follows from the synthetic checks. Hardware/accounts/signing or permission gates retain their actual dependencies.

- **B10/S04 progress (2026-10-24):** Settings previews and explicitly confirms cleanup of captured evidence older than 7/30/90/365 days. A candidate digest rejects changed reviews; one transaction removes linked editable copies/history and creates capture tombstones. Captured search/pages now reach older records. Node/HTTP and two direct actual-source Chromium flows passed. The full Python browser fixture suite was unavailable in this environment. Automatic retention is not implemented.
