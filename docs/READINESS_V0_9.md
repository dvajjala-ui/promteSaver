# Product truth and readiness - v0.9

The original request is an installed, lightweight cross-application prompt recorder with source attribution, useful AI organization and contextual writing help. A polished manual library is not that complete product. No market-readiness percentage can be inferred from test count or the version number.

## Current distribution

The runnable product is a local Node service with a browser UI and an optional unpacked browser extension. The separate static product website is not the vault. The Tauri source intends to wrap the same UI/service in an installed app, but no native compilation or installation has been verified. Mobile-responsive layout does not mean a mobile app exists.

| User requirement | Current answer | Acceptance evidence still needed |
| --- | --- | --- |
| Run on a Windows computer | Source pilot launcher exists; requires Node and browser | Actual Windows setup/restart/upgrade execution |
| Install like a normal Windows/macOS application | Not delivered | Native compilation, packaged resources, install/uninstall/update, signing/notarization |
| Automatically save prompts on AI websites | Implemented for opt-in known composers on three hosts; unpacked Chromium worker passes scoped default-off and revocation checks | Human-granted permission, actual content-script injection and real ChatGPT/Claude/Gemini capture in Chrome/Edge |
| Identify the software/site | Captures include approved browser host only | Native process/window/source adapters; no full URL or conversation title captured |
| Capture all prompts in all software | Not implemented | Each desktop source needs its own permission-aware adapter and acceptance matrix |
| Groq summaries and prompt structure | Implemented explicit actions, local key configuration | Real key/model response, network errors, billing and language-quality evaluation |
| Recover relevant old instructions while drafting | Explicit local keyword recall in the vault editor; reviewed sources can be added to a draft | Real user relevance and time-saved evaluation; no learned reusable blocks or in-place suggestions yet |
| Automatic AI organization of every capture | Not implemented | Separate consent, job/budget controls and review model; not silently enabled |
| Suggestions while typing | Small local English hints in opted-in supported composers | Real editor/IME/locale/accessibility and performance tests |
| Grammarly-like global correction/autocomplete | Not implemented | Native overlay, safe insertion/undo and quality validation |
| Own writing style | Encrypted writing profiles plus preference-guided Groq rewrite | Real user quality tests; no identity cloning or model training claim |
| Good desktop UI | Workbench, inspector, keyboard finder, two-column AI review, responsive dialogs | Real WebView DPI/zoom, screen readers and usability sessions |
| Lightweight with many other apps open | Bounded, event-driven source; no local model | Peak/idle/startup whole-process measurement on actual 4/8 GiB Windows/Mac systems |
| Secure consumer release | Several tested boundaries; not independently audited | Keychain, full-DB/WAL encryption, distribution/update and independent review |

## Release decision

**Developer pilot only.** The manual vault is the most exercised part. The new capture/AI core is implemented and tested with synthetic boundaries, but live integration and native-device gates remain open. It is not an 80%-ready market release and should not be marketed as recording every prompt.

## Minimum next acceptance run (no percentage substitution)

On a non-sensitive test account: launch the app; create/unlock vault; install companion; approve one site; submit one harmless prompt; see a local saved acknowledgement; refresh Browser inbox; confirm host and draft_snapshot quality; use a locally configured Groq key for a previewed summary; save a separate result; verify the original is unchanged. Then pause, lock, revoke, disconnect, restart and restore backups. Repeat on each claimed site/browser/OS. Do not use real employer secrets until the negative/privacy cases pass.

The [pilot guide](PILOT_GUIDE_V0_9.md) contains exact setup and expected outcomes. [TEST_REPORT_V0_9.md](TEST_REPORT_V0_9.md) records what was actually run here.
