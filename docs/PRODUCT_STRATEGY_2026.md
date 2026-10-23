# Product strategy & competitive research — 22 October 2026

## Executive decision

Build **a prompt memory and reuse workspace**, not a surveillance-style activity logger or yet another general-purpose chat interface. The first job is: *"I did useful thinking before; help me find, trust, adapt, and reuse it in seconds."* The durable differentiator is **source-aware recall across tools** combined with **explicit user-controlled templates** and **real privacy boundaries**.

The uploaded repository originally had an M0 synthetic recorder with a large cloud roadmap but **no end-user surface**. The first software slice now implements a local encrypted library and a limited user-triggered browser capture helper. It is a developer preview, not finished commercial software.

## Personas and jobs to be done

| Persona | Pain | Daily successful outcome |
| --- | --- | --- |
| Professional developer | The useful PR-review, debugging and architecture prompts disappear across ChatGPT, Claude, IDE agents and notes | Find a proven prompt; adapt project, language and environment; copy into the current tool in under 10 seconds |
| Student / researcher | Good research prompts are scattered across topics | Revisit sourced instructions without confusing assistant output with the original prompt |
| Operations / business user | Repetitive meeting summaries, emails, announcements and spreadsheet requests | Fill 2–4 template variables instead of rewriting 10 paragraphs |
| Low-spec laptop user | Productivity tool consumes too much RAM, battery, startup time or bandwidth | Offline lookup with no model spin-up, quiet idle and a quick return to work |
| Privacy-sensitive user | Global capture may unintentionally collect credentials, health, financial data or confidential clients | Choose exactly what gets saved; pause/lock easily; delete records; no silent uploads |

## Competitive review (research only: no code or design copied)

| Comparison | Observed capabilities | Product decision |
| --- | --- | --- |
| [Raycast clipboard history](https://manual.raycast.com/clipboard-history), [snippets](https://manual.raycast.com/snippets) | History, pinning, search, editing, exclusions, dynamic snippets; configurable retention | Match **fast recall** and explicit exclusions; focus on prompts + provenance instead of everything copied |
| [Pieces docs](https://docs.pieces.app/) and [privacy disclosures](https://github.com/pieces-app/docs-content/blob/main/public/content/privacy-security-your-data.md) | On-device contextual memory, connectors, scoped context sent to cloud AI when requested | Separate collection, storage, local search and optional inference; never pretend cloud inference is local |
| [Text Blaze](https://blaze.today/guides/forms/) | Form variables and reusable templates | Support `{{variable}}` filling in first MVP; only copy, never auto-submit |
| [Espanso](https://espanso.org/docs/matches/basics/) | Cross-platform text expansion with commands, triggers and app-specific behavior | Lightweight always-off-by-default helper first; explicit insertion after active editor verification later |
| [PromptMason privacy model](https://promptmason.ai/privacy) | Local prompts, no default cloud store, loopback service with token | Use a narrow loopback API with a per-session token and no remote dependencies |

**Do not build:** a clone of a general AI chatbot, a default-on clipboard logger, an unconsented keyboard recorder, a marketplace before retrieval works, or automatic prompt execution.

## Community findings and research limitations

1. In a [January 2026 Reddit prompt-library discussion](https://www.reddit.com/r/ChatGPTPromptGenius/comments/1qkedie/how_are_you_all_managing_prompt_libraries_without/), posters describe version confusion, scattered notes, time lost rediscovering effective prompts, and difficulty identifying the "keeper" version. This motivates explicit edit history and favorites as a near-term roadmap item.
2. A [September 2026 ChatGPT history thread](https://www.reddit.com/r/ChatGPT/comments/1wdorfm/has_anyone_figured_out_a_way_to_clean_up_their/) describes hundreds of mixed-value prompts and expensive attempts to clean up history with AI. This motivates powerful local filtering and *not* default AI processing every record.
3. An [October 2026 macOS clipboard-manager thread](https://www.reddit.com/r/macapps/comments/1wv8rak/what_clipboard_manager_are_you_using_right_now_in/) includes praise for straightforward search and pinning. It is an anecdotal signal for good ergonomics and low latency.
4. An [organizing prompts discussion](https://www.reddit.com/r/chatgpt_promptDesign/comments/1r5im0w/how_do_you_organize_your_ai_prompts/) similarly highlights fragmentation across chat history, notes and docs.

These discussions are **qualitative exploratory evidence**, not representative samples. Some posts may be vendor promotion, and a handful of comments do not establish market size or validated feature demand. No paid market report or primary interviews were conducted in this sprint.

## The three product principles

1. **Trust before breadth:** Capture must produce exactly labeled provenance (`manual`, `draft`, `verified submission`, `partial`). Never fabricate exactness. Skip unknown/private fields and make exclusions visible.
2. **Reuse before AI:** Local keyword search, tags, pinned prompts and fillable templates must work immediately while offline; optional intelligence comes after 5+ repeat workflows show value.
3. **Predictable on weak hardware:** No background local language model, screenshot OCR or giant JS framework in the MVP. Search returns capped results, CPU-idle work is near zero, ingestion is event-driven, and network calls are absent by default.

## First release: three workflows

**Developer** — Save a reliable review prompt, tag it `code-review`, pin it, retrieve via keyboard shortcut, fill `{{language}}` and `{{diff_summary}}`, copy into current editor, and improve the original later.

**Everyday user** — Turn a meeting summary into a template with `{{notes}}`; reuse after each meeting without memorizing formatting instructions or sharing notes with a second service.

**Capture trial** — On an allowlisted AI site, focus an existing prompt editor, explicitly open the manual browser helper, review the extracted content, and copy it into the library. No background observation and no automatic submission claims.

## Success metrics (proposals, not measured outcomes)

- Activation: an opted-in user saves 3 real prompts and reuses 1 on day 1.
- Retrieval: >=90% of 30 manually labelled recall tasks return a useful result in top 3 (first cohort; exact and optional semantic stages measured separately).
- Product value: >=20% reduction in time-to-reuse versus users' current notes workflow; measure via consented stopwatch tasks, not keyboard surveillance.
- Trust: 0 known prohibited-surface captures, 0 accidental upload requests, 0 prompt contents in diagnostic logs in simulated tests.
- Performance: desktop collector proposed idle RSS budget <=35 MiB excluding UI; UI opens within 1 second on agreed reference machines, local search p95 <=100ms at 5k records; these are **targets**, not verified cross-platform results.
- Retention: usefulness and voluntary continued use in a 7-day private pilot; no unconsented telemetry. Feedback should be gathered directly, with optional local aggregates.

## Longer-term differentiation experiments

- **Prompt provenance:** know if content was a verified submit vs a snapshot vs a human-edited template.
- **Semantic "why did I ask this" search:** optional opt-in, on-device-small-model or encrypted sync with explicit processing transparency.
- **Version trails:** compare a prompt's earlier successful revisions without overwriting its source history.
- **Workflow collections:** save sets of prompts with instructions, dependencies, and variable slots; never run them without explicit confirmation.
- **Universal picker:** keyboard-first search and verified target-aware paste into desktop editors. No automatic enter/submit.
- **Privacy receipts:** for every source show what was allowed, when, from which adapter, and how to remove it; no secret content in diagnostics.

## Competitive and platform references

- [Microsoft UI Automation TextPattern overview](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-textpattern-overview) explains access to text providers, trust and limitations. It does not guarantee an arbitrary AI site's exact submitted prompt.
- [Tauri architecture](https://v2.tauri.app/es/concept/architecture/) documents Rust + system webview; suitable for the eventual desktop shell but native resource budgets must be measured.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) guides keyboard and focus requirements.

No GPL/AGPL competitor code was imported into this repository. Research inspired independently implemented concepts, not copied assets or source.
