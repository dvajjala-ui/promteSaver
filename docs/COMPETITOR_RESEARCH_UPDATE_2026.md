# Market and user signals — 22 October 2026

> **Documentation scope (31 October 2026): Historical research.** References and findings retain their original consultation dates; this refresh did not verify them again. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

This is a **qualitative product-direction memo**, not a user survey or proof of market size. Product-site descriptions are marketing claims, and Reddit posts are self-selected and often from app builders. We independently implement our code; the research is about user problems and interaction patterns, **not source-code copying**.

## Products and patterns

| Reference | Publicly advertised behavior | Product response for promteSaver |
| --- | --- | --- |
| [PromptDock Chrome](https://chromewebstore.google.com/detail/promptdock-%E2%80%94-ai-prompt-ma/defjommoicbcjgbnnlghfkbfaobkhige) | Local prompt folders, one-click insert, `{{}}` variables, export/import, multiple AI sites | v0.2 adds templates/search/manual capture. Direct insertion needs separate safety review and target-editor confirmation before implementation |
| [PromptDock VS Code](https://marketplace.visualstudio.com/items?itemName=promptdock.promptdock) | Developer prompt folders, versions and coding assistant history | Track VS Code as a native integration opportunity, **not** a permission to silently read editor content |
| [PromptDock (alternate extension)](https://chromewebstore.google.com/detail/promptdock-ai-prompt-mana/cmoblnffdfdjbhdlecaeajgjjgochggl) | Local organization and in-chat shortcuts; highlights value of retrieving prompt *without switching context* | User-selectable global quick finder & safe insertion are native-shell P1 tasks |
| [Tauri 2 capabilities](https://tauri.app/security/capabilities/) | Scoped capability permissions for individual WebViews | Design native shell with least privilege, separate capture and presentation capabilities |
| [Tauri 2 updater](https://tauri.app/plugin/updater/) | Signed update artifacts and explicitly granted update capabilities | Require signed distribution and trusted update path before market release |

## User discussions and what they suggest

- [Reddit r/PromptEngineering: How do you organize and reuse your best prompts? (8 Aug 2026)](https://www.reddit.com/r/PromptEngineering/comments/1vipqlj/how_do_you_organize_and_reuse_your_best_prompts/) contains user anecdotes about scattered notes, old chat threads, needing context and fast retrieval, and prompt versions changing effectiveness when models update. **Interpretation:** prioritize recall speed, notes on why a prompt works, source tags, versions; do not assume people want full data harvesting.
- [Reddit r/PromptEngineering: reusable prompts across AI tools (12 Jun 2026)](https://www.reddit.com/r/PromptEngineering/comments/1u3za7y/how_are_you_organizing_reusable_prompts_across/) discusses organizing by use case and having prompts available inside working context rather than only in a separate document. **Interpretation:** templates, fast picker, project tags, future explicit insertion.
- [Reddit r/PromptDesign: How do you organize prompts you want to reuse? (29 Jan 2026)](https://www.reddit.com/r/PromptDesign/comments/1qq9c3j/how_do_you_organize_prompts_you_want_to_reuse/) describes workflow rather than model grouping and saving prompt packs. **Interpretation:** improve project/workflow grouping and guided packs after testing basic retrieval.
- [Reddit r/PromptEngineering: Save and improve prompts (4 Feb 2026)](https://www.reddit.com/r/PromptDesign/comments/1qw4c6n/how_do_you_improve_and_save_good_prompts/) recommends treating prompts like code, versioning and evaluating changes. **Interpretation:** keep versions and optional structured outcome notes, never mutate a source prompt silently.

These are not representative usage statistics; some are promotion by tool makers. Before assuming demand, interview a balanced pilot of developers, writers, students, support agents, and low-spec PC/Mac users. Gather **opt-in feedback without uploading users' prompt contents**.

## Differentiation hypothesis

**"Your private, fast, source-aware prompt memory across tools—with capture under your control."** Competing mainly on infinite folders and AI-generated prompt libraries is easy to copy and adds clutter. We should prove three jobs first: (1) one-click deliberate saving, (2) retrieval in the user's working context, (3) safe repeatable reuse with provenance and versions.

### Implement now / next / only after proof

| Priority | Hypothesis | Why |
| --- | --- | --- |
| NOW | Fast local search, tags, projects, pinned templates, variables, context notes | Immediately testable without extra permissions/cloud; shipped in v0.2 |
| NOW | Undoable deletes, encrypted backup, write-only browser save | Recoverability & user trust; shipped in v0.2 beta |
| NEXT | Keyboard-first native finder, opt-in focused text insertion without submission | Reduces context switching; needs real OS/UI validation |
| NEXT | Lightweight macOS/Windows native shell, OS keychain, signed updater | Required for non-developers to install safely and to meet low-memory goals |
| AFTER PRIVACY GATE | Native app/editor capture consent and accurate submitted-text evidence | Largest privacy/trust risk; blocked until producer-side exclusions tested |
| AFTER VALIDATION | Opt-in sync, teamwork, prompt evaluation/model variant metadata, AI refinement | They have storage, cost, consent, conflict and security consequences |
| AVOID | Invisible recording, broad clipboard/screen capture, silent remote AI | Contradicts product promise and risks collecting sensitive information |

## Usability study proposal

Run 8–12 consented local sessions: first-time setup, save a useful prompt, find it after a simulated delay, fill a variable template, restore an accidental delete, export/recover a backup, and disable a browser helper. Capture *time-to-task, success/failure and observed confusion*, **not** real prompt text. Ensure some devices have 4–8 GiB RAM. Do not claim 80% user or market readiness until explicit release gates and at least one cross-OS pilot pass.
