# Changelog

> **Documentation scope (31 October 2026): Current reference with historical records.** Read the 31 October continuation first. Older plans, observations, branch state and test counts are dated snapshots. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

## Documentation alignment — 31 October 2026

- Added the current core objective and an index of every Markdown document.
- Aligned Windows-first capture, local history, optional review and useful reuse across product direction, roadmap, backlog, UX, handoff and developer guidance.
- Corrected stale native build, DPAPI, source identity, idle-session and installer claims. Labelled older planning/research/evidence without changing their recorded results.
- No app version or runtime behavior change; application acceptance gaps remain in [READINESS_V0_9.md](READINESS_V0_9.md). Fresh documentation verification is recorded in [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md).

## Historical release entries

## v0.4.0 — Recovery and resource profiling beta

- Debounced encrypted editor draft persistence and recover-as-new; explicit limits and no unfinished draft export.
- Truncated library-list previews with on-demand authenticated full-item retrieval for editing, copying, templates, pinning and export.
- Profile-aware SQLite page-cache limits and batched DOM appends.
- Real Chromium fixture tests, isolated Node/process-tree profiler, and manual Windows/macOS/Linux resource workflow; native packaging not yet verified.


## 0.3.0 - 22 October 2026

Reliability beta: wrapped keys/atomic migration/password changes; configurable lock and stale-response privacy fixes; conditional editing/draft recovery; transactional bulk organization; low-memory/compact pagination; ID-only query cache; restore preview and capture tombstones; strict HTTP/bridge revocation checks; service leases/recovery; tested Node desktop child lifecycle plus uncompiled Tauri host source; 77 Node tests and 13 Chromium fixture scenarios. See [full notes](RELEASE_NOTES_V0_3.md) and [verification](TEST_REPORT_V0_3.md). No native installer, full-database encryption, OS keychain or background capture is claimed.

---

## Historical changelog (prior releases)

# Changelog

## v0.1.0 — 22 October 2026 (local vault sprint)

### Added
- Dependency-free, loopback-served HTML/CSS/JS local prompt library and passphrase onboarding.
- `LocalVault`: passphrase/scrypt key derivation, disk salt metadata, AES-256-GCM archive unlock/lock, idle key expiry.
- AES-256-GCM-encrypted editable library rows in the existing SQLite archive, separate from immutable capture evidence.
- Save/edit/delete/pin/tag/project/search, template variable fill and explicit clipboard copy.
- Local session authorization, Origin/Host checks, CSP, request cap, no-store headers, lifecycle cleanup.
- Opt-in Chrome/Edge manual capture helper (activeTab only), without background observation or network.
- Test suites for encrypted library CRUD, tampering, local HTTP auth/lifecycle and conservative capture semantics.
- Windows PowerShell and Mac shell launch scripts, synthetic benchmark, updated README and product/security/UX/architecture docs.

### Improved
- Conservative source-quality labelling: only a complete, explicit submission-hook payload is `exact_submitted`.
- Explicit capture observation discontinuity reporting.
- Redaction patterns for encrypted private key blocks, extra credential tokens, and multiword unquoted credential values.
- Replaced runtime AJV dependency with a strict, fail-closed validator for the **specific checked-in JSON Schema subset**. Unsupported keywords cause startup failure instead of silently weakening validation.

### Limitations
- No actual native Windows/Mac collector, OS keychain, SQLCipher, packaged desktop binary, remote AI, or cloud sync.
- Browser helper not verified on live AI-site editors. UI screenshot testing was blocked by the execution environment; HTTP/API tests succeeded.
- SQLite outer structure and selected row metadata are not encrypted. Regex redaction is only defense in depth.
- Query search decrypts all matched/filter-candidate rows and may be slow at 10k–50k items; intentional privacy/performance tradeoff for a small personal vault.

## v0.2.0 — 22 October 2026 (enhanced local beta)

### Added
- Keyboard-first quick search; recent/popular/relevance, tags, projects, usage metadata and notes.
- Reusable variable-fill form with live preview and optional defaults.
- Paged search, indexed listing and bounded top-K ranking, cached facet counts.
- Soft delete/restore/purge, duplicate, 25 previous encrypted item versions.
- Portable password-encrypted `.pomte` backup/import and manual Markdown/text import/export.
- Opt-in, one-time-paired Chrome/Edge extension **write-only** local bridge with explicit review & save action.
- Synthetic migration, backup, API, browser origin and capability abuse tests.
- Non-sensitive `npm run doctor` and 5k-item synthetic benchmark scripts.

### Improved
- Decrypted DOM values cleared on lock; live typing extends idle lock without perpetual keepalive.
- Clipboard failure no longer counts as successful reuse; stale extension capability is removed on authorization failure.
- Better onboarding examples and usable source/why-it-worked metadata.

### Limitations
- Feature parity on real browsers/Windows/Mac, native desktop installers and consented OS capture are **not validated/implemented**.
- Node-powered local app remains developer-oriented; not security-audited or full-database encrypted.
- Cloud, team accounts and AI inference deliberately remain out of this offline beta.
