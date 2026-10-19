# Start here in a new chat

Last updated: 19 October 2026.

## Current state

This is a planning-only repository for promteSaver, working product name Pomte. Research and implementation design are complete enough to begin a feasibility prototype. No application code, recorder, installer, cloud deployment, credentials, or model integration exists in this planning snapshot.

The accepted product direction is an installed Windows/Mac collector that stores permitted text locally, works offline, syncs with a website, and later learns reusable prompting patterns. Broad recording remains central; snapshots and adapters improve the accuracy of reconstructed prompts.

## Read in this order

1. Root `AGENTS.md`.
2. `CONVERSATION_SUMMARY.md` for user intent.
3. `DECISIONS.md` for committed direction and provisional choices.
4. `IMPLEMENTATION_PLAN.md`, especially M0 and F01–F09.
5. `TECHNICAL_DESIGN.md` for contracts, capture lifecycle, sync, and provenance.
6. `INFRASTRUCTURE.md` when adding the service or packaging.
7. `RESEARCH.md` before selecting or copying dependencies.

`ROADMAP.md` contains future ideas. It does not expand the first-release scope automatically.

## Next work

Begin M0/F01–F03:

1. Inspect the actual checkout and existing instructions; do not assume it still contains only planning files.
2. Verify Rust/native build prerequisites and choose stable releases. The earlier Windows check found Git/Node/npm/pnpm/Python on PATH, but not Cargo/rustc/CMake/Docker. These findings may have changed.
3. Establish typed observation/prompt/capture-state contracts and synthetic replay fixtures.
4. Implement local capture-policy decisions and encrypted storage proof.
5. Build a visible Windows collector harness, then the corresponding Mac harness with real Mac test access.
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

> Continue work on https://github.com/dvajjala-ui/promteSaver. Read AGENTS.md, docs/HANDOFF.md, docs/CONVERSATION_SUMMARY.md, docs/DECISIONS.md, docs/IMPLEMENTATION_PLAN.md, and docs/TECHNICAL_DESIGN.md. Preserve the agreed Windows/Mac broad-recorder, offline-storage, website-sync, and two-refiner direction. Begin M0 with toolchain verification, shared contracts, synthetic fixtures, capture policy, and an encrypted local-storage proof, then build the visible Windows harness and plan the matching Mac validation. Make routine implementation choices and continue autonomously. Keep real typing and secrets out of Git, do not claim untested platform support, and update HANDOFF.md with actual changes and test evidence.

## Update this file after implementation

Record implemented components, commands that actually work, tests actually run, measured compatibility, unresolved issues, and the next concrete task. Keep plans clearly separate from completed work. Avoid copying raw private prompts or machine-specific secrets into handoff notes.
