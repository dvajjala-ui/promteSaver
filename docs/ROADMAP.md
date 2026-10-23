# Future roadmap and product suggestions

Status: ideas to evaluate, 19 October 2026. This document does not expand the M0–M5 release plan. Prioritize using measured user benefit and capture/retrieval quality.

## Release sequence

| Stage | User benefit | Evidence before expanding |
| --- | --- | --- |
| Local archive | Recover what was previously written without manual filing | Accurate captures, useful search, visible gaps, encrypted storage |
| Connected archive | Use the same history on Windows, Mac, and the website | Offline recovery and deletion converge correctly |
| Learned reusable content | Reuse recurring instructions with changing details | Generalizations preserve intent and project scope |
| In-place suggestions | Less typing and fewer omitted constraints | Useful suggestions, low disruption, safe insertion |
| Broader integrations | More daily AI tools participate | Per-tool maintenance is affordable and measured |
| Mobile / local inference | Access beyond desktops or reduce cloud dependence | Core desktop loop already provides repeated value |

## Near-term product improvements

### Search by task and approximate memory

Allow queries such as “the prompt for starting a dashboard project a few months ago.” Combine task intent with date, source, and project filters. Exact keyword matches still matter for file names, unusual terms, and code. Offer original text next to generalized results.

### Learn small reusable blocks

Extract an instruction like “check the existing implementation first” separately from an entire bug-fix template. Let the user reuse just that block. Updates should not silently rewrite old source history or project-specific versions.

### Explain why a suggestion appears

Show a compact source cue: task match, project, approximate date, and which relevant instruction is missing. Avoid exposing a numeric “confidence” as if it guarantees correctness. Keep the interface small; users should not have to maintain taxonomies.

### Project matching with correction

Suggest a project from available workspace/session/domain evidence. A visible project chip lets the user correct it. Keep “unknown” available. Cross-project similarity can retrieve a general workflow without importing the other project's confidential details.

### Follow-up learning

If the user repeatedly adds “include tests” after a template, propose improving the reusable block. Distinguish a repeated correction from a situational request. Show the proposed change and its sources; allow undo and suppression.

### Useful first day

Before enough history exists for automatic patterns, deliver immediate search, recent prompts, and a few automatically suggested candidates from captured examples. Optional import from supported conversation exports can accelerate usefulness, but must preserve user/assistant roles and dates. Do not inspect unrelated private files by default.

## Later opportunities

| Idea | Potential value | Dependency / constraint |
| --- | --- | --- |
| Dedicated dictation | Speak the changing details; retrieve a familiar workflow | Separate microphone permission and transcription path; preserve transcript provenance |
| Agent-memory integration | Agents retrieve relevant instructions without repeated pasting | Supported hooks/MCP, narrow scope, authorization, and explicit rules for automatic context injection |
| Portable project instructions | Generate tool-specific instruction files from selected shared source blocks | Per-tool semantics, versioning, preview, and conflict handling |
| Local inference mode | Refine or retrieve privately while offline | Hardware benchmarks, model size/licence, battery/resource use, and meaningful quality comparison |
| Android keyboard | Suggestions inside supported mobile input fields | User selects our keyboard; app/source access varies |
| iPhone keyboard and companion app | Mobile access to synced prompts and suggestions | Supported fields only; keyboard/network permissions and limited context |
| Share-sheet / web mobile library | Reuse history without building a full keyboard first | Simple authenticated access, mobile clipboard/share behavior |
| Personal workflow analytics | Identify repeated work that could become a reusable instruction | Derive from permitted prompt fields; avoid unrelated activity monitoring |
| Outcome tagging | Prefer prompts that the user says worked | Acceptance is not proof of output quality; keep optional feedback quick |
| Template portability | Export JSON/Markdown and compatible text-expander formats | Versioned schema, original/derived distinctions, clear export scope |
| Optional screenshots/OCR fallback | Improve coverage of inaccessible controls | New permission, sensitive-content boundary, resource/storage cost; not an automatic fallback |
| Team libraries | Share explicitly selected reusable content | Separate personal/project/team scopes; never make personal capture visible to teammates by default |

## Experiments worth running

1. **Retrieval before rewriting:** compare inserting historical text with model-adapted text. Measure edits required and intent errors.
2. **Whole prompts versus small blocks:** compare which users accept and which reduces manual typing on recurring tasks.
3. **Project badge versus silent inference:** measure correction rate and cross-project mistakes.
4. **Picker versus automatic panel:** measure time to reuse, dismissals, and whether suggestions interrupt thought.
5. **Daily grouping versus continuous grouping:** compare latency, cost, and usefulness without reprocessing every keystroke.
6. **Original voice versus polished voice:** offer an explicit choice and observe which the user prefers for different tasks.

Run these with the user's selected workflows and consented data, using a held-out set where appropriate. Do not present proposed targets or model self-evaluations as observed user outcomes.

## Ideas to resist until evidence supports them

- A public prompt marketplace before personal reuse works.
- Thousands of generic templates as a substitute for learning the user's actual instructions.
- Automatic task execution, prompt submission, or silent scope expansion.
- Treating all typing as a prompt or all repeated text as a global preference.
- A large graph/agent framework before simple versioned extraction and hybrid search prove insufficient.
- Training a custom model before retrieval, extraction, and feedback have been evaluated.

The guiding product question is: can the user recover a useful old instruction at the right moment, preserve its intended meaning, and type less with minimal interruption?
