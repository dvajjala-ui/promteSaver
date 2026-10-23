# Upgrade, rollback and recovery - v0.3

## Before first use with existing data

Stop every previous promteSaver service with Ctrl+C. Copy the **complete** `~/.promtesaver-local` directory (Windows: the same folder beneath your user profile) to a secure backup location. Include `keyinfo.json`, `vault.sqlite` and any WAL/SHM files. Do not make a raw backup while SQLite is running; a folder copy is not a transactional online backup.

Keep an encrypted portable backup with a distinct strong backup passphrase as a second recovery route. Confirm that it restores into a separate test vault. The app has no cloud reset, escrow, password-recovery service or data recovery guarantee.

Extract the v0.3 ZIP into a new source directory, not over the only old source copy. Start it using the provided Windows/macOS script. On the first successful unlock, metadata format 1 is wrapped as format 2 using the same archive key. Existing record ciphertext is not rewritten. Check saved prompts, tags, history and Trash before relying on it.

**Format-2 key metadata is essential.** A vault password alone cannot recreate a lost random archive key. Do not delete `keyinfo.json` to solve an unlock error, and never paste it into a support chat.

## Rollback

v0.1/v0.2 cannot read format-2 metadata. To roll back, stop v0.3, preserve the entire current folder separately, and restore the complete pre-upgrade folder with the old app. This abandons post-backup changes in the active rollback copy. Never replace only keyinfo.json or combine unrelated database/key files. Never overwrite the only recoverable copy.

## Password change

Settings -> Change passphrase verifies the current password, writes a replacement wrapping envelope and locks the app. Use the replacement to unlock. This does not change existing portable backup passwords or invalidate copied old metadata. It is not recovery from theft of the raw archive key.

## Stale service lease after a crash

A `.vault-session.lock` protects the folder from two service instances. Normal Ctrl+C, native parent EOF and explicit shutdown release it. A hard crash may leave it behind.

First close all promteSaver processes and windows. From the v0.3 source root, with the supported Node runtime:

```sh
node scripts/recover-vault-lock.ts --confirm
```

For a deliberately chosen test/custom folder:

```sh
node scripts/recover-vault-lock.ts --data-dir "/absolute/path/to/test-vault" --confirm
```

The command refuses a live/ambiguous owner and changes only the lease file. It does not kill processes, read prompts, modify key metadata or repair the database. Do not run it concurrently with app startup. PID reuse may cause a conservative refusal; verify the recorded process independently rather than deleting arbitrary files or terminating unknown processes.

## Testing restoration without risking the real vault

```sh
node apps/local-web/server.ts --data-dir "/absolute/path/to/a-new-test-vault"
```

Create a new temporary vault, open Settings -> Import encrypted backup, select the file, enter its backup password, **Preview restore**, inspect the counts, then **Confirm restore**. Existing IDs are preserved rather than overwritten. A conflict is reported, not silently resolved. Capture-deletion records from v2 backups prevent capture resurrection; older backups cannot supply deletions they never recorded.

Portable snapshots do not copy the source vault password or preferences. Current portable limits are 12 MiB plaintext and 10,000 rows per included collection. For larger archives preserve a stopped-service complete-folder backup; chunked streaming export is not implemented.

## Reporting a problem safely

Include the release number, OS, Node version, reproduction steps and sanitized output from `npm run doctor`. Do not attach your vault directory, passwords, session URL, pairing code, private keys, employer/customer data or real prompt bodies. Use a newly created synthetic test vault for reproduction. Diagnostics do not upload anything.
