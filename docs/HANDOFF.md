# Start here in a new chat

Last updated: 19 October 2026.

## Current state

promteSaver (working name Pomte) now has an executable M0 synthetic foundation. Read `M0_PROGRESS.md` for current evidence and limitations. JSON Schema/generated TypeScript contracts, capture policy, snapshot reconciliation, redaction, encrypted-record SQLite storage, local outbox/tombstones, and a synthetic replay CLI exist. A threaded Windows owned-control accessibility proof also exists. There is no installed global recorder, persistent OS key storage, cloud deployment, or model integration.

The accepted product direction is an installed Windows/Mac collector that stores permitted text locally, works offline, syncs with a website, and later learns reusable prompting patterns. Broad recording remains central; snapshots and adapters improve the accuracy of reconstructed prompts.

## Read in this order

1. Root `AGENTS.md`.
2. `M0_PROGRESS.md` for implemented code and actual checks.
3. `CONVERSATION_SUMMARY.md` for user intent.
4. `DECISIONS.md` for committed direction and provisional choices.
5. `IMPLEMENTATION_PLAN.md`, especially M0 and F01–F09.
6. `TECHNICAL_DESIGN.md` for contracts, capture lifecycle, sync, and provenance.
7. `INFRASTRUCTURE.md` when adding the service or packaging.
8. `RESEARCH.md` before selecting or copying dependencies.

`ROADMAP.md` contains future ideas. It does not expand the first-release scope automatically.

## Checks observed on Windows

- `npm run check`: generated-contract check, TypeScript check, and 26 tests pass.
- `npm run demo`: three retained synthetic records and pending operations survive reopening; search and redaction counts match the fixture.
- `npm run test:windows`: four owned-control snapshots pass via `TextPattern`, and password metadata is identified without reading it. Line endings are normalized. No external application is inspected.
- `npm audit --omit=dev --audit-level=high`: zero known production dependency vulnerabilities reported.
- No Mac native checks, SQLCipher build, cloud synchronization, or performance/soak targets are validated yet.

## Next work

Continue M0 after the synthetic foundation:

1. Inspect the actual checkout and existing instructions; do not assume it still contains only planning files.
2. Verify Rust/native build prerequisites and choose stable releases. The earlier Windows check found Git/Node/npm/pnpm/Python on PATH, but not Cargo/rustc/CMake/Docker. These findings may have changed.
3. Run `npm ci --ignore-scripts`, `npm run check`, and `npm run demo` to verify the current foundation. On Windows, run `npm run test:windows` for owned-control native evidence.
4. Generate matching Rust wire contracts and prove native encryption packaging. The current archive uses AES-GCM-encrypted payloads inside SQLite, not SQLCipher or full-file encryption.
5. Add OS-protected key storage and build a visible, disabled-by-default Windows collector harness, then the corresponding Mac harness with real Mac test access.
6. Report measured capture coverage and gaps before building the cloud refiners.

The first development tasks do not require an AI API key. Configure real AI credentials when beginning M3, using the supported credential workflow rather than committing keys or searching unrelated user files.

## Critical boundaries

- Do not claim universal capture, perfect filtering, or validated Mac behavior from planning documents.
- Preserve originals after permitted filtering; make refinement versioned and traceable.
- Do not upload synthetic test data to a live user account unnecessarily or put real captured text in Git.
- Keep capture visibly enabled/paused and respect excluded/protected surfaces. A database crash, unknown editor, or revoked OS permission must not silently broaden collection.
- User-triggered insertion must verify current focus and must not send the prompt automatically.
- The service should remain unavailable without breaking local collection, search, or cached reuse.

## Ready-to-use continuation prompt

> Continue work on https://github.com/dvajjala-ui/promteSaver. Read AGENTS.md, docs/HANDOFF.md, docs/M0_PROGRESS.md, docs/DECISIONS.md, docs/IMPLEMENTATION_PLAN.md, and docs/TECHNICAL_DESIGN.md. Run the existing synthetic checks first. Preserve the Windows/Mac broad-recorder, offline-storage, website-sync, and two-refiner direction. Continue M0 with native Rust/toolchain and encryption validation, generated Rust contract parity, OS-protected key storage, and a visible disabled-by-default Windows collector harness, then validate the matching Mac behavior. The current encrypted-record SQLite prototype is not SQLCipher, and the Windows proof covers only owned synthetic controls. Keep real typing and secrets out of Git and update the handoff with actual evidence.

## Update this file after implementation

Record implemented components, commands that actually work, tests actually run, measured compatibility, unresolved issues, and the next concrete task. Keep plans clearly separate from completed work. Avoid copying raw private prompts or machine-specific secrets into handoff notes.
