# v0.2 local beta — release notes

**Date:** 22 October 2026  
**Upgrade:** Extract this source folder into a new location; back up the entire old vault first. **Do not delete or overwrite real data.** This is a developer beta, not a signed commercial installer.

## New everyday workflows

| Feature | Details | Code |
| --- | --- | --- |
| Quick Find | `Ctrl/Cmd+K` in the local browser app; focus/search, arrow navigation, Enter to copy or fill template | `apps/local-web/public/app.js` |
| Project / tag filters | Filter and count, pages of 40, sorting by updated, relevance, popularity, most recently used | `packages/local-store/archive.ts`, `server.ts` |
| Source & outcome context | Optional source and why-it-worked notes; searchable as encrypted payload; usage count & last-used timestamp | `archive.ts`, UI |
| Better templates | Inline fill form for `{{variable}}` / `{{variable\|default}}` and visible final preview; never silently submits | UI |
| Safe edit/recovery | Duplicate a prompt, review/restore earlier 25 versions, recover from trash, or explicitly permanently purge | `archive.ts`, UI |
| Manual content portability | Create and decrypt passphrase-protected `.pomte` backups; merge without replacing existing IDs; import editable Markdown/text file; explicit plaintext Markdown export | `apps/local-web/backup.ts`, `archive.ts`, UI |
| Paired browser inbox | Manual focused-editor preview + title check; copy locally or save directly to a write-only paired loopback endpoint | `apps/browser-helper/`, `server.ts` |
| Privacy hardening | Lock clears previously decrypted UI fields and cards; typing keeps an actively used editor unlocked; blocked clipboard copies aren't counted as reuse | UI |
| Large-library efficiency | SQLite filtering/paging and streaming top-K search rather than retaining all decrypted results; cached project/tag facets until mutation | `archive.ts`, `scripts/bench-beta.ts` |
| Diagnostics | `npm run doctor` reports non-sensitive OS/Node/source readiness; benchmark uses only synthetic records | `scripts/doctor.mjs` |

## Data migration and compatibility

- Existing v0.1 encrypted-record `library` data stays in place. On first opening, `EncryptedArchive` adds a nullable `deleted_at` metadata column and an index if absent; encrypted payloads are decoded with defaults for optional v0.2 fields. **This schema migration was tested synthetically, not on every user's database.** Back up before opening real v0.1 data.
- v0.2 soft deletion moves an entry to Trash. `purge` permanently deletes the library row and its encrypted history (without promising forensic erasure). Captured evidence has an independent delete mechanism.
- A portable backup stores a versioned JSON snapshot inside AES-256-GCM ciphertext using a 32-byte random salt, 12-byte nonce, authentication tag and passphrase-derived key (scrypt). Password length 12–1024. No recovery key escrow or cloud copy. A second passphrase is required for the portable file.
- Restores validate, re-redact, and merge existing IDs conservatively; they do not silently overwrite current prompts. A 12 MiB uncompressed snapshot limit guards low-memory devices. Restoration is not a cross-version compatibility guarantee for arbitrary future schema versions.
- Existing local source records remain separate from edited reusable library entries. Synthetic `exact_submitted` evidence requires an explicit confirmed-submission payload.

## Security and disclosure

- The local app binds only to `127.0.0.1`, checks exact Host/Origin, authenticates with a short-lived *service-session* bearer token printed in the URL fragment, and delivers a restrictive CSP. Treat a copied session URL as a secret.
- The extension bridge uses a single-use ten-minute pairing code and an ephemeral **write-only** capability (maximum eight hours, revoked by vault lock). It allows saves only from approved AI-site host names and limits writes. It cannot list, search, export, modify, or delete existing prompts.
- The extension has only explicit user action and previews the focused editor. No background listeners and no remote network requests. The runtime itself uses Node and has no production npm dependencies.
- Sensitive text scrubbing and regex redaction are best-effort. **The SQLite header, record identity/kind/pin/timestamps, and some operational data remain unencrypted.** There is no SQLCipher, hardware key storage, OS isolation guarantee, independently audited cryptography, or automatic secure deletion.
- Closing/locking releases keys and clears selected DOM fields, but JavaScript strings, browser memory, swap, clipboard history, and OS backups cannot be guaranteed erased.

## Not shipped

This package does **not** include a Tauri/Swift/WinUI installed desktop app, signed Windows/macOS installer, true global shortcut, macOS AX collector, Windows UIA recorder integrated into the product, consent-managed background capture, encrypted full-database file/OS keychain, verified real browser-site recording, cloud sync, team accounts, payments, billing, or model-driven AI features. These require their own engineering/security/OS test cycles. Refer to `MARKET_READINESS_GATES.md`.

## Change classification

- **Implemented and automated-tested on Linux:** storage CRUD/search/facets/trash/use/versioning/import/export, local HTTP auth, bridge CORS/write-only boundary, synthetic capture regression suite.
- **Static-checked but not visually/real-site tested:** UI interactions and Chrome/Edge popup. Browser automation in this environment cannot navigate even loopback due administrator policy.
- **Not built/verified:** native Windows and macOS collectors and installers, real low-memory machine budgets, cloud and AI.
