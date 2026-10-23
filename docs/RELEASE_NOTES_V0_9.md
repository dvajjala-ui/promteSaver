# v0.9 - Capture & AI Developer Pilot

Date: 2026-10-23. Built from the uploaded v0.8 source. This release changes core functionality, not merely styling. It remains a developer pilot, not a universal recorder or signed desktop release.

## Implemented

- MV3 companion service-worker source, optional permissions for three sites, explicit per-site enable/pause, trusted top-frame source validation, session-only write token and per-session vault consent.
- Capture on trusted send click/Enter in known composers, synchronous snapshot before page handlers run, duplicate-event suppression, protected/known-private exclusions and visible failure status. Capture quality remains draft_snapshot.
- Transactional immutable evidence plus editable Browser inbox copy. Editing a copy preserves evidence. Purge and capture deletion remove the linked copy/history and preserve tombstones. Restoring deletion records also removes existing linked copies.
- Local debounced writing hints; no always-running model, automatic correction or cloud-on-typing behavior.
- Groq summary, structuring, improvement and style rewriting endpoints and two-column review UI. Local encrypted key settings; exact outgoing-message preview; per-request consent; approval digest invalidated by changed payload/profile/model/settings/session.
- AI network and memory bounds, explicit cancellation, safe provider errors, no arbitrary endpoints, no retries, no automatic saving or source replacement. Writing examples are not included.
- Portable backup v4 for linked captures; no key in portable export. Snapshot/history validation and deletion tests strengthened.
- Settings diagnostic flags now distinguish optional AI/capture authorization; labels no longer falsely promise that cloud AI and capture do not exist. Explicit library Refresh action.
- Public site copy, browser guide, current README, security boundaries and handoff updated.

## Evidence

145 Node tests passed. 21 baseline and 22 new Chromium fixture scenarios passed. Syntax/type/contract/version checks passed with the available development toolchain. Full details, failure limitations and reproduction commands: [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md).

## Not shipped or proven

No native installer, general cross-application recorder, global assistant overlay, live Groq result, real-site capture certification, full database encryption, OS keychain, cloud sync, automatic AI summarization of all history, or low-RAM device guarantee. No GitHub push or deployment occurred.

## Upgrade

Stop the previous service and back up the complete vault folder. Key envelope remains v2; linked-capture snapshots use v4 and are not compatible with older importers. Preserve pre-upgrade backups. No Groq key is preconfigured. New capture and external AI are off until enabled explicitly. See [PILOT_GUIDE_V0_9.md](PILOT_GUIDE_V0_9.md).
