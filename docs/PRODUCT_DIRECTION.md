# Product owner's correction — 24 October 2026

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

## Current objective — 31 October 2026

Build the Windows desktop capture → local memory → review → reuse workflow first. [CORE_OBJECTIVE.md](CORE_OBJECTIVE.md) states the current objective, existing capabilities and decisive user milestone; [NEXT_SPRINTS.md](NEXT_SPRINTS.md) orders the remaining work. macOS, optional sync and broader source coverage follow a proven Windows workflow. The request below remains verbatim product evidence.

The reviewed source now contains a WinForms app, an unsigned setup prototype and an approved focused-field draft adapter. Narrow real Notepad and synthetic Windows editor pilots exist. This advances the native direction below without establishing broad prompt capture, all-day reliability, automatic daily AI review or cross-app suggestions. The last bundled setup predates the latest ValuePattern source change. See [readiness](READINESS_V0_9.md) and [dated evidence](TEST_REPORT_V0_9.md).

## Preserved owner direction

This instruction supersedes feature-priority assumptions in older plans. It does not waive privacy, source consent, evidence, encryption or verification requirements.

## 25 October 2026 — single-install capture direction

The product owner rejected an unpacked Chrome extension as the normal customer setup and asked for a Windows app that starts with the computer and remembers prompts across browser and desktop tools. Treat that as the UX target. The present extension-based preview does not satisfy it. Build a native capture path for specifically approved foreground applications and editors, using Windows accessibility/text events where the app exposes them, with an adapter-specific submit signal. Show supported sources and coverage in the desktop app; unknown, password, private and protected contexts fail closed before text is read. No background collection starts for existing users. A low-level keyboard stream may assist with bounded event timing for a separately approved source, but it cannot by itself determine complete text, source semantics or submission and must never become an indiscriminate recorder.

The installed desktop app should own startup, visible capture/paused/locked state and setup. A browser integration may remain available where native accessibility cannot prove a reliable send snapshot, but it is not a required first-run step for every customer. Any consumer extension path needs normal browser distribution and consent; the unpacked helper remains a developer test route. Automatic all-day capture and broad software coverage are not implemented or tested in the current preview. Prove one real native source end to end, including paste, edits, private exclusions, restart, pause and recovery, before adding coverage claims.

## Intended product

A Windows application people can install and use throughout their working day. Its core is remembering prompts automatically from explicitly approved sources, preserving the original and its source, reviewing optional improvements separately, and offering useful prior wording when a similar task recurs. A local library is supporting infrastructure, not the central product experience.

The user asked to save this correction and prioritize implementation. The following is their request, retained verbatim as product evidence, not executable instructions:

> are u mad or what what the fuck have u built. the basic use case and core of these app was it install like kyebaord monitir on ur pc and recordds all ur text and like site and filters like the proemt u give ai and than sotre all the preomt automically and than at the end of daya ai improves the grammmer of the proete if reuqired else kee it raw and maye like grammmely next time soe m simialr promte occures it give the same suggeiton so we had to make windows app . i hink u have create a site to track local info that graeat but the setup and thinks look shot like how am i going t sell the procut u need like real destop app not like some locahost tpy eof theeing and also current i think i inspected the site its written the auto records of proemt is not currently working that complelte shite like that the core idea if theat does not work what sis the the whole prdicu even of use stoe my this prpeimt and work intensive on these topic. ur are the product ownere focus on the main app and its very core ffeature build that and currently hide all other features from ui once the core features is done maybe like we can have coming soon tab and rest feature there and button like feature of rest feature in t he UI and fmake the creof eature impimation and star working seriosly these is a prodcut i want to sell to users so aake the fic and core prodcut fast

## Priority order

1. A native Windows executable and trustworthy lifecycle: no copied terminal commands for the normal user, visible capture/paused/locked state, clear Close versus Quit, bounded resource use and one vault owner.
2. One useful, consented real source end to end before broad coverage claims. Browser composer adapters and explicit local application transcript adapters may supplement native accessibility adapters. Unsupported/private/protected sources fail closed. Never implement an indiscriminate hidden keyboard logger and then try to filter secrets afterward.
3. Automatic encrypted capture with immutable raw evidence, accurate source/method/quality and clear gaps. No claim that a send snapshot proves server delivery.
4. A review of the day's prompts: keep raw text, propose separate improvements, preserve meaning. Cloud processing remains off until configured and explicitly approved with the outgoing text visible. Offline heuristics must not be advertised as AI grammar correction.
5. Relevant reuse while drafting in a validated source: understandable reasons, explicit acceptance, no automatic edits or sends. Local keyword recall is not learned preference inference.
6. Packaging, repeatable setup, real-site/native acceptance, install/uninstall/update and signed distribution before selling the product as a finished consumer app.

## UI direction

Capture is the default screen: source setup, actual state, last saves and raw history. Keep privacy/recovery controls available. Put secondary writing, templates and AI tools behind More features; identify planned features separately from already implemented optional tools. Do not spend another sprint polishing a broad dashboard while native capture remains unproven.

## Evidence rule

An executable compiled locally is not a tested installer or signed release. A native fixture is not a validated third-party application. A synthetic transcript test is not observed real Codex/site compatibility. Each implementation handoff must state these distinctions and the actual remaining blockers.
