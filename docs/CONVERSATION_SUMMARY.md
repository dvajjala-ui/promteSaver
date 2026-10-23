# Conversation summary

Planning snapshot: 19 October 2026. This is a project-focused summary for continuing work in another chat; it is not a verbatim transcript.

## The user's problem

The user writes roughly a hundred prompts a day across many AI products while developing different projects. The task-specific content changes, but core instructions recur. Rewriting is tedious, details are forgotten, and useful prompts from months earlier are hard to recover.

Tools mentioned include ChatGPT, Claude, Gemini, Codex, Cursor, VS Code, Antigravity, Kimi, OpenCode, and another tool written as “queen” (possibly Qwen; not confirmed). The system should not depend on moving all work into a single AI client.

The original long-term device goal was Windows, Android, and iPhone. The user subsequently chose Windows PC and Mac as the immediate focus. Future mobile access remains desirable.

## What the user wants

- Automatic collection during normal work, rather than repeatedly saving and tagging prompts manually.
- A broad desktop typing/input recorder, with user permission, filters, and source context where obtainable.
- Local collection and storage while offline, followed by automatic synchronization with the product's website when connected.
- Retained original material so analysis can happen later and mistaken interpretations can be corrected.
- One refiner that reconstructs and understands the captured text, followed by another that decides what can be generalized.
- Exact historical prompts as well as reusable templates, instruction blocks, project context, and personal preferences.
- Suggestions while typing or dictating that reduce repeated writing and remind the user of relevant omitted instructions.
- The user's natural wording and mixed-language style, without automatically rewriting every prompt into formal prose.
- A project-based organization that still recognizes common patterns across different projects and tools.

Example desired experience: begin a new project's setup prompt, then see a relevant project-starting workflow from months earlier, adapted only where necessary. The user can insert all or part of it and continue editing.

## How the direction developed

1. Initial research compared text expanders, prompt libraries, and memory tools. The user clarified that manually maintained templates alone do not satisfy the objective.
2. The design evolved into automatic capture, retained history, later analysis, and contextual suggestions.
3. The user specifically proposed daily keyboard/input collection and accepted a multi-stage refinement pipeline. Broad recording is part of the intended product, not an abandoned idea.
4. Platform research identified limits to universal recording, particularly on iPhone. The user narrowed immediate work to Windows and Mac.
5. The user accepted the installed desktop collector plus offline storage and website sync direction.
6. The user requested GitHub/Reddit/blog research and an implementation plan. Research and planning documents were created; implementation has not started.
7. The user requested publishing the summary, plans, architecture, infrastructure findings, and future ideas to `dvajjala-ui/promteSaver` to enable work in a new chat.

## Agreements versus recommendations

Agreed product direction: installed Windows/Mac app; broad permitted collection; offline archive; sync when online; separate source and derived records; two refiners; historical retrieval; less typing; project context; style preservation.

Recommended, not user-selected in detail: Tauri 2/Rust/React desktop, SQLCipher local storage, Next.js web/API, TypeScript worker, PostgreSQL and later pgvector, independent core, picker before broad live suggestions, and the M0–M5 milestone sequence.

Unselected: final product name/branding, public source licence, monetization, cloud vendor/region, AI provider/models, authentication vendor, exact supported OS versions, and whether to adopt a hosted memory backend.

## Findings that must survive the handoff

- Keyboard events alone do not reliably reconstruct pasted, dictated, selected/replaced, or edited text. Editor snapshots and tool adapters supplement the broad recorder.
- Record app/window/session context at capture time when available. Later AI cannot reliably recover missing source information from text alone.
- Distinguish drafts, confirmed submissions, partial captures, and guesses. Enter is not universal proof of submission.
- Apply exclusions before durable storage/upload. “Raw” in the design means retained source material after filtering, not a promise to retain credentials or protected input.
- A situational request such as “research only today” must not become an unconditional personal rule.
- Repeated AI-inserted text must not be counted as independent evidence of a human preference.
- Cloud AI must read authorized content during processing; ordinary server-side analysis is not server-blind end-to-end encryption.
- Deleted data must not return when an offline device reconnects. Tombstones, account generations, and derived-data deletion matter.
- Current Screenpipe source has commercial restrictions. Memento is a close reference but AGPL-3.0. Espanso reports GPL-3.0. Public source visibility does not establish unrestricted reuse.
- No Mac runtime tests, capture benchmarks, installed recorder, cloud account, deployment, or real AI processing have been completed.

## Immediate next step

Follow M0 in `IMPLEMENTATION_PLAN.md`: verify toolchains, define contracts and synthetic fixtures, then prove collection and encrypted storage on Windows and Mac. The first practical deliverable is a visible local harness with measured source quality, not the entire finished website.
