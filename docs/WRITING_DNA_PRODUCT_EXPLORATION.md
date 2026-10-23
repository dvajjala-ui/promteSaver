# Writing DNA and contextual assistance — product feasibility (2026-10-22)

## Decision

Do **not** clone Grammarly or record all of a person's writing. Focus the product on **private, consensual writing memory and reuse**. Build a reusable, portable style profile from samples the user explicitly selects. Allow editing, export, revocation, and separation by context (personal email, work, developer documentation). Keep it a discrete feature rather than making the vault dependent on AI services.

## Market signals and references

- Grammarly's Windows/macOS product uses floating suggestions and an optional AI surface, with explicit suggestion review. This validates contextual help but reveals the complexity of cross-app overlays: https://support.grammarly.com/hc/en-us/articles/4412816078349-Grammarly-for-Windows-and-Grammarly-for-Mac-user-guide
- LanguageTool provides grammar checking through a self-hosted server/API; the public API specifically limits automated requests, so it must not be used as a free commercial backend: https://github.com/languagetool-org/languagetool-org.github.io/blob/master/public-http-api.md
- Chrome's built-in Writer/Rewriter/Proofreader APIs may permit locally managed on-device assistance on eligible hardware, but browser availability and hardware restrictions make these an optional adapter, not a required dependency: https://developer.chrome.com/docs/ai/get-started

## Proposed product surfaces

1. **Writing Studio**: user pastes or imports a sample with clear consent; system extracts transparent metrics and editable preferences.
2. **Voice cards**: separate context-aware profiles (Friendly email, GitHub issue, Technical documentation), portable `.json` + `.md` artifacts. Never assert personality or identity from text.
3. **Rewrite preview**: show original and suggested text side by side; never auto-replace user text. Preserve factual assertions and identifiers; mark large semantic changes.
4. **Contextual assistant**: optional browser-extension popup after a user action, not always-on keyboard observation. Cross-app overlays only after native permission and per-app exclusion tests.
5. **Grammar adapter**: OS spell-check first, optional explicit locally hosted LanguageTool, or optional compatible on-device model. Never route private text to a public API automatically.
6. **Style-to-AI bundle**: explicit export of instructions and user-reviewed examples with personal-data warnings; no hidden sharing or profiling.

## Prototype shipped this iteration

- `packages/writing-style/profile.ts`: pure bounded TypeScript style measurement + portable instructions.
- `apps/writing-studio/index.html` and `profile.mjs`: standalone responsive local UI with reviewable JSON, copy, and downloads.
- Focused tests for bounds, basic extraction, and output behavior. No background capture, model or third-party network access.

## Usability gates and risk controls

- Separate user-selected writing samples from captured prompt history (different purpose and consent).
- Prompt injection: examples are untrusted text. Current exported templates use delimiters and admonitions; this is not a security boundary when passed to another AI system.
- Never silently retain raw writing style samples. Export includes excerpts by design; strip secrets and personal information before sharing.
- Don't infer sensitive characteristics, emotional state, or personal identity, or train on coworkers' text without consent.
- Support per-source disablement, clear all, review/erase of derived profiles and original examples, and retention opt-in.
- UX: keyboard navigation, screen reader labels, reduced-motion support, mobile breakpoints, nonobstructive popovers, undo/accept/dismiss controls.
- Performance: no model loaded at startup; execute text analysis only on explicit click; avoid global observers/keyboard hooks; measure idle memory on 4 GiB hardware.

## Rollout gates

| Gate | Release requirement |
|---|---|
| A: prototype | Opt-in sample analyzer, editable style profile, preview/export; unit tests; no telemetry |
| B: vault integration | Encryption at rest, explicit consent boundaries, multi-profile CRUD, clear/delete, backup choices; migration tests |
| C: writing UX | Inline review, accessible overlay, selection-only capture, per-site exclusion; real Chrome/Edge and macOS testing |
| D: local proofreading | License-reviewed self-hosted integration or OS spell-check; benchmark low-memory devices |
| E: AI style rendering | Explicit per-use model choice, privacy indicator, semantic diff, user control and opt-in cloud transfer |
| F: release | Windows/macOS installed builds, accessibility audit, legal/security review, 4/8 GiB performance budgets, signing |

## Deferred / rejected

- Recording every keystroke or screen continuously: privacy and reliability risk.
- Imitating other people's identity or styles without permission: misuse risk.
- Treating heuristics as a forensic identity signature: scientifically unsupported.
- Shipping a bundled multi-GB model as mandatory on a 4 GiB machine: unacceptable performance cost.
- Automatic insertion in unknown input fields: unacceptable corruption risk.
