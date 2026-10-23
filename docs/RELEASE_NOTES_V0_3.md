# v0.3 Reliability Beta

Date: 22 October 2026. Based on the supplied v0.2 source ZIP, not an assumed GitHub checkout.

## Implemented in this release

| Area | Implementation | Acceptance evidence |
| --- | --- | --- |
| Key lifecycle | Random archive key wrapped by a passphrase; legacy format migration only after successful DB authentication; atomic metadata writes; authenticated password change | Wrong-current-password, old/new credential, migration failure, disk-write failure and ciphertext-preservation tests |
| Locking | One-shot server inactivity timer; observational status polling; client deadline, wake checks, cross-tab notification, stale response rejection, field/DOM clearing | HTTP timer tests and Chromium UI fixture idle/late-response scenarios |
| Concurrent edits | ETags over editable state, `If-Match`, HTTP 412, preserve draft and save-as-new recovery | Unit/API conflict tests; actual UI fixture interaction |
| Batch work | Pin/unpin/project move/trash/restore, max 100 entries, all preconditions checked, transaction rollback | Stale batch rejection and injected SQL failure tests |
| Backups | Capture deletion records in v2 snapshots; legacy v1 accepted; restore preview; strict histories and row/size bounds | Tombstone merge, malformed history, non-mutating preview and rollback tests |
| Resource controls | Small ID-only query cache, bounded page payloads, top-K lightweight candidates, cache invalidation, 20-card/compact modes | Query-cache mutation/external-connection tests, browser pagination, 5k/10k benchmarks |
| Browser bridge | Token bound to paired extension origin; recheck capability after reading request body | Wrong-origin and revocation-during-upload tests |
| Native-service lifecycle | Exclusive service lease; documented stale recovery; fixed Node sidecar handshake/lock/shutdown/ping and bounded input | Actual child process tests for EOF, lock, shutdown, oversized protocol and reopen |
| UI robustness | Async HTML confirmation dialogs, dirty-draft guard, literal template expansion, quick-finder ARIA/Escape, password failure recovery | Pure template tests and Chromium interaction scenarios |

## Security-critical upgrade behavior

First authenticated unlock of a format-1 vault replaces `keyinfo.json` with format 2. Record ciphertext and the archive key are retained for migration. The new key envelope uses AES-256-GCM and scrypt N=32768, r=8, p=3 with a fixed profile, bounded metadata and random salt/nonce. This is one OWASP-listed scrypt memory/CPU tradeoff; it is not a cryptographic audit or proof that an application is secure.

Password changes re-wrap the same data key. They do not revoke old copied key files or old backups, and they are not recovery from a compromised archive key. The portable-backup codec retains its existing separate KDF/format for compatibility. The UI discloses this distinction.

Backup the **complete stopped-service vault folder** before upgrading. Older app versions cannot read format-2 metadata. See [UPGRADE_V0_3.md](UPGRADE_V0_3.md).

## Verification

- 77 real Node unit/integration tests passed, including the original 39-test foundation.
- 13 Chromium UI scenarios passed against explicit in-page fixtures; screenshots included.
- Contracts, JS syntax and offline TypeScript 5.8.3 typecheck passed. The checked-in dev toolchain remains TypeScript 7.0.2 / Node types 24.19.2; installation and checking with those exact versions was not repeated here.
- Real browser HTTP E2E was blocked by administrator policy. No browser/network security control was disabled to bypass that restriction.
- 5,000/10,000 synthetic-record Linux benchmarks separate cold-query scans from identical-query cache hits; browser memory excluded.

## Experimental source, not validated shipping features

The Tauri 2.11.5 host and tauri-build 2.6.3 definitions, navigation limits and packaging source are included. Node-side lifecycle is tested. Rust compilation, native WebView behavior, bundled resource paths, native clipboard/download behavior, default menus, installers and signatures require capable Windows/macOS environments. No native binary or Cargo.lock is fabricated. Generate/review a lockfile, resolve licenses and compile before claiming a working desktop package.

## Remaining release blockers

No OS keychain, no SQLCipher/full-file encryption, no signed installers/updater, no proven OS sleep-lock integration, no real cross-platform native capture, no actual allowlisted-site compatibility run, no global shortcut, no screen-reader audit, no customer usability pilot. Cold search remains O(n). Portable snapshots are bounded and not streaming. No cloud sync, accounts, team features or AI processing are implemented.

A public-release readiness percentage is deliberately not inferred from passing synthetic tests. See [MARKET_READINESS_GATES.md](MARKET_READINESS_GATES.md).
