# promteSaver — implementation planning

Status: researched implementation proposal, 19 October 2026. No application, recorder, cloud service, or AI integration has been installed or implemented.

promteSaver (working product name: Pomte) is a proposed Windows and macOS application that remembers a user's prompting across AI tools. It collects permitted input locally, synchronizes when online, preserves historical prompts, and learns reusable instructions and templates. A desktop picker and later contextual suggestions bring those instructions back while the user works.

The first release targets personal use across the user's Windows PC and Mac. Android and iPhone remain later work.

## Start here

- [New-chat handoff](docs/HANDOFF.md): current state, reading order, and a ready-to-use continuation prompt.
- [Conversation summary](docs/CONVERSATION_SUMMARY.md): the user's goals, accepted direction, and how the idea developed.
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md): scope, milestones, acceptance criteria, effort assumptions, and the first engineering tasks.
- [Technical design](docs/TECHNICAL_DESIGN.md): capture, local storage, sync protocol, AI processing, retrieval, and application boundaries.
- [Infrastructure plan](docs/INFRASTRUCTURE.md): development, staging, production, deployment, secrets, backups, and operations.
- [Research and reuse decisions](docs/RESEARCH.md): GitHub projects, licence evidence, Reddit observations, engineering references, and source revisions.
- [Decision log](docs/DECISIONS.md): agreed product direction versus recommendations and unresolved choices.
- [Future roadmap](docs/ROADMAP.md): later possibilities and the evidence needed to prioritize them.

New contributors and coding agents should read [AGENTS.md](AGENTS.md) and the handoff first. The linked documents provide context without requiring the original chat.

## Recommended direction

Build an independent Tauri 2 application with a Rust collector and React/TypeScript interface. Use platform-specific capture modules, an encrypted local database, and an authenticated upload queue. Use a TypeScript web application/API, a background worker, and PostgreSQL for the service. Add pgvector when semantic retrieval is introduced.

Keep the broad recorder as a collection source. Supplement it with editor snapshots, browser adapters, and agent hooks to improve reconstruction and source attribution. A key event is evidence of input, not proof of the final submitted prompt.

Build the historical archive and fast reuse before automatic live completion. The two AI refiners generate derived records linked to retained originals; they do not overwrite them.

## What is decided and what needs proof

| Direction | Status |
| --- | --- |
| Windows and Mac first; installed application plus website | Agreed product direction |
| Offline collection and eventual synchronization | Required |
| Retained source records plus separate understanding and generalization stages | Required |
| Preserve the user's phrasing and mixed-language style | Required |
| Tauri, Rust, React, PostgreSQL, custom append-oriented sync | Recommended implementation choices |
| Accurate capture across every named tool | Unproven; measured per surface |
| Complete global recording, perfect credential filtering, universal inline completion | Not a deliverable promise |
| Product name, business model, public source licence, cloud provider, AI provider | Open; do not block the capture prototype |

The workspace was empty apart from Git metadata when this planning package was created. No existing project instructions or application code were found.
