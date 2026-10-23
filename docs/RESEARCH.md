# Research and reuse decisions

Researched: 19 October 2026. Public GitHub repository pages, selected licence files, official platform documentation, a research paper, engineering writing, and Reddit discussions were inspected. This was a documentation and repository review, not a runtime evaluation or full dependency audit. No external repository installer was executed.

## Recommendation

Use established permissively licensed infrastructure and build the product-specific capture reconciliation and prompt learning loop. Avoid adopting a large recording or memory application wholesale before testing the actual input surfaces.

The assumed path is an independent product that can later be commercialized. The user has not selected an open-source licence for Pomte. Copyleft projects remain useful references or separate integrations, but copying their implementation is not the default plan. Before incorporating any code, inspect its exact revision, file-level notices, dependencies, and distribution obligations.

## GitHub shortlist

| Project and evidence | Observed fit | Reuse decision |
| --- | --- | --- |
| [Tauri](https://github.com/tauri-apps/tauri), [MIT licence](https://github.com/tauri-apps/tauri/blob/136a28eaa879e8aa706f9b2e05a050c46dcc1f4f/LICENSE-MIT), [Apache licence](https://github.com/tauri-apps/tauri/blob/136a28eaa879e8aa706f9b2e05a050c46dcc1f4f/LICENSE-APACHE-2.0) | Desktop shell, tray, native bridge, packaging. | Adopt a stable Tauri 2 release; the inspected default branch is development, not a release pin. Native recording remains our work. |
| [rdev](https://github.com/Narsil/rdev), [MIT licence](https://github.com/Narsil/rdev/blob/b7e201bf80be7b9632207366f277d29fe732b9c1/LICENSE) | Global input events on Windows/macOS/Linux. README describes a small personal project. | Prototype candidate behind our collector interface. Test keyboard layouts, permissions, event loss, and lifecycle before adopting. No claim of final-text reconstruction. |
| [Enigo](https://github.com/enigo-rs/enigo), [MIT licence](https://github.com/enigo-rs/enigo/blob/a88d9b7e2cec7043ab5f03e754500a091ea928d1/LICENSE) | Cross-platform input simulation. | Evaluate for user-triggered insertion. It is not a capture engine. Copy/paste fallback remains available. |
| [ActivityWatch window watcher](https://github.com/ActivityWatch/aw-watcher-window), [MPL-2.0 licence](https://github.com/ActivityWatch/aw-watcher-window/blob/aebd113f0aec459edce5acb1194b9f7e5bd749ff/LICENSE.txt) | Active application/window tracking on desktop platforms. | Architecture and context-tracking reference. Separate integration possible; any copied files need a specific licence decision. It does not supply prompt text. |
| [Espanso](https://github.com/espanso/espanso) | System-wide text expansion, app-specific configurations, forms, search. Repository reports GPL-3.0. | Study interaction patterns and optionally export compatible templates. Do not copy implementation into the proposed independently licensed core. |
| [Memento](https://github.com/ddong8/memento), [English README](https://github.com/ddong8/memento/blob/main/README.en.md), [AGPL-3.0 licence](https://github.com/ddong8/memento/blob/c0f68a6a1a216c77252cd499f35f0a11fe8edcbc/LICENSE) | Close conceptual match: coding-tool collectors, offline queue, web archive, and later processing. | Reference or separately evaluated self-hosted alternative. Not a drop-in dependency. Claims are from its documentation; maturity and capture correctness are untested. |
| [Supermemory](https://github.com/supermemoryai/supermemory), [MIT licence](https://github.com/supermemoryai/supermemory/blob/f81fad00e4bfc42610159cf6bd7bdb5fc4ca7cbe/LICENSE) | Memory/context engine with an application and self-hosting direction. | Evaluate later as an optional memory backend. Hosted offerings and a repository licence are different things; do not assume parity or zero operating cost. |
| [Mem0](https://github.com/mem0ai/mem0), [Apache-2.0 licence](https://github.com/mem0ai/mem0/blob/0724291bd864cf807e88ee8981c8226644e8fb42/LICENSE) | Extraction and retrieval infrastructure for AI memory. | Compare against a small custom extraction pipeline after we have evaluation data. Not a desktop recorder and not the authority for our raw archive. |
| [pgvector](https://github.com/pgvector/pgvector), [licence](https://github.com/pgvector/pgvector/blob/f37c13f68b57d2c3472b2214fbcff699d6d34876/LICENSE) | Vector similarity inside PostgreSQL. Licence text permits use and redistribution with notices. | Adopt for server semantic retrieval when needed; keep exact keyword search as well. No separate vector service in the initial deployment. |
| [Screenpipe](https://github.com/screenpipe/screenpipe), [current licence](https://github.com/screenpipe/screenpipe/blob/62482a789d034d1eea08e8554744c2a9eaa02221/LICENSE.md) | Broad desktop history; README includes a prompt-journal workflow. | Current source is commercially restricted. Do not treat it as a free commercial foundation or copy its code. Consider a separately licensed integration only if justified. |

The Screenpipe finding updates the earlier conversation: source visibility does not establish unrestricted open-source reuse. Espanso and Memento are also not licence-neutral foundations. These are implementation selection decisions, not a completed legal review.

## Recorded source revisions

Public GitHub API metadata was fetched to make the research reproducible. These are research snapshots, not approved package versions. All listed repositories reported `archived: false`; that alone does not establish maintenance quality.

| Repository | Default branch | Inspected SHA | Repository pushed_at, UTC |
| --- | --- | --- | --- |
| tauri-apps/tauri | dev | 136a28eaa879e8aa706f9b2e05a050c46dcc1f4f | 2026-10-15T20:53:23Z |
| Narsil/rdev | main | b7e201bf80be7b9632207366f277d29fe732b9c1 | 2026-05-12T10:57:01Z |
| enigo-rs/enigo | main | a88d9b7e2cec7043ab5f03e754500a091ea928d1 | 2026-10-16T09:22:38Z |
| ActivityWatch/aw-watcher-window | master | aebd113f0aec459edce5acb1194b9f7e5bd749ff | 2026-10-14T15:29:56Z |
| espanso/espanso | dev | 0cadaeaddf9aeb6d128668ea5db354b7c635ec20 | 2026-10-18T00:23:35Z |
| ddong8/memento | main | c0f68a6a1a216c77252cd499f35f0a11fe8edcbc | 2026-10-18T16:29:17Z |
| supermemoryai/supermemory | main | f81fad00e4bfc42610159cf6bd7bdb5fc4ca7cbe | 2026-10-18T02:37:33Z |
| mem0ai/mem0 | main | 0724291bd864cf807e88ee8981c8226644e8fb42 | 2026-10-17T21:06:52Z |
| screenpipe/screenpipe | main | 62482a789d034d1eea08e8554744c2a9eaa02221 | 2026-10-18T01:57:55Z |
| pgvector/pgvector | master | f37c13f68b57d2c3472b2214fbcff699d6d34876 | 2026-10-18T12:20:41Z |

`pushed_at` is repository metadata, not the date of the inspected commit. GitHub returned NOASSERTION for some licence metadata; the Screenpipe and pgvector texts were checked directly rather than interpreting that value as an absence of terms.

## Platform feasibility evidence

| Source | Established fact | Implementation consequence |
| --- | --- | --- |
| [Windows keyboard callback](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc) | Keyboard callbacks have timing/lifecycle constraints. | Keep the callback minimal; queue bounded work and detect collector degradation. Never run AI or network requests in it. |
| [Foreground window API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow) | Foreground window handles are obtainable, but can be absent during transitions. | Attach context at collection time and tolerate unknown/focus-transition states. |
| [Windows text-change events](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-handlingtextrelatedevents) | Supporting controls expose text changes through UI Automation. | Use focused editor snapshots to reconcile edits, pasted text, and dictation when supported. |
| [Windows UI Automation security](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-securityoverview) | Protected/elevated UI has access restrictions. | Publish capture gaps; do not depend on broad elevation or bypassing protected interfaces. |
| [Mac Input Monitoring](https://support.apple.com/guide/mac-help/control-access-to-input-monitoring-on-mac-mchl4cedafb6/mac) | Users can authorize input observation across applications. | Provide permission status and a test field in onboarding. |
| [Mac Accessibility](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac) | Accessibility access is user controlled. | Treat input observation and editor access as separate capabilities. |
| [Apple Secure Event Input note](https://developer.apple.com/library/archive/technotes/tn2150/_index.html) | Secure input can prevent keyboard interception. This is archived documentation. | Respect protected entry and verify current behavior on test Macs. Never infer complete recording from permission alone. |
| [Mac direct distribution](https://developer.apple.com/developer-id/) | Developer ID signing and notarization support distribution outside the Mac App Store. | Plan signed/notarized downloads; store acceptance is not assumed. |
| [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | Extensions can interact with permitted page DOMs. | Add adapters for reliable website/conversation identity and send detection. Browser permission is separate from OS permission. |
| [Tauri capabilities](https://v2.tauri.app/security/capabilities/) | Native command access can be scoped to windows/webviews. | Bundle trusted local UI; do not give a remotely loaded website recorder or filesystem powers. |
| [SQLCipher design](https://www.zetetic.net/sqlcipher/design/) | Database and journal data can be encrypted; temporary-file configuration matters. | Prove encrypted database, WAL, and temp handling on both platforms. SQLite alone is not encryption. |

Additional infrastructure documentation: [Tauri autostart](https://v2.tauri.app/plugin/autostart/), [signed updater](https://v2.tauri.app/plugin/updater/). Exact permission behavior and dependency versions must be validated during implementation.

## Reddit and engineering-writing findings

These are qualitative observations and design hypotheses, not adoption statistics or controlled evidence.

1. A [prompt-library discussion](https://www.reddit.com/r/ChatGPTPromptGenius/comments/1qkedie/how_are_you_all_managing_prompt_libraries_without/) describes scattered prompts, lost versions, and maintenance friction. Product response: automatic ingestion, source history, search, and minimal required filing.
2. A [SyntaxAI developer post](https://www.reddit.com/user/AutomaticRoad1658/comments/1rqf582/i_built_a_prompt_library_for_power_users_added/) reports declining activity after a variables update and rebrand. It does not establish causation. Product hypothesis: default to simple reuse; show fields only when something actually changes.
3. A [Mac permission discussion](https://www.reddit.com/r/cybersecurity/comments/1vsie3d/teams_wanting_to_record_all_keystrokes_from_all/) shows confusion around input monitoring. Product hypothesis: a visible capture indicator, clear scope, and immediate pause should be part of the main interface.
4. [Ink & Switch's local-first essay](https://www.inkandswitch.com/essay/local-first/) argues for useful local copies and offline operation. Our proposed adaptation: collection and cached reuse work independently of service availability. Cloud refinement still requires the service unless local inference is added.
5. [Prompt-with-Me](https://arxiv.org/abs/2509.17096) explores IDE prompt classification and reusable template extraction. It supports evaluating this direction; it does not validate universal capture or predict our product's effectiveness.

## Build, integrate, or use an existing product

| Route | Advantage | Tradeoff | Decision |
| --- | --- | --- | --- |
| Independent recorder and product | Fits broad collection, provenance, style preservation, and suggestion behavior | More native engineering and evaluation | Recommended |
| Existing cross-agent memory service | Faster agent context sharing | Does not establish universal typing assistance or our archive semantics | Optional later integration |
| Fork a complete memory/recording product | Existing UI and pipelines | Licence, architecture, resource use, and dependency burden | Not the default |
| Only a prompt extension | Fast browser prototype | Misses native apps and desktop context | Useful supplement |

## Research limits and next checks

No binaries were installed, no capture was enabled, no source code from these projects was copied, and no Mac runtime test was possible in this Windows workspace. Before approving dependencies, pin stable releases, review the full dependency graph and notices, inspect relevant open issues, and reproduce needed behavior. Do not use stars, README claims, or synthetic benchmark numbers as acceptance evidence.
