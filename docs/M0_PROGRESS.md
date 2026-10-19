# M0 implementation evidence

Updated: 19 October 2026. M0 is in progress; its full acceptance criteria have not been met.

## Implemented

- Versioned JSON Schema for surface context, observations, and retained prompts; generated TypeScript contracts with a freshness check.
- Strict runtime validation, bounded observation sizes, and generic validation errors that do not echo captured text.
- Deterministic capture policy: enabled/paused state, permission, allow/exclude lists, protected/private input, and unknown-context exclusion.
- A single-device snapshot reconciler that uses complete editor snapshots rather than guessing final text from key presses. Submissions are explicit adapter events; Enter in text does not submit.
- Draft retention is opt-in. Focus changes, gaps, and policy changes clear the active draft. Partial text remains labelled partial. Persistence failures can be retried.
- Limited credential recognizers applied to body and source metadata before persistence. These are not universal secret detection.
- An encrypted-record SQLite prototype using AES-256-GCM with fresh nonces and context-bound authentication, plus an authenticated key-check record.
- Atomic source-record/outbox writes, idempotent source IDs, explicit acknowledgments, and local delete tombstones that reject stale re-insertion.
- A CLI that replays bundled synthetic observations, searches retained history, reopens the database, reports counts, and cleans up its temporary files.
- A Windows accessibility experiment that creates only its own synthetic controls on a dedicated UI thread, reads snapshots through a separate client thread, and checks password-field metadata without requesting its text.
- A proposed CI matrix for synthetic foundation tests on Linux, Windows, and macOS. Remote CI results are not yet observed.

## Commands

Requires Node 24.16.x (the tested version is 24.16.0) and npm. No AI keys or cloud service are needed.

```text
npm ci --ignore-scripts
npm run check
npm run demo
```

On Windows with Windows PowerShell and the .NET Framework UI Automation assemblies:

```text
npm run test:windows
```

The Windows proof does not start a global recorder. It uses an invisible temporary form containing only synthetic test controls, then disposes it. It may require an interactive desktop session. It does not inspect external applications.

## Observed evidence

The foundation suite passes 26 tests, including incomplete private-key redaction and retrying failed persistence. Generated-contract freshness and TypeScript type checks pass.

The demo retained three synthetic records and three queued operations across reopening, found one historical-search result, and identified one redacted record. No network request or keyboard recording occurs in the demo.

The threaded Windows proof passed four assigned-text snapshot cases through `TextPattern`, with line endings normalized, and identified the synthetic password control. This tests accessibility retrieval of programmatically assigned strings, not live paste/dictation/keyboard delivery. An earlier same-thread probe returned no readable pattern; the threaded probe resolved that case.

The production dependency audit reported zero known vulnerabilities at the time of this run. This is not a full security audit.

## Storage proof boundaries

This is **not SQLCipher and not full-file encryption**. Record bodies and source metadata are encrypted before SQLite receives them. SQLite table names, record/operation IDs, counts, and queue kinds remain visible. There is no plaintext full-text index. Search decrypts records in process and has not been benchmarked at the planned 50,000-record size.

Keys are supplied by the caller. The demo holds its key only in memory and removes its temporary files. OS-protected key persistence, production key rotation/recovery, and a usable persistent personal archive are not implemented. Do not use the demo as a real-data recorder.

Tests exercise database and active WAL canaries, wrong keys, tampered ciphertext, swapped record identities, outbox insertion failure, reopen/retry, exclusions, and local tombstone behavior. They do not establish server-side sync or deletion correctness.

## Toolchain findings

Node and npm are available. Rust/Cargo were not found on PATH or under the normal user cargo-bin paths. Visual Studio directories exist, but the Rust toolchain, usable native linker/SDK setup, and SQLCipher build are not established. No Mac native runtime test has been performed.

## Next engineering work

1. Establish the Rust/native toolchain and verify SQLCipher packaging on Windows and Mac; decide whether the encrypted-record prototype remains a harness or becomes an explicitly reviewed fallback.
2. Generate Rust contracts from the same schema, with wire-format parity tests.
3. Build a visible, disabled-by-default native collector harness with selected-app scope and focused-editor snapshots. Do not claim support for specific AI tools until measured.
4. Connect OS-protected key storage before collecting retained real text.
5. Add bounded collector queues, health/gap reporting, and actual typing/paste/edit/dictation scenarios on the intended surfaces.
6. Run real Mac permission/native-access tests and the planned soak/resource measurements.

Cloud sync, refiners, and live suggestions are later milestones. The broad-recorder product direction remains unchanged.
