# promteSaver 0.7 — Workbench design beta

Preserves v0.6 local encryption, Writing Studio, templates, manual capture helper and backups. Adds a redesigned dark desktop-oriented workbench, selectable on-demand prompt inspector, list/card switch, focus mode, responsive settings entry, Writing Studio stage navigation, and a static marketing/preview website in `apps/site`.

The workbench does not upload data or introduce cloud APIs. The inspector requests a complete prompt only when deliberately selected, and clears its plaintext on vault lock. The existing v0.6 encrypted storage formats are unchanged. A native Tauri source wrapper exists but **no signed, verified Windows/macOS installer** is bundled.

UI patterns were informed by professional navigator/canvas/inspector applications, but all UI code is independently authored. The static website is a visual preview and not deployed. No user secrets, API key, DB account, or third-party SaaS integration is required for this sprint.

The code was tested in Node 22.16 compatibility mode and Chromium with mocked APIs. Native OS integration, pinned Node 24/TypeScript build, OS keychain/whole-database encryption, full grammar model, true AI rewriting, cross-app overlays, sign-in/cloud sync, native installation, signing and real 4-GiB system profiling remain open.
