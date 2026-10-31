# UX principles and usability checklist

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Updated: 31 October 2026. The [core objective](CORE_OBJECTIVE.md) is the default Windows experience: approve a supported source, remember permitted prompts, review history and reuse useful wording.

## Primary Windows experience

- First run: create/open the Windows-protected vault, explain supported sources and exclusions, then request source approval. No account, mandatory cloud AI, terminal command or unpacked extension is the target customer journey.
- Home: saved snapshots with app/site, time and honest draft quality; full selected text, search, Copy, source setup, visible state, Pause and Lock.
- Explain that approved desktop fields may save non-prompts. Existing text is only a baseline; changed text can be saved after the debounce. No desktop send proof is implied.
- Closing the window keeps the tray app running; Quit stops its owned service. Start with Windows is optional and launches locked. Approval does not silently return after lock/restart.
- Keep privacy, deletion and recovery discoverable. Browser pairing, the older Notepad pilot, wording review and startup are secondary More options controls.
- Distinguish implemented optional tools from planned daily AI review and cross-app suggestions. The vault's broader library/Writing Studio/AI UI supports the core loop rather than defining the main onboarding.

## Review and reuse

Keep the saved snapshot separate from an editable library copy and any AI output. Show source, method, date, quality and gaps. A failed acknowledgement is unconfirmed, not proof that no save occurred. Unknown editors may produce no gap receipt at all.

Explicit related-prompt recall shows keyword matches and source/project context. Users choose exact copy or an editable draft copy; choosing a result never submits it. Worked/not-useful feedback is user judgment; only Hidden currently suppresses a revision. Do not label this learned preference inference.

Offline Review wording runs only when requested and checks limited spacing, repetition and punctuation rules. Cloud tools need an outgoing preview and fresh approval. Future daily review must preserve the source and voice; future insertion must verify the current editor, allow undo and never send automatically.

## Source/browser fallback

The broader browser UI retains manual library entry, pins, templates, projects, history, Trash, writing profiles and explicit AI tools. It uses a passphrase vault distinct from the Windows DPAPI vault. Browser shortcuts and responsive layouts are not proof of equivalent native shortcuts, macOS behavior or a mobile app.

Use semantic controls, visible labels/focus, clear errors and honest copy/save acknowledgements. Keep paginated views and bounded hydration; no remote fonts, required framework, animation loops or hidden model. Preserve the established browser palette and tokens in [DESIGN_SYSTEM_V0_7.md](DESIGN_SYSTEM_V0_7.md) unless visual changes are separately requested.

## Acceptance still needed

Run keyboard-only, NVDA, high DPI, 200% zoom, narrow-window, focus restoration and consent/recovery sessions on the native Windows build. Measure responsive Pause/Lock/Quit with a slow accessibility provider. Browser fixtures and a synthetic native screenshot do not prove screen-reader conformance or real-device usability. macOS/VoiceOver is a later platform gate.

In a consented recurring-workflow pilot, ask users to install/open, approve a source, capture harmless text, inspect provenance, recover an old instruction, copy/reuse it, pause/lock and explain what is excluded. Record completion time, edits, misses, false suggestions and trust concerns without background telemetry. The pilot and targets are proposed, not completed research.
