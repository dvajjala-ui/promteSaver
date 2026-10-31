# promteSaver 0.6 — Integrated Writing Studio private beta

> **Documentation scope (31 October 2026): Historical plan or implementation snapshot.** The original body is preserved for context. Its proposed stack, milestones and then-current feature claims are superseded by current guidance. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

**Date:** 22 October 2026  
**Status:** runnable local source beta, **not** a production installer or public release.

## Product hypothesis

A reusable prompt library becomes substantially more useful when a person can save *how they prefer to write* alongside *what they repeatedly ask*. Instead of adding a permanent cross-app overlay or running an AI model continuously, v0.6 offers an explicit, private workflow: **bring samples in -> analyze -> edit preferences -> store safely -> generate reviewed instructions -> copy to the AI tool you choose**.

## Shipped in source

- **Writing Studio in the main navigation:** responsive desktop/mobile page with profile cards, sample entry, style analysis, encrypted save/edit/delete, explicit written-task instructions, copy/download, and save-in-library.
- **Up to 16 encrypted profiles:** bounded per-profile data, random ID stored in plaintext database index, AES-256-GCM encrypted record content, revision and stale-update checking, strict import validation, and authenticated local API. The SQLite database/WAL are *not* encrypted in full.
- **Two separate consent points:** analyzed samples are not stored as excerpts unless **Retain sample excerpts** is checked. Exports and AI-ready instructions omit excerpts **and recurring phrases** unless another opt-in is selected. Previews and exported raw JSON must still be reviewed; derived aggregate style metrics can themselves be personal information.
- **Local lightweight proofreading:** user-submitted text only, no polling, no model or language download. Advisory flags for duplicated words, excess spaces, repeated `!`/`?`, trailing whitespace, and long sentences. Applies individual corrections only after a click. Not comprehensive grammar checking or an AI rewrite service.
- **Portable encrypted archive format v3:** includes writing profiles in backup/restore preview/import. Legacy v1/v2 imports remain supported. Restores merge nonexisting profile IDs and respect the 16-profile cap. **New v3 portable backups are not compatible with older promteSaver versions.** The optional portable style `.json` download is **unencrypted** and warns before sharing.
- **Native packaging source correction:** the desktop source allowlist now includes `packages/writing-style` (both profile and proofreading algorithms), and the packaging tests assert their presence. The native host still has not been compiled.
- **Hardening:** API request content-size limits reflect Unicode byte lengths; no global input observers; sensitive Writing Studio DOM values are erased when locking; stale network responses are ignored. Authenticated API calls only on the local service.
- **Performance:** 16-profile cap, 12 samples at 10,000 UTF-16 code units each, 12,000-character proofreading cap, no engine running on idle, and no third-party production dependency added. Synthetic algorithm benchmark included separately.

### Upgrade notes

1. Stop the old server, **copy the entire vault folder including key metadata and SQLite sidecars**, and keep an independent portable encrypted backup when available.
2. Run v0.6 from an entirely separate extracted source directory; use Node 24.16.x. On successful unlock, the SQLite schema adds `writing_styles`; no rewrite of existing library records is required.
3. Create a writing profile from test-only material first. Export a new portable backup, then verify restoration into an empty test vault. Old releases cannot read the v3 backup format.
4. Do not downgrade against a modified vault without restoring a tested complete-folder backup. Passphrase changes only re-wrap the same data key; older copies and backups are not revoked.

## Verified evidence

- **96 / 96 Node tests** passed (Linux Node 22.16 compatibility); includes HTTP, encryption, backup compatibility, authorization, proofreading and writing profiles.
- **16 / 16 Chromium fixture scenarios** passed. Chromium rendered the real UI but used a mock in-page API, so these are **not** browser-to-live-backend end-to-end results. Screenshots were inspected at desktop and mobile widths.
- Contract check, browser syntax, offline TypeScript check, synthetic capture replay, and standalone benchmark completed. TypeScript used environment-installed 5.8.x; pinned Node 24 / TypeScript 7.0.2 build is not certified here.
- Local browser-to-live-backend navigation is blocked by this environment's administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). Direct Node HTTP tests of the backend passed.
- **No compiled Rust/Tauri app, signed Windows/macOS binaries, real-site browser-extension verification, AI rewrite service, OS capture, native spellcheck, OS keychain or whole-DB encryption.**

Details: [test report](TEST_REPORT_V0_6.md), [architecture](ARCHITECTURE_V0_6.md), [usage](WRITING_STUDIO_USER_GUIDE.md), and [market-readiness gates](MARKET_READINESS_GATES.md).

## Next engineering choices

1. Compile, install and profile native Windows/macOS Tauri host, including update/uninstall and webview lifecycle.
2. Run live first-user workflows and accessible keyboard/screen reader sessions on both platforms, testing lock, backup, data recovery and real browser extension sites.
3. Prototype OS-keystore wrapping and independently threat-model plaintext SQLite indexes/WAL before any production claim of full-disk security.
4. Replace full-decrypt scans with a carefully measured private index only if scale measurements demand it.
5. Evaluate an optional on-device language checker **only when triggered by users** and only after memory, licensing and quality tests. Contextual overlays and AI rewrites remain explicitly opt-in future gates.
