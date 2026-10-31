# Upgrading to v0.8

> **Documentation scope (31 October 2026): Version-specific reference.** Apply the stated version and component scope. Current Windows setup, vault recovery and product priorities are described in the current guides. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

1. Stop the old local service or application. Ensure another process is not using the vault.
2. Copy the entire vault folder to a safe location, including `keyinfo.json`, `vault.sqlite`, and any `-wal`/`-shm` files. Preserve the old source folder and password. A portable backup is useful as an additional recovery path, not a substitute for a complete stopped-folder backup.
3. Extract v0.8 into a new folder. Use the usual Windows/macOS launcher with supported Node 24.16+ within 24.x.
4. Unlock; check several full prompts, history and writing profiles. Make a portable backup and test restore in a separate temporary vault before relying on the upgrade.

v0.8 introduces no new key/database/backup format beyond v0.7. Earlier v0.1/v0.2 key metadata still upgrades on successful unlock; read `UPGRADE_V0_3.md` first. Never mix a database and key file from unrelated vaults.

## New behavior

Password operations can be cancelled by locking. Setup/unlock has a visible Cancel button. Native key derivation already running cannot stop instantly; a short retry may get HTTP 503 until disposal finishes. Cancellation before setup commits leaves no vault, but a setup that finished before cancellation may already have initialized a vault and then locked it. The UI reads the current status rather than promising an uninitialized vault in every race.

A slow write invalidated by lock/re-unlock is rejected instead of applied to the new session. Keep the draft or retry the operation after unlocking; do not assume a failed request committed.

The health panel is under Settings. Reports are created/downloaded only on request and contain resource/runtime metadata, not prompts or paths. Review any report before sharing. Browser and WebView memory are not included.

The optional helper component version is now 0.8.0. Reload unpacked extensions after replacing source and pair again after unlocking. Real browser-extension/site acceptance remains unverified here.

## Rollback

Stop v0.8 before reopening an older version. Restore a matching complete backup to a separate location for a rollback drill; never merge key files manually. v0.7 shares the current formats, but rollback with real user vaults has not been tested on Windows/macOS. Prefer retaining both source versions and immutable backup copies until your own checks pass.
