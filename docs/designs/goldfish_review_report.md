# Goldfish annotated review report: Windows recording core

Date: 31 October 2026. Target: [V1_MONITORING_CORE.md](V1_MONITORING_CORE.md), full file (original round: lines 1–69). Owner evidence: [two verbatim requests](../../V1_CORE_REQUESTS.md). Scope is the Windows recording core only, not the broader prompt-memory roadmap.

## Execution record

The complete [EGM plugin](https://github.com/google/elephant-goldfish-model) was installed with `codex plugin marketplace add google/elephant-goldfish-model` and `codex plugin add egm@egm`. CLI returned installed root `egm/egm/0.1.0`. The separately inspected upstream checkout was commit `403d8881d62022490637d740657b33f01e321ea8`. Its Codex integration, review-loop, resolve workflow, personas and standards were read. Installed skills become available in subsequent sessions; this review directly read the installed bundle.

| Round / reviewer | Standard | Execution |
| --- | --- | --- |
| 1 design_critic | feature-spec-standard | Completed in a new agent with no parent conversation; read-only, no builds/tests |
| 1 implementation_readiness | implementation-readiness-standard | Completed in a new agent with no parent conversation; read-only, no builds/tests |
| 1 codebase_details | re-implementation-standard | Completed in a new agent with no parent conversation; read-only, no builds/tests |

Each reviewer read its persona, standard, target and selected code context. Actual reports were returned before synthesis. None was treated as a zero-finding pass. The owner's instruction to make product decisions and continue authorized configuration and proposed repairs; no additional confirmation was inferred from elapsed time. Subsequent engineering by those agents is implementation work, not another independent Goldfish round.

**Round 1 verdict:** fails feature-spec/readiness/re-implementation standards as originally drafted. The full requested recorder is not complete. This report does not claim EGM convergence or a release approval. Revised design and the supported-native-field implementation require verification; missing full-core lanes remain blockers.

## Prioritized findings and dispositions

### design_critic-1-1 — Blocker: full-core completion scope remains undecided

Affected original lines: 17–24, 53–57, 65, 69. Copy-only, raw keys, browsers and structured grouping remain unresolved while the release gate refers only to “covered” inputs. An engineer could complete the detailed increments without delivering the owner's distinguishing requirements.

**PROPOSE FIX, applied to scope:** Explicitly name this change the supported-native-fields increment and preserve each missing input/source as an open full-v1 acceptance row. No full-core or universal-recording claim. **Still open for full v1:** executable designs and real acceptance for raw input history, copy-only, browser capture, rapid submit/clear and editing reconstruction.

### design_critic-1-2 — Blocker: global eligibility does not prove unknown/private exclusion

Affected lines: 20, 22, 28–32, 54. A denylist and editable/password metadata cannot prove unfamiliar apps, renamed browsers or embedded private editors are safe before reading.

**PROPOSE FIX, partly applied:** Preserve all current producer gates, exclude known browsers/credential/system processes, reject unsupported/password/read-only/unknown-editability controls, and make the single agreement warn that ordinary fields can contain private text. Stop describing a denylist as universal private-mode detection. **Still open for full v1:** verified identity/provider classification and browser/private acceptance. The developer increment is not approved for indiscriminate sensitive use.

### implementation_readiness-1-1 — Blocker: independent recording generation and state contract missing

Affected lines: 9, 30, 40, 53–54, 61. Vault generation alone cannot reject delayed approval/snapshot bodies across Stop → Record while the vault remains unlocked; native post-await approval can start an obsolete producer.

**PROPOSE FIX, implemented pending final checks:** Separate capture generation, exact session UUID, native intent epoch and explicit consent/start/stop/revoke/status APIs. Agreement stays approved-but-stopped until Record; Stop retains agreement but replaces recording authority; lock/revoke clears it. Add held-body barriers for new and legacy routes across Stop/Record and lock/unlock, and reject stale responses before native state changes. This explicitly replaces the earlier ambiguous “Stop clears permission” wording.

### implementation_readiness-1-2 — Blocker: hung-provider isolation/allocation not selected

Affected lines: 42, 55, 61. Task.Run around one getter would leave focus traversal, subscriptions and cleanup capable of blocking the UI; ValuePattern allocation had no mitigation.

**PROPOSE FIX, implemented pending final checks:** All new-lane UIA runs in one owned child process, bounded private IPC and heartbeat watchdog, no automatic restart; Stop invalidates results and kills/reaps that exact child off the UI thread. Keep the lane occupied until exit. Disable ValuePattern fallback in the new worker rather than claim its getter is bounded. Legacy helper behavior remains separate. Real third-party hangs and whole-process memory remain acceptance gates.

### codebase_details-1-1 — Blocker: current browser UI description contradicts source

Affected line: 20. `Program.cs.BuildWorkspace` exposed More options → Connect browser; the draft described it as already hidden.

**PROPOSE FIX, applied:** Mark hiding as proposed work, then remove browser selector/pairing, per-app picker and other connection controls from the native visual tree. Preserve legacy API/helper source for compatibility, not as hidden automatic pairing. Verify the actual compiled window.

### design_critic-1-3 — Major: capture timing and loss contract missing

Affected lines: 15–16, 24, 38, 42, 56, 63–65. A restarting 1.3-second debounce misses type→send/clear, field switches and uninterrupted typing; empty values are discarded and 15 writes/minute can drop ordinary edits.

**PROPOSE FIX, scope applied:** Document that this increment records settled nonempty resulting values, not every key/edit. Rate exhaustion stops visibly. Rapid submit/clear, cut-all/delete-to-empty and continuous-edit completeness remain failed full-v1 rows, not advertised support. A new operation/event evidence model and reconciliation tests remain necessary.

### design_critic-1-4 — Major: evidence identity cannot support field separation

Affected lines: 19–21, 36, 40, 57. App-only dedupe and fixed editorId/sourceSequence discard equal text in independent fields.

**PROPOSE FIX, implemented pending final checks:** Separate recording UUID, field-episode UUID, normalized application name and increasing server sequence using existing schema fields. Scope dedupe to field episode, bound retained field keys, preserve paragraph newlines, and test two fields with identical values. Rebinding starts a new episode; document that this is not a persistent document identity or semantic paragraph reconstruction.

### design_critic-1-5 — Major: UIA isolation requirement has no selected design

Affected lines: 42, 55, 69. A permanently blocked lane and cleanup can hang; ValuePattern allocation remains unbounded.

**PROPOSE FIX:** Same selected process boundary and disabled fallback as implementation_readiness-1-2. Preserve the finding's severity; runtime tests must establish its actual limits.

### design_critic-1-6 — Major: continuous capture has no storage/resource budget

Affected lines: 36, 42, 63, 69. Full snapshots plus editable copies can grow rapidly; per-request/minute limits do not bound the archive.

**PROPOSE FIX, implemented pending final checks:** Developer increment caps new monitoring ingestion at 200 saves or 2 MiB input per service lifetime, with visible stopped capacity state and no automatic deletion. Stop/Record does not reset counters. This is not a whole-vault/disk budget: existing backup limits, retention/compaction, disk-free admission and sustained 4/8 GiB hardware acceptance remain open for full v1.

### implementation_readiness-1-3 — Major: global allowability predicate unspecified

Affected lines: 22, 32, 38, 40, 54–55. Ordering and unknown-field behavior are undefined.

**PROPOSE FIX:** Revised design names foreground/source/ancestry/password/sensitive-name/onscreen/writable checks and unchanged denylist. New worker's source excludes its own parent executable. General private-context classification remains open under design_critic-1-2; no “all private text excluded” claim is made.

### implementation_readiness-1-4 — Major: deletion and identity lack evidence contract

Affected lines: 16, 19, 21, 38, 56–57, 61. Empty states and per-field ordering are undefined; app-only dedupe loses observations.

**PROPOSE FIX:** Identity/ordering implemented as above; explicit nonempty-snapshot limit retained. Delete-to-empty and operation history remain open, not silently encoded as fabricated text. New record semantics remain schemaVersion 1 but older validators may reject them; full stopped-vault pre-upgrade backup is required and downgrade compatibility is not promised.

### implementation_readiness-1-5 — Major: no executable file/checkpoint plan

Affected lines: 17–21, 51–69. The plan lists architecture work without exact files, stable checkpoints or executable proof.

**PROPOSE FIX, applied:** Add the file plan, exact API/state/identity contract and focused test/build/manual checkpoints. Treat absent copy/browser/session reconstruction as separate architectural work instead of an instruction to “finish” unspecified functionality.

### codebase_details-1-2 — Major: recording invalidation independent of vault missing

Affected lines: 30, 40, 54. Same Stop/Record flaw in existing `readBody`/pause behavior.

**PROPOSE FIX:** Covered by implementation_readiness-1-1; include retained legacy capture/bridge mutations in generation checks, not only the new snapshot route.

### codebase_details-1-3 — Major: exclusion rule has no classification contract

Affected lines: 22, 32. Generic denylist permits nonempty unknown processes, while evidence fills normal/private=false.

**PROPOSE FIX:** Covered by design_critic-1-2 and implementation_readiness-1-3. Preserve unknown content classification, disclose normal-field private-text risk, and keep general private-source certification open.

### codebase_details-1-4 — Major: dedupe conflicts with grouping

Affected lines: 19, 21, 42, 57. Constant field identity and per-executable digest collapse separate fields.

**PROPOSE FIX:** Covered by design_critic-1-4 and storage/HTTP compatibility tests.

### codebase_details-1-5 — Major: changed-text/deletion semantics missing

Affected lines: 16, 38, 56. Debounce, focus rebaseline and empty rejection produce different results from exhaustive input recording.

**PROPOSE FIX:** Covered by design_critic-1-3. This remains a full-v1 completeness blocker despite transparent increment documentation.

### codebase_details-1-6 — Major: reproducible bounded UIA design missing

Affected lines: 42, 55. Parent/UI cleanup must not run provider code, and timeout/recovery limits are unspecified.

**PROPOSE FIX:** Covered by implementation_readiness-1-2; use owned process termination and no replacement before actual exit, with synthetic lifecycle tests. Real editor/provider acceptance remains open.

### codebase_details-1-7 — Major: archive and backup admission missing

Affected lines: 36, 42, 69. Separate copies can exceed existing 12 MiB/10k portable snapshot limits.

**PROPOSE FIX:** Covered by design_critic-1-6. Service-lifetime development caps bound new ingestion only. Large existing archives, growth/compaction and disk capacity remain unresolved; do not advertise lossless all-day history or portable backups of arbitrary size.

### codebase_details-1-8 — Major: session API/state machine missing

Affected lines: 30, 40, 54. Existing ready/paused/unpaired state cannot drive one recording flow.

**PROPOSE FIX:** Revised design and implementation define `.monitoring` status and exact consent/start/stop/revoke/snapshot routes, with explicit approved-but-stopped state and capacity/rate gaps.

## Completion boundary

No findings were contested or silently downgraded. Text/API/implementation repairs are not equivalent to closed real-device acceptance. The full owner-request blockers are the raw input/copy/browser lanes, rapid edits/clear reconciliation, private-source classification, persistent document/paragraph grouping, sustained resources/storage/recovery and installed-build validation. These remain on the core v1 workstream; unrelated feature development is deferred.

Final observed test/build results and any independent follow-up review are recorded in [TEST_REPORT_V0_9.md](../TEST_REPORT_V0_9.md) and later sections appended here. Do not call a single repaired round “converged”: EGM requires two consecutive clean rounds, and the initial round was not clean.
