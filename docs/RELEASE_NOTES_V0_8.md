# v0.8 - Responsive Local Beta

> **Documentation scope (31 October 2026): Historical plan or implementation snapshot.** The original body is preserved for context. Its proposed stack, milestones and then-current feature claims are superseded by current guidance. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Date: 2026-10-23. Derived from the complete v0.7 workbench source package.

## Implemented

- Async password derivation for HTTP setup, unlock, passphrase changes and portable backups, retaining encryption formats and security parameters.
- One bounded expensive-operation lane; overlap is rejected instead of queued. Cancellation discards results without releasing the lane early.
- Lock/shutdown/client-disconnect cancellation, session-generation checks and protection from slow request bodies that straddle lock/re-unlock.
- Visible setup/unlock progress and cancellation, reduced-motion behavior, stale-response guards, and password-field cleanup.
- Settings device-health panel, narrow-screen layout, explicit refresh and local diagnostics export. No periodic health polling or upload.
- Bounded heap search candidate ranking with stable-order and deep-pagination tests. No plaintext index or new search-format migration.
- Streaming native runtime hashing, post-stage manifest verification, traversal/symlink/accidental-vault-file rejection and cross-component version checks.
- Updated launcher/doctor/version metadata and an explicit, manually triggered unsigned Windows/macOS preview workflow. Build tooling is prepared, not executed on native hosts.
- Added security, integration, property, packaging and browser regression coverage.

## Verified

123 Node tests passed on Linux Node 22.16 compatibility mode; 21 Chromium UI fixture scenarios passed. Offline TypeScript 5.8.3 checking (available Node 25.1 typings), syntax, contracts, release consistency and source staging plan passed. Raw evidence is under `verification/v0.8/` and `verification/browser-v0.8/`.

The real localhost browser navigation test failed with `ERR_BLOCKED_BY_ADMINISTRATOR`; no workaround was used. Node HTTP tests use the real service and temporary encrypted databases. UI fixtures use actual interface code with mocked APIs. These are complementary, not a live end-to-end pass.

## Performance interpretation

In three alternating synthetic samples, the median worst 10 ms timer gap fell from 307.50 ms during synchronous derivation to 10.86 ms during async derivation. KDF time was similar (~300 ms). This addresses responsiveness, not total work, universal latency, or overall RAM consumption.

The 10k-record v0.8 sample was 225.48 ms median distinct-query search and 115.75 MiB sampled Node RSS. Whole-app/peak memory, startup, native WebViews and low-spec hardware were not measured. See `PERFORMANCE_V0_8.md` before quoting numbers.

## Compatibility and remaining limits

Key wrapper v2 and portable snapshot v3 are unchanged from v0.7. Back up the complete stopped vault before updating. Early format-1 vaults still migrate on first successful unlock. Changing the passphrase re-wraps the same data key and does not revoke old copies/backups.

There is no built native installer, OS keychain integration, full-file database encryption, automatic system recorder, system-wide writing popup, AI rewrite engine, cloud synchronization or mobile native app. The existing manual library, Writing Studio, browser helper and static website remain. No credentials are required for the added features. Nothing is uploaded or pushed automatically.
