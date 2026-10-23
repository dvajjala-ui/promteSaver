# Developer handoff - v0.9

Read README, AGENTS, RELEASE_NOTES_V0_9, READINESS_V0_9, ARCHITECTURE_V0_9, TEST_REPORT_V0_9 and PILOT_GUIDE_V0_9. The user's priority is **the recorder/AI/contextual-help core, not another cosmetic dashboard sprint**.

## Current source

Local encrypted library/workbench retained. New optional MV3 browser companion observes trusted send intent in known composers on chatgpt.com, claude.ai and gemini.google.com. A write-only paired bridge stores immutable redacted snapshots and editable linked library copies. It is never a universal OS recorder and cannot verify message delivery. Inline hints are local heuristics, not cloud autocomplete.

The `codex/contextual-recall` branch adds an explicit **Find related saved prompts** action in the vault editor. It scans the unlocked local library for overlapping task words, shows source/project/date and a bounded excerpt, and adds a selected full saved prompt to the current draft for review. It does not learn reusable rules, suggest inside another app, grant extension read access or contact Groq. The user still chooses whether to save or copy the draft. A concurrent-request race in the local bridge's 15/minute write limit was also fixed.

Explicit Groq summary/structure/improve/style-rewrite workflow is implemented end to end at the source/API/UI level. Key is encrypted locally, not in extension or portable backups. A per-request approved preview digest binds text/preferences/model/session; stale previews and late outputs are rejected. No real key was present, so live inference was not tested.

Formats: key envelope v2; snapshot v3 without linked captures, v4 with links. Import v1-v4 supported. Tombstones propagate to existing linked library copies/history. Removing a key or deleting SQL records does not revoke old backups/provider keys or prove physical erasure.

## Evidence and open gates

The original v0.9 release report records 145 Node tests, 21 baseline Chromium fixture scenarios and 23 new Chromium fixture scenarios on Linux/Node 22.16/Chromium 144. Its live browser probe was blocked there. On this branch, Windows/Node 24.18.0 with the pinned TypeScript checker passes `npm run check` (147 tests); Chrome 156 passes 22 fixture and 15 live browser-to-local-service scenarios. The live UI run includes explicit recall and keeps one accelerated idle scenario fixture-only. This is meaningful Windows local-service evidence, but it does not certify an installed extension, real ChatGPT/Claude/Gemini layouts, live Groq or native Windows/macOS installers. The unpacked worker probe remains unverified.

No new production dependencies or background model. Real Node profile sampled 123.45 MiB; standalone Chromium fixture sampled 554.53 MiB process-tree RSS. Do not infer whole-app improvement or 4 GiB suitability.

The new 5,000-item synthetic Windows/Node 24.18.0 benchmark measured explicit recall at 255.20 ms median and 311.11 ms p95 across ten distinct requests, with 89.5 MiB point-in-time Node RSS. Recall still decrypts/scans the library and these numbers exclude the browser. Relevance and time saved need a real user pilot.

On `codex/release-pilot`, full Playwright Chromium 156 loaded the actual unpacked MV3 worker and passed seven scoped checks, including default-off storage, revocation, and absence of script injection before optional host permission. The earlier worker timeout was caused by the probe's Chrome Headless Shell selection. The permission prompt did not resolve in automation, so consented injection and real-site capture remain open. The real Cargo resolver produced a checked-in development `Cargo.lock`; an isolated Rust 1.99.1 `cargo check --locked` reached linking but failed because this Windows installation lacks `kernel32.lib` from the Windows SDK. No native build or installer was produced. See `TEST_REPORT_V0_9.md` and `verification/windows-2026-10-23/extension-worker.json`.

The backup-import cancellation test now holds the HTTP upload body after headers, locks during the active secure operation, then finishes the body to assert rejection and no later mutation. The prior timing-dependent poll missed this race under full-suite load. The updated targeted test and full 147-test check pass on Windows.

The browser-helper popup now calls `chrome.permissions.contains` for the active supported site, shows a clear permission-required status before consent, and avoids a second permission prompt after a grant. The synthetic Chromium core suite passes this onboarding flow; the human permission dialog and real sites remain open gates.

## Most important next work

Run the exact non-sensitive pilot on Windows/Chrome or Edge and macOS, record actual selector/permission failures, fix observed failures with fixture regressions, and test real Groq locally configured. Compile and install native host on the target systems, preserving security boundaries, resolving actual Cargo dependencies and auditing clipboard/download/lifecycle behavior. Keep all-app capture off until each native adapter has consent/exclusion/evidence tests. Validate OS key protection, whole-file encryption, real idle/peak memory and accessibility before distribution.

Do not widen capture to arbitrary editors or add silent AI uploads to make a demo appear successful. Protect production credentials and private vaults; publish only synthetic evidence. Source-only ZIP publishing is manual; no remote changes have been made.
