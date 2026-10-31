# Dependency and distribution inventory

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Updated: 31 October 2026; checked against the current manifests and build source. This refresh did not install packages, audit registries or resolve a new native dependency graph.

The service has no third-party production npm dependencies. That does not mean the desktop product has no runtime, operating-system or license obligations.

| Component | Current source / recorded use | Limit |
| --- | --- | --- |
| Node | Supported `>=24.16.0 <25`; current shell is 24.18.0; earlier preview bundled 24.16.0 | Package the trusted matching architecture and full distribution license; whole-app cost remains unmeasured |
| TypeScript / Node types | Pinned dev dependencies 7.0.2 / 24.19.2 in package.json | Development tooling, not production npm dependencies; use the lockfile |
| Windows UI | WinForms, .NET Framework 4.7.2+, Windows UI Automation, CurrentUser DPAPI | OS-supplied framework; actual clean-device compatibility and publisher signing remain open |
| SQLite / crypto | Node built-ins; AES-GCM encrypted record payloads and bounded scrypt wrapping | Not whole-database/WAL encryption or an independent crypto audit |
| Browser helper | MV3 source, optional per-site permission and write-only loopback bridge | Separately loaded developer extension; no browser-store or real-site acceptance |
| Chromium / Python Playwright | Optional development QA tools; historical versions belong to their dated reports | Not bundled app dependencies; no fresh browser run is implied |
| Tauri / tauri-build | Experimental manifest versions 2.11.5 / 2.6.3 and checked-in real Cargo.lock | Separate from the current WinForms host; last recorded Windows Cargo check failed on missing SDK kernel32.lib |
| Groq | Explicit fixed-endpoint HTTP integration using built-in fetch, no provider SDK | Key remains local; each request requires preview/consent; no live-provider quality or availability result |

Generated runtime staging, EXEs, setup packages and local tooling live under ignored paths. A fresh checkout contains source/build scripts, not the earlier tested binaries or real vaults. Runtime manifests detect accidental changes relative to a matching manifest; they do not establish authenticity if both are replaced.

Before distribution, review the original-source license, complete runtime/framework/dependency notices, exact Cargo graph where used, security advisories, build identities, signing and update integrity. The original-source license remains unselected; `private: true` is not a license. No new advisory or license audit is claimed here.
