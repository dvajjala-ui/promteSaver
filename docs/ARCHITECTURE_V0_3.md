# Architecture 0.3 - local reliability before background intelligence

> **Documentation scope (31 October 2026): Historical plan or implementation snapshot.** The original body is preserved for context. Its proposed stack, milestones and then-current feature claims are superseded by current guidance. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

## Runtime boundaries

```text
Browser UI / experimental native WebView
  | exact-origin loopback HTTP + random per-service capability
  v
Local server --> LocalVault --> wrapped random archive key
  |                              |
  | CRUD / conditional batch     v
  +----------------------> EncryptedArchive --> SQLite records/history/settings
  |                              |
  | preview/import/export        +--> v2 snapshot + deletion tombstones
  v
Portable backup codec (separate passphrase and existing format)

Explicit browser-helper user action
  --> single-use pairing --> origin-bound, write-only capability --> manual library inbox

Experimental Tauri parent
  --> private stdin/stdout --> Node sidecar --> same local server
```

Neither saved prompts nor imported data are executable instructions. The ordinary frontend receives no native shell/filesystem invocation capability. The original synthetic capture pipeline remains separate from editable library entries.

## ADR-003: keep the local service as the initial shared backend

**Decision:** reuse the existing tested Node service in browser mode and as a controlled native sidecar. Do not duplicate encryption/storage/capture rules in an untested Rust rewrite in the same release.

**Benefits:** one storage contract, one migration path, lifecycle tests runnable now, independent frontend iteration, no third-party production npm packages.

**Costs:** a packaged Node runtime increases binary size and baseline memory; there are two processes plus a webview; it is not as small as an all-Rust implementation. Real whole-app RAM/CPU and OS integration are still unknown. Measure before changing architecture based on marketing claims. Native stores and encrypted search remain replaceable backend components with migration tests.

## ADR-004: a passphrase protects a data key, not every record directly

New vaults create a random 256-bit archive key. A fixed scrypt profile derives a wrapping key from the passphrase and random salt. AES-GCM wraps the archive key with explicit format/KDF AAD. Metadata is written to a mode-0600 temporary file, fsynced, renamed, then parent-directory fsync is attempted on POSIX. Windows rename/power-loss behavior still needs device fault testing.

Format-1 migration first derives the legacy key and authenticates the existing database. Only then is the same key wrapped into format 2. Wrong-password or injected metadata-write failures do not erase the old key metadata. A missing database fails closed.

Changing the passphrase verifies the current wrapper, writes a new wrapper, then locks the service. This changes the active credential without rewriting records. It is not data-key rotation, and copied old wrappers/backups remain a residual risk.

## ADR-005: avoid overwrite-on-stale state

`libraryETag` covers editable content, revision and deletion/pinning state; reuse counters are excluded so copying alone does not conflict with editing. API updates accept `If-Match`; the app sends it, and batches require a token for every target. A mismatch returns 412 `EDIT_CONFLICT`.

Existing direct API clients that omit `If-Match` remain backward compatible; conditional edits are not a universal mandatory protocol yet. A future versioned API can make them mandatory after migration. UI draft recovery never silently overwrites current server content.

Atomic batches prevalidate all entries, reject duplicate/oversized selections, then transact. Failure rolls back edits/history together. No global destructive "select every result" behavior is added.

## ADR-006: lock is a lifecycle boundary

Server status polling is observational. User activity and authenticated operations renew one-shot inactivity deadlines; extension save cannot keep the main user session alive indefinitely. UI deadline headers, status checks when visible, wake/focus checks, optional hide-lock, and BroadcastChannel coordination hide and clear decrypted views. Session epochs invalidate late promises.

JavaScript strings are not guaranteed zeroized, browser timer suspension is not an OS lock event, and clipboard history is unaffected. Native OS sleep/screen-lock hooks remain unimplemented.

The `.vault-session.lock` file prevents independent services opening the same folder. It stores only a PID/nonce, not a key or URL. An orderly close removes its own lease. Recovery after a crash is explicit and refuses a still-live owner; run it with all application instances stopped. Leases are a usability/concurrency guard, not a hostile-process isolation boundary.

## ADR-007: bound resource use without pretending scan search is indexed

Normal views retain 40 cards; low-memory views retain 20, shorten previews and reduce result-page cache entries from eight to two. Page cache values contain IDs and counts. Prompt bodies are decrypted only for processing/result delivery; plaintext facet names remain in memory while unlocked. Close clears caches and checkpoints/truncates the WAL before closing SQLite.

Candidate ranking uses lightweight metadata instead of retaining every matching body. Deep offsets can still retain O(offset + limit) metadata; the supported offset is bounded at 100,000. Cold body/notes search remains O(n) decryption work. Query caching accelerates repeated identical queries, not arbitrary distinct queries. SQLCipher FTS or a carefully bounded unlock-time index needs a separate leakage/performance review.

## Snapshot contract and recovery

Snapshots v2 add capture deletion tombstones; v1 remains readable. Preview and import share validation. Existing editable library IDs are preserved on merge, not overwritten, and preview reports conflicts. Capture tombstones win over old capture records, preventing resurrection from a later restore of an older snapshot.

Histories are checked for ownership, duplicate/future revisions and bounded retained versions. Export counts/byte budgets reject oversized archives rather than creating backups that cannot be re-imported. Current ceiling: 12 MiB plaintext and 10,000 rows per included collection; streaming format/large-archive coverage is future work.

Preferences are encrypted metadata but are not part of portable snapshots; a restored vault keeps its current preferences. A whole-folder backup includes them. The import UI explains merging, not synchronization.

## Desktop host boundary

The host starts a known bundled Node executable with a fixed entry script. `NODE_OPTIONS`, `NODE_PATH` and data-directory override variables are removed. No shell interpolation occurs. A bounded readiness message must identify an HTTP 127.0.0.1 URL with an explicit port and 256-bit hex fragment. Navigation is restricted to that exact origin; extra windows are denied. The session token is not written to a log.

The private child protocol only accepts `ping`, `lock` and `shutdown`. Invalid commands cannot invoke a shell; a protocol-size violation exits. Parent stdin EOF locks/closes the service. The host attempts graceful shutdown before kill fallback.

Rust host and Windows/macOS bundle behavior are source-only/unverified. Packaging intentionally uses a locally installed trusted Node binary, copies allowlisted sources only and requires its license. It does not fetch an executable or include user data. See [DESKTOP_BUILD.md](DESKTOP_BUILD.md).
