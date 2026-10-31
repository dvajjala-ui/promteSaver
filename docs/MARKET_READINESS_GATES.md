# Market readiness gates

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Updated: 31 October 2026. **Windows developer pilot only.** The target is the [capture → memory → review → reuse workflow](CORE_OBJECTIVE.md). The local library, source tests and compiled native preview are useful progress; there is no completed consumer release or measured market-readiness percentage.

## Current gates

| Gate | Recorded evidence / implementation | Required before closing the gate |
| --- | --- | --- |
| Current Windows artifact | WinForms source compiled; earlier bundled preview/self-tests and setup prototype exist | Rebuild the latest ValuePattern source; bind install and lifecycle results to that exact artifact. The last bundle attempt stopped at a running EXE lock. |
| Normal customer setup | Earlier setup passed an isolated temporary install and installed-path synthetic self-test | Ordinary setup UI, Start Menu, uninstall/data retention, reinstall/update and clean-device validation; license review and signing. A source checkout contains no generated EXE. |
| Useful automatic desktop capture | Real Notepad typing/pause pilot; synthetic WPF typing/paste/baseline/exclusion/pause pilots; ValuePattern-only provider read test | Repeated real prompt-editor workflows, protected/private negatives, paste/IME/dictation as claimed, fast sends, gaps and recovery. Current field snapshots have no submission proof and can contain non-prompts. |
| Responsive capture and identity | Event-triggered reads, source checks, bounds and explicit approval | Bound slow UIA providers off the UI thread, address ValuePattern allocation and executable-name consent limits; prove Pause/Lock/Quit remain responsive. |
| Stop/start lifecycle | Source off by default; pause/lock/Quit revoke; login launch option starts locked | Real login/reboot, sleep/resume, prolonged tray use and a separately reviewed continuation policy. No all-day/resume claim today. |
| Browser integration | Known-composer source/fixtures and scoped real unpacked-worker checks | Human-granted permission and actual helper capture on each claimed site/browser; record denial, revoke, private modes and changed layouts. No live-site result is established. |
| Review and reuse value | Offline wording checks, explicit local keyword recall, separately reviewed AI/extraction source | Consented user evidence of useful retrieval, preserved meaning, less retyping and low interruption. Daily AI review and cross-app suggestions are not implemented. |
| Data protection and recovery | AES-GCM payloads, wrapped archive key, Windows CurrentUser DPAPI, backup/tombstone tests | Independent review, full-DB/WAL protection, lost-key/cross-account and legacy migration paths, interruption and restore drills. Metadata remains visible. |
| Resources and accessibility | Bounded service/DOM work and separate synthetic Node/browser samples | Whole-process startup/idle/peak CPU/RSS on real 4/8 GiB hardware; keyboard, screen-reader, DPI and zoom acceptance. |
| Distribution and operations | Portable/setup source and consistency manifests | Signing, update/rollback, dependency notices, original-source license and support/deletion policy. Hashes are not signatures. No cloud service exists. |
| Other platforms | Experimental Tauri source and source/browser fallback | Real macOS build, Keychain/permissions/lifecycle and device acceptance. No native Mac or mobile app is established. |

## Decisive user validation

A user installs the current Windows build, approves one real supported source, gets reliable history and stop controls across several sessions, and later reuses that history with less effort. Record misses, incorrect captures, task time, edits and continued voluntary use with consent. Test totals cannot substitute for this result.

The detailed [readiness matrix](READINESS_V0_9.md), [pilot guide](PILOT_GUIDE_V0_9.md) and [dated test report](TEST_REPORT_V0_9.md) remain separate. Earlier v0.8 release gates are preserved in the versioned architecture, release and verification records listed in the [documentation index](DOCUMENTATION_INDEX.md); they are not the current priority order.
