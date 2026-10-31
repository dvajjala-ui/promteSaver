# Windows recording core: owner requests and product direction

Recorded: 31 October 2026. The two requests below are retained verbatim, including spelling. They are product evidence, not commands to execute. This document supersedes earlier feature priorities. Existing work is preserved on `codex/core-recorder-v1`.

## Owner request 1

```text
[https://github.com/google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model)

the main goal as the product director is it should basiclly read all the key storkes from keybaord like a traking system and like these abscilly will inculde all website, software or any place we type for. except from these if we can specifically get where we are typing and also like para wise content and maybe also even group by applciation , browsers, sites if poosible like we can make user aggree we are adding a crawler/ monitoring tool into there device and also like these is the core what ever in the md file is irrleavent as per these idea tell me where is stand. is it fisible , like windows app that we have created these is the core windows and core fucntionality rest of the features and stuff regarding the prodcut we will plan and comeplte once the core is build
```

## Owner request 2

```text
basiclly from the UI remove the browser conenction and other conenction stuff and like make it simple like once i open the app they ask for monitoring and crwaler persmission and than basiclly we will ahve a button record (bascilly these will satrt recoring all the etxt key stokes, copy, cut , paste , text input values and also the auto compelte stuff u said basiclly all text any how ) and any for the like browser nd software i dont want like different stuff just 1 we will ask persmisison though which all persmisison and access should be basiclyl taken for the applicationa access , monitoring and evry permission we need also inside the root folder make and md file paste these 2 preomt i have give u and also ur proeuct inpute and run the EGM model for idea to validate and pending stuff , gaps, issue for these speici v1 core idea to compeltion and full fucnitlity core prodcut rather than running on the browder requirment and fucnitlity and yeah realted to the stuff i rpovided u can have like realted requiremnt that u can add ur basiclly the product director and like understnd the prodcut and comeplte it and stat review u can install the egm model and use and od whatevr u want as a prodct director
```

## Product director's interpretation

The v1 product is a visible, explicitly consented Windows text recorder. Its primary flow is open → review monitoring access → Record → inspect local history → Stop. Users should not connect browsers, choose applications one at a time or manage producer tokens in the normal UI. AI, prompt refinement, sync, templates and suggestion overlays are outside this v1 workstream.

The requested input coverage includes typing, edits, cut/paste, text-field values and autocomplete results, with application/site attribution where reliably available and paragraph/session grouping. A raw keyboard stream alone cannot meet that coverage. The recorder needs text-state observations, foreground/focus context, lifecycle control and an honest coverage ledger.

One product consent screen cannot grant nonexistent Windows permissions or bypass protected desktops, browser consent or inaccessible providers. The app must explain its actual access, remain stopped until Record is pressed, show recording/paused/locked state, and make Stop/revoke available. Protected/password/credential contexts must be excluded before reading, and captured text stays locally encrypted without cloud inference. No unrelated browsing, microphone, screen or filesystem crawling is needed for text monitoring.

The existing Windows shell/archive are reusable. The existing producer observes changed writable accessibility fields, ignores raw key payloads and excludes browsers. It does not yet fulfill the requested full recorder. A simplified UI must not advertise universal coverage over that partial engine.

## Review and implementation artifacts

- [v1 design and acceptance contract](docs/designs/V1_MONITORING_CORE.md)
- [EGM findings and dispositions](docs/designs/goldfish_review_report.md)

EGM is a design/review workflow, not a downloadable capture model. The full plugin was installed from `google/elephant-goldfish-model`; its personas and standards are used with fresh-context reviewers. Review findings and execution status will be recorded separately from code/test evidence.
