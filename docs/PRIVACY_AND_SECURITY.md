# Privacy and security - v0.9 developer pilot

**Not independently security-reviewed. Do not treat a developer beta as suitable for employer secrets, regulated data or production credentials.** No accounts, telemetry, covert recording or clipboard polling. Optional browser send snapshots and explicit external Groq requests now exist; both require consent. Do not treat this source pilot as an audited privacy product.

## Protection boundaries

| Asset / threat | Implemented | Residual limit |
| --- | --- | --- |
| Prompt payloads and versions | AES-256-GCM records with row-binding AAD | SQLite metadata/header/counts/timestamps/kinds/pins and file structure remain visible; not SQLCipher |
| Archive key | Random key wrapped by a passphrase, format-bound AES-GCM, fixed bounded scrypt profile | No OS keychain, secure enclave, hardware isolation or audit |
| Passphrase changes | Current credential verified; atomic wrapper replacement; lock/revoke afterwards | Old copied wrappers/backups remain usable under their old credentials; not data-key rotation |
| Legacy upgrade | DB authenticates before metadata change; write failures preserve the old wrapper | OS power-loss/rename behavior and real-user upgrade need Windows/Mac testing |
| Local service access | 127.0.0.1 only, random session capability, strict Host/Origin/target/content type, no-store, CSP, request limits | Local malware, browser compromise, a leaked session URL or a malicious trusted extension are outside this boundary |
| Browser helper | Manual preview/save or per-site opt-in send snapshots, single-use pairing, write-only temporary token bound to extension origin, lock/revoke and post-body recheck | Real website editors/private-field exclusions not yet validated; malicious permitted helper could send arbitrary manual library text |
| Concurrent writes | ETags in UI; batch token prevalidation + transactional rollback; single-service lease | Legacy API clients can omit If-Match; lease is not hostile-process isolation |
| Sensitive content in view | Deadline/wake/status checks, lock DOM scrubbing, response epochs, optional lock-on-hide | JS strings/swap/crash dumps/clipboard history cannot be guaranteed wiped; browser timers are not OS screen-lock hooks |
| Backups | Authenticated encryption, bounded validated restore, preview and captured deletion tombstones | Existing codec/KDF retained; 12MiB/10k row limits; no chunking, cloud reset or escrow |
| Native host | Fixed child entry point, bounded private IPC, exact-origin navigation, no frontend native commands | Source uncompiled; WebView packaging and OS behavior require verification |

## Key format 2

New vaults generate a random 32-byte archive key. Passphrase wrapping uses scrypt N=32768/r=8/p=3, random 32-byte salt, random 12-byte nonce and AES-256-GCM, with authenticated format/KDF identity. Metadata parsing accepts only the fixed profile and expected bounded/base64 forms; it does not allow an imported JSON file to select unbounded KDF cost. The wrapping key and archive key Buffers are cleared where practical.

This profile is one of OWASP's documented scrypt memory/CPU tradeoffs. That guidance concerns password-derived protection; choosing parameters does not replace a full cryptographic design/security review. HTTP unlock/rewrap use bounded asynchronous scrypt with cancellation/session checks introduced in v0.8; the fixed work factor is unchanged.

Metadata update uses an exclusive same-directory temporary file, fsync, rename and best-effort POSIX directory fsync. Failure injections are tested. Public release still requires power-loss and permission/ACL tests on Windows and macOS.

**Key change is not key revocation.** An old copied `keyinfo.json` may still yield the same archive key. Portable backups retain their own original password. A future compromised-key recovery feature must decrypt/re-encrypt the entire store with a fresh key and handle snapshots/WAL/old backups honestly.

## Plaintext and deletion disclosures

The app decrypts payloads while the vault is unlocked. Metadata caches, search terms, displayed content and JS strings can exist in memory. Cache/page bounds are performance controls, not a claim of secure memory. Regex secret redaction is best-effort and can miss unknown formats or remove legitimate content.

Trash is reversible until purged; captured evidence uses independent tombstones. SQL deletion/WAL truncation does not prove secure erasure on SSDs, snapshots or backup systems. A plaintext Markdown export and any copied clipboard content are outside encryption protection.

No non-consensual native capture is enabled. Existing synthetic policies cannot certify real OS accessibility producers. Unknown/private/protected contexts must fail closed at the producer boundary before any future collection is allowed.

## Backup and support

Stop the service before copying the complete vault folder. Keep matching key metadata/database/sidecars together, and test a portable restore in a different test folder. Lost key metadata plus no decryptable backup may make data unrecoverable. Preferences are in whole-folder backups, not portable snapshots. See [upgrade/recovery](UPGRADE_V0_3.md).

Never upload a private key, password, keyinfo.json, session URL, pairing token or real vault for support. Use synthetic reproduction data. Diagnostics remain local and report environment/source presence, not prompt content.

## Release blockers

Public desktop distribution needs reviewed OS-protected key management, full-file/WAL encryption, native permission review, per-source compatibility, packaging/signing/notarization, security testing of the real WebView/extension, safe updates, cross-OS recovery, dependency/license review and independent threat-model review. Optional cloud/AI features require separate consent, tenancy, deletion and prompt-injection boundaries.

References checked 22 October 2026:
- OWASP password storage / scrypt profiles: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Tauri capabilities: https://v2.tauri.app/security/capabilities/
- Tauri origin-confusion advisory and affected version range: https://github.com/tauri-apps/tauri/security/advisories/GHSA-7gmj-67g7-phm9


## v0.8 additions

Password operations use a single bounded async work lane with post-await session checks. Lock cancels pending results, not the already-running native calculation. Temporary buffers are cleared where controllable; JavaScript strings and OS memory cannot be guaranteed erased. The new diagnostic download contains an allowlisted runtime/resource summary only, runs on request, requires unlock and does not renew idle time. It is not uploaded. Staged-runtime hashes are build consistency checks, not signatures or a defense against an attacker replacing the manifest too.

## v0.9 external transfer and capture boundary

Capture is limited to known, opted-in browser composers; incognito is forbidden and recognized protected/private contexts are excluded. Site changes and temporary-mode heuristics remain unverified on real sites. No claim of comprehensive secret detection or exact delivery. Capture evidence and editable copies are separate, linked encrypted records. Capture deletion and imported tombstones remove linked copies; unrelated manual duplicates/AI outputs remain independent.

Groq calls transmit reviewed text outside the device. Keys are encrypted in metadata, never returned by the settings API or sent to content scripts, and absent from portable backups. Full-folder backups retain encrypted keys. Removing a key does not revoke it at Groq or remove older copies. User preferences can contain personal data even when sample excerpts are excluded: inspect the preview. Each cloud call requires fresh consent and a matching review digest; no inference runs on capture or typing. No guarantee about provider retention is made. Cancellation can discard a local result but cannot retract received data.

The UI clears source/results/key input on lock; controlled Buffers are cleared where practical. JavaScript strings, DOM internals, clipboard history, swap and OS/browser crash dumps are not securely erased by a UI reset. Independent security review, actual extension/WebView tests, OS keychain and full database/WAL encryption remain release blockers.
