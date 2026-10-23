# Next engineering increments after v0.4

Each increment must end with source, tests, evidence and explicit remaining limits. Do not silently publish or enable recording.

## 1. Device validation and native build closure (P0)

Run the exact pinned Node/TS CI matrix and `browser-smoke.py --mode live` on Windows and macOS. Compile the Tauri host, generate/review Cargo.lock, fix installed resource paths, test file picker/backup downloads/clipboard/menu, and validate parent EOF/duplicate-launch behavior. Measure all processes, not only Node. Deliver an unsigned internal build first; signing/notarization is a separate verified gate.

## 2. Storage and security boundary (P0)

Design an archive interface migration to SQLCipher or equivalent fully encrypted store, with OS Keychain/DPAPI integration as opt-in unlock assistance rather than hidden escrow. Preserve recovery semantics. Test wrong keys, interrupted writes, disk-full, lost key, downgrade and legacy upgrade on both systems. Commission independent review before stating stronger privacy guarantees.

## 3. Large archives and lifecycle (P1)

Implement chunked authenticated backup streaming with cancellation/atomic restore, bounded memory and >10k long-body/history tests. Benchmark encrypted fulltext indexes versus bounded scans and disclose leakage. Add native OS sleep/screen-lock handling, retention UX and deep-page controls.

## 4. Capture proof and daily reuse (P1)

One verified supported editor per OS before broad coverage. Require per-source consent, visible recorder status, private/protected exclusions at the producer, and explicit confirmed submit evidence. Global picker/paste must never silently submit. Keep manual save/reuse fully functional when permissions are denied.

## 5. Opt-in expansion (P2)

Only after pilot retention/value evidence: optional device sync, web accounts, team sharing, AI refinement with provenance and cost controls. Separate each data-processing threat model; no hidden upload, analytics or inference.

Current implementation/evidence: [release notes](RELEASE_NOTES_V0_4.md), [tests](TEST_REPORT_V0_4.md), [resource budgets](RESOURCE_BUDGET_V0_4.md), [readiness gates](MARKET_READINESS_GATES.md).
