# Windows v1 monitoring core

Status: first EGM round completed; supported-native-field increment in implementation, 31 October 2026. Full requested v1 remains blocked by the coverage gaps below. Product request: [V1_CORE_REQUESTS.md](../../V1_CORE_REQUESTS.md). This scope supersedes manual-library and per-connection onboarding priorities. It does not claim every Windows surface is readable.

## Problem and v1 result

Users want one installed app to remember text they write during normal Windows work, with optional reliable source context, instead of connecting individual tools or saving items manually. The recording core is the sole v1 priority. AI, learned preferences, sync, mobile, macOS and overlays are deferred.

Required customer flow: Open app → Create/Open local Windows vault → Review monitoring permission → Record → inspect encrypted local history → Stop. Monitoring approval alone must not start recording. Restart, lock, service failure and Quit stop recording and clear session approval; closing the window retains a visible tray state. Existing users must explicitly approve this new scope. Browser pairing and per-app selectors disappear from native onboarding rather than being simulated or auto-approved behind the scenes.

## Coverage contract

| Input/context | Requested final v1 behavior | Existing implementation and required work |
| --- | --- | --- |
| Typed text | Observe text changes in supported ordinary editable fields | Current keyboard callbacks signal activity, not key values; field snapshots can obtain resulting text |
| Paste/cut/edit/autocomplete | Record resulting changed field values where the editor exposes them | UIA text/value events and focused snapshots can observe resulting text; not proof of which operation caused it |
| Copy without changing a field | Preserve selected/copied text only within explicitly covered source/context | Not implemented; needs selection/clipboard-event design with pre-read sensitive-source exclusion. Do not record arbitrary existing clipboard contents or poll clipboard |
| Raw keystroke history | Owner asks for keyboard-based tracking | Not implemented; do not present accessibility snapshots as raw key evidence. A future key-event lane needs context gates before payload reads, composition/edit reconstruction and explicit incomplete labels |
| Application grouping | Attribute evidence to foreground application at observation | Existing executable-name attribution; no publisher identity guarantee. Revalidate source and field before committing |
| Browser/site grouping | One UI; identify website only when verified | Native producer currently excludes browsers. Removing legacy browser connection controls is part of this increment; the helper remains in source. No reliable general private-mode/site adapter. Browser coverage remains blocked until tested without bypassing permissions |
| Paragraph/session grouping | Keep source text boundaries and reliable grouping where known | Current field body preserves newlines; no structured editing-session/paragraph model yet. Never merge two fields/apps because their text resembles each other |
| Recognized password/protected controls and unknown editability | Excluded before text is read | Preserve foreground/ancestry/process, known credential/browser process, password, onscreen, sensitive-name and writable-metadata gates. This does not prove ordinary fields contain no private text; the monitoring agreement explicitly warns about that limitation |

The full v1 is not complete until each advertised input and source has acceptance evidence. The first implementation may simplify the native UI and unify session control while maintaining a prominent supported-field coverage statement. That is an increment toward v1, not a substitute for the requested full core.

## Permission and access model

The in-app monitoring agreement describes local text access, non-prompt capture, source metadata, excluded contexts, encryption and Stop/revoke. It is a product consent, not a Windows-wide permission API. No automatic administrator elevation, UIAccess assertion, driver installation, browser-policy change or system security bypass.

The service owns an authenticated, desktop-only recording-session gate scoped to the unlocked vault generation and a separate monotonically changing capture generation. Start is a separate explicit action after consent. Stop invalidates active recording and pending work; it retains the agreement so the user may press Record again. Revoke, lock, restart and service failure clear agreement. Status reads never renew idle time. Existing write-only browser tokens must not be silently minted by Record; unified Stop also disables legacy producers/pairings.

Use a fixed allowability predicate for ordinary native fields while the explicitly approved monitoring session is active. Source names are bounded and normalized through the existing native contract. Known browser/system/credential tools remain excluded until adapters satisfy their own pre-read context checks. Do not auto-enroll an unlimited producer list to fake a global permission.

## Proposed architecture

Native window/tray → recording-session controller → foreground/focus observers → protected-source gate → text-state reader → bounded session-valid snapshot request → encrypted immutable evidence and separate editable copy → local history.

The reader uses the existing Windows UIA field contracts. Existing text on focus is an in-memory baseline, not an automatic import. Changed values are draft snapshots, not submit/delivery evidence. Meaning, prompt classification and the method of input remain unknown unless directly observed.

The service is the final authorization boundary: desktop-only access, session generation captured before body-await, current consent after awaits, source and payload bounds, synchronous rate-limit admission/write and lock invalidation. Legacy per-app endpoints may remain for old tests/API callers but must not bypass global Stop or enable the new session implicitly.

All UIA operations for the new lane run in one owned child of the same native executable (`--monitoring-worker`), including focus traversal, baseline reads and subscriptions. Parent UI never calls its UIA provider. Private bounded JSON-line pipes carry observations; a child heartbeat timeout ends the lane with a fixed gap. Stop first invalidates local results, then kills/reaps only that owned child off the UI thread; Start refuses a replacement until cleanup completes. EOF/parent death ends the child. There is no automatic restart. The new lane disables the unbounded ValuePattern fallback; such controls are unsupported until a genuinely bounded reader is proven. The legacy provider helper remains for its historical tests, not the new Record flow.

Retain 50k-character payloads and 15 accepted writes/minute; exceeding the monitoring rate stops the run with a visible gap. A service lifetime accepts at most 200 monitoring snapshots or 2 MiB UTF-8 input, whichever comes first, and then stops with MONITORING_CAPACITY. Stop/Record and lock do not reset those counters. No silent retention/deletion, retry queue or clipboard buffer. This bounds this development increment's additional ingestion, not whole-vault size: evidence plus editable copies, encryption and SQLite add overhead. Existing 12 MiB/10k portable backup limits and pre-existing archive growth remain separate full-v1 blockers.

## Selected API, state and identity contract

All mutations require the private authenticated local origin, an unlocked vault and desktop mode. Exact-body validation rejects unknown keys. Capture generation is sampled before body-await and rechecked after body/native awaits on new and retained legacy capture/bridge mutations; a changed generation returns a safe conflict. Lock also invalidates vault generation.

| Route | Body | Result / transition |
| --- | --- | --- |
| POST `/api/capture/monitoring/consent` | `{consent:true}` | approved, stopped; no producer reads |
| POST `/api/capture/monitoring/start` | `{}` | requires agreement; new capture generation and UUIDv4 sessionId; recording |
| POST `/api/capture/monitoring/stop` | `{}` | new capture generation; stopped, agreement retained; legacy sources/pairing invalidated |
| POST `/api/capture/monitoring/revoke` | `{}` | stopped, agreement cleared, new capture generation |
| GET `/api/capture/status` | none | monitoring available/approved/recording/sessionId/code/lastSavedAt/capacity; observational |
| POST `/api/capture/monitoring/snapshot` | `{sessionId,fieldId,eventId,source,text,recordedAt}` | current session only; UUIDv4 identities, normalized allowed .exe name, nonempty <=50k text, current bounded timestamp; returns saved/quality and monitoring state |

Unauthenticated/origin failure is 401/403, locked is 423, malformed input 400, changed/stopped session 409, and rate limit 429. Capacity cannot silently drop a record and leave the UI recording. Native response handling also checks vault epoch, local recording intent epoch and exact sessionId before changing UI.

New evidence uses existing schema fields: deviceId `windows-monitoring-session`; surfaceId = recording UUID; editorId = opaque field-episode UUID; appId = source executable; sourceSequence = server-assigned increasing observation sequence; classification unknown and quality draft_snapshot. A field episode ends at rebind; returning to an editor creates a new baseline/episode. No source title or full URL is invented. Dedupe is scoped to session/source/field, with at most 128 field entries, not text similarity across an application. Existing records remain valid. No schema/database migration is required, but old app validators may reject these new record semantics: retain a stopped-folder pre-upgrade backup and do not promise downgrade restore.

Timing remains an explicit development limit: a restarting 1.3-second settle observes nonempty resulting field values, preserves their newlines and stores them unchanged except existing redaction. It is not every edit/key, and typing then sending/clearing/switching before settling may be missed. Delete-to-empty, cut-all evidence and copy-only observations have no representation in this increment. Those cases must remain failed full-core acceptance rows rather than being counted as supported.

## File plan and checkpoints

| Files | Change and checkpoint |
| --- | --- |
| `apps/desktop/windows-host/Program.cs` | One permission panel, separate approval and Record/Stop, revoke, native/tray state and epoch-bound callbacks. Remove connection/app-picker controls from native UI. Synthetic UI fixture never approves/starts monitoring |
| `MonitoringCapture.cs`, `FocusedFieldCapture.cs`, `build-preview.ps1` in that folder | Isolated worker, bounded IPC/lifecycle and field episode IDs; worker-only TextPattern restriction. Build with real compiler; test delayed worker termination and no replacement lane |
| `apps/local-web/server.ts`, `monitoring-capture.ts` | Server-owned state/epochs, independent session identity, protected source validation, capacity/rate/dedupe and stale legacy request rejection |
| `packages/contracts/validate.ts`, `packages/local-store/archive.ts` | Strict monitoring record branch, atomic linked evidence/copy, compatible import/tombstones |
| `tests/monitoring-capture.test.ts`, `monitoring-records.test.ts`, `monitoring-worker.test.mjs` | Deterministic request barriers, identity/encryption/backup and owned synthetic worker checks |

Checkpoints: focused tests first, then `npm run check`, demo/doctor/reliability, real native compilation and synthetic self-test, and native synthetic screenshot inspection. Real recording consent, third-party source input matrix and installation stay distinct manual acceptance gates. No consumer release claim follows from compilation.

## Alternatives considered

1. Raw keys alone: rejected as the sole source because paste, composition, autocomplete and mouse edits do not map reliably to final text; cannot supply trustworthy URLs or paragraph boundaries.
2. UIA snapshots alone: useful initial source but incomplete for copy-only, inaccessible editors, submission signals and browser context. Keep limits explicit.
3. Mandatory browser extension/setup per app: rejected as the primary customer flow. A later integrated adapter may require normal browser permission; one native UI cannot eliminate that technical requirement.
4. Screenshots/OCR, disk crawling or full clipboard logging: excluded from v1; they broaden collection beyond typed text and introduce unrelated content, privacy and resource costs.

## Implementation increments

1. Replace native connection/app-picker controls with monitoring agreement, Record/Stop, visible coverage/state, saved history, search/copy and Lock. Keep the legacy helper implementation unchanged outside this UI.
2. Add server-owned desktop recording-session start/stop/status and generation-safe global field-save admission; wire native session start and stop without hardcoded application lists.
3. Move UIA execution off the UI thread behind bounded work; preserve stale-result invalidation, protected exclusions and baseline behavior.
4. Validate text changes, paste, deletion and autocomplete-like insertion in owned synthetic fixtures; then conduct expressly approved harmless real-app pilots. Add missing input/source lanes only after design and negative tests.
5. Complete structured source/session grouping, copy-only and browser adapters, interruption/recovery/resource and installation acceptance before marking full v1 complete.

## Validation and release gates

Automated: API default-off, no approval/start ambiguity, wrong origin/auth, desktop restriction, stop during body-await, lock/unlock generation isolation, unknown/protected source rejection, stale late provider output, bounded rate/dedupe, evidence/copy separation and encrypted backup/tombstones. Native synthetic tests cover state/UI text, baseline versus changed text, password/read-only exclusions and delayed provider behavior.

Manual gates: permission agreement readability; Record does not start before consent; Stop works while another app is active; tray and system lock; paste/edit/autocomplete/copy behavior per supported editor; browsers/private modes as separately supported; app/tab transitions; mixed-language/IME; restart/sleep/duplicate launch; disk failure and backup restore; clean-device install/uninstall and whole-app 4/8 GiB resource measurements. No application, browser or monitoring permission is clicked automatically during developer UI inspection.

Full-core acceptance requires an installed current build to demonstrate the covered input matrix across repeated real Windows sessions, preserve text/context correctly, exclude protected contexts and stop reliably. A passing synthetic suite or attractive Record button does not close this gate.

## Risks and unresolved decisions

Universal capture is technically unprovable. Safe browser/private classification, copy-only capture, exact event reconstruction, structured sessions, executable identity, UIA hangs/allocation, storage growth, rate-limit gaps, cross-account recovery and final setup remain open. The release must name supported sources/inputs and visible exclusions. No performance guarantee, production readiness or all-text claim is approved by this design.
