# Developer handoff - v0.9

Read README, AGENTS, RELEASE_NOTES_V0_9, READINESS_V0_9, ARCHITECTURE_V0_9, TEST_REPORT_V0_9 and PILOT_GUIDE_V0_9. The user's priority is **the recorder/AI/contextual-help core, not another cosmetic dashboard sprint**.

## Current source

Local encrypted library/workbench retained. New optional MV3 browser companion observes trusted send intent in known composers on chatgpt.com, claude.ai and gemini.google.com. A write-only paired bridge stores immutable redacted snapshots and editable linked library copies. It is never a universal OS recorder and cannot verify message delivery. Inline hints are local heuristics, not cloud autocomplete.

Explicit Groq summary/structure/improve/style-rewrite workflow is implemented end to end at the source/API/UI level. Key is encrypted locally, not in extension or portable backups. A per-request approved preview digest binds text/preferences/model/session; stale previews and late outputs are rejected. No real key was present, so live inference was not tested.

Formats: key envelope v2; snapshot v3 without linked captures, v4 with links. Import v1-v4 supported. Tombstones propagate to existing linked library copies/history. Removing a key or deleting SQL records does not revoke old backups/provider keys or prove physical erasure.

## Evidence and open gates

145 Node tests, 21 baseline Chromium fixture scenarios and 23 new Chromium fixture scenarios passed on Linux/Node 22.16/Chromium 144. A full real-browser localhost test was blocked by administrator policy; a real unpacked worker probe timed out. These are NOT live E2E successes. Node 24/pinned compiler, installed extension on real sites, live Groq and native Windows/macOS builds remain unverified. Tauri source-only status is unchanged.

No new production dependencies or background model. Real Node profile sampled 123.45 MiB; standalone Chromium fixture sampled 554.53 MiB process-tree RSS. Do not infer whole-app improvement or 4 GiB suitability.

## Most important next work

Run the exact non-sensitive pilot on Windows/Chrome or Edge and macOS, record actual selector/permission failures, fix observed failures with fixture regressions, and test real Groq locally configured. Compile and install native host on the target systems, preserving security boundaries, resolving actual Cargo dependencies and auditing clipboard/download/lifecycle behavior. Keep all-app capture off until each native adapter has consent/exclusion/evidence tests. Validate OS key protection, whole-file encryption, real idle/peak memory and accessibility before distribution.

Do not widen capture to arbitrary editors or add silent AI uploads to make a demo appear successful. Protect production credentials and private vaults; publish only synthetic evidence. Source-only ZIP publishing is manual; no remote changes have been made.
