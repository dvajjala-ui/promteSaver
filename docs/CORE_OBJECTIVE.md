# Core objective

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Updated: 31 October 2026. Source reviewed: `cdc1259`. This is the current product objective; [Product direction](PRODUCT_DIRECTION.md) preserves the owner's original request and corrections.

## What we are building

Build a Windows desktop app that automatically remembers prompts from sources the user explicitly approves, keeps trustworthy local history, and helps the user reuse useful wording when similar work comes back. Windows comes first; macOS is a later platform milestone.

The user should be able to install one app, approve a supported source, work normally, and later find what they wrote with its source and time. Optional improvements must preserve meaning and the user's natural or mixed-language wording. The saved source, an editable copy, and any AI result stay separate.

The local library supports this experience. Manual saving and a localhost dashboard alone do not complete the objective. A mandatory unpacked extension is a developer setup route, not the intended normal customer onboarding.

## Intended daily workflow

1. Install and open the native app. Login startup is optional; capture starts only after visible source approval.
2. Work in a supported, approved prompt source. The app saves permitted text locally and explains coverage, exclusions and failures.
3. Inspect the saved snapshot, app/site, time and evidence quality. Keep draft observations distinct from verified submission evidence.
4. Review the day's prompts. Keep the source as saved; accept a separate improvement only if useful. A future daily AI review needs explicit processing consent, visible outgoing content, budgets and cancellation.
5. When similar work recurs, retrieve the original or a reviewed reusable block, understand why it appeared, and choose whether to copy or insert it. Never send or replace text automatically.
6. Pause, lock, revoke a source, delete history or restore a backup through understandable controls.

Steps 4 and 5 describe the full goal. Today, review is an explicit offline heuristic action and recall is an explicit local keyword search in the vault editor. Automatic daily AI review and suggestions inside other apps are not implemented.

## Current implementation versus the objective

| Area | Present in source / recorded evidence | Remaining gap |
| --- | --- | --- |
| Windows app | WinForms host, private Node service, tray, prompt-first home, source controls, search and copy | Latest source must be rebuilt and installed; clean-device lifecycle and long sessions are open |
| Setup | Unsigned per-user setup prototype and portable build scripts; an earlier setup passed an isolated install/self-test | The latest ValuePattern change has no newly produced bundled setup; normal install/uninstall/update and signing are open |
| Desktop capture | Approved writable UI Automation fields, changed-text debounce, encrypted `draft_snapshot`, separate editable copy | May save non-prompts; no send detector. Real third-party prompt editors, dictation and endurance need acceptance |
| Evidence | Earlier real Notepad typing/pause pilot; synthetic WPF typing/paste/exclusion/pause pilots on Windows; ValuePattern-only provider test | Synthetic controls do not certify arbitrary apps; the ValuePattern result is not an end-to-end vault-save result |
| Browser capture | Optional helper for known ChatGPT/Claude/Gemini composers, write-only pairing and per-site permission | Human-granted installed-helper capture on real sites remains unverified |
| Local memory | Encrypted payloads, library, search, history, Trash, backups, bounded retention review and explicit related-prompt recall | Whole SQLite database/WAL encryption, large-backup streaming and measured whole-app budgets remain open |
| Review and reuse | Explicit offline wording checks; reviewed Groq actions; two-stage source understanding/quote extraction; scoped editable templates | Live-provider quality, durable learned patterns, daily AI jobs, native picker and contextual cross-app suggestions remain open |
| Other platforms/services | Source/browser fallback and experimental Tauri source | No verified macOS app, mobile app, account service or cloud sync |

The [readiness matrix](READINESS_V0_9.md) owns detailed feature status. The [test report](TEST_REPORT_V0_9.md) owns dated observations. Code, tests, browser fixtures, real-site pilots and installed artifacts must be reported separately.

## Product boundaries

- Capture is off until the unlocked user approves a source. Unknown/private/protected fields are excluded before reading. No archive of arbitrary keystrokes, clipboard polling, screen/audio capture or hidden uploads.
- Current desktop approval is keyed by executable name, with foreground checks; it is not a verified publisher identity or unique process authorization. That limitation needs review before broader source claims.
- `draft_snapshot` means observed draft text, possibly redacted. It does not prove submission, delivery or a byte-for-byte original. Desktop fields can contain non-prompt text.
- AI is optional and off by default. Every current cloud request needs a matching preview and fresh consent. Capturing, typing or opening the app must not trigger cloud inference.
- Pause, lock and Quit stop capture. Source approval is not restored after lock/restart. Login startup opens the locked app; an all-day continuation policy is still a design and acceptance task.
- Offline capture, history and lookup must remain usable without a model, account or cloud service. Resource targets require measurement on actual hardware.

## Next work, in order

1. Bound slow Windows accessibility providers away from the UI thread; address ValuePattern's unbounded getter and executable-name identity limitations.
2. Rebuild the latest source, then prove one useful third-party desktop prompt workflow with explicit approval: edits, paste, exclusions, pause, lock, restart, gaps and recovery. Add submission evidence only when the source exposes a trustworthy signal.
3. Validate ordinary Windows setup, Start Menu, uninstall/data retention, reinstall and login behavior on a disposable account and clean device. Complete license, signing, accessibility and whole-app resource review before public distribution.
4. Prove that saved history helps users complete recurring tasks faster. Then finish optional daily review, durable source-derived records and a safe native reuse picker.
5. Expand supported sources, then macOS; evaluate optional sync, mobile and local models after the Windows loop proves useful.

See [Next sprints](NEXT_SPRINTS.md) for engineering acceptance and [Product backlog](PRODUCT_BACKLOG.md) for the complete inventory.

## Decisive product milestone

A consenting Windows user installs the current build, approves one supported real prompt source, repeatedly gets accurate local history with working exclusions and stop controls, and later reuses that history with less effort than their current workflow. Repeat over several sessions, including restart and recovery, and record failures as well as successes.

Proposed measures are capture misses, prohibited captures, useful top results, edits required, time to reuse, interruptions and continued voluntary use. These are evaluation measures, not achieved metrics. Passing tests or compiling an EXE does not close this milestone.
