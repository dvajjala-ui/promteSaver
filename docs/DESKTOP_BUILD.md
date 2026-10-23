# Experimental native desktop host: build and acceptance (v0.9)

**Status: source foundation only. No native build completed in this environment.** Node child lifecycle tests and synthetic staging checks do not establish that Rust, bundled resources, WebView behavior or installers work. Keep using the local browser launcher for the runnable beta.

## Architecture

One Tauri system WebView opens the authenticated loopback interface from a fixed bundled Node child. It does not create a second storage implementation. Node still consumes memory/disk; no whole-app RAM advantage is asserted before measurement.

The source host has no frontend shell/filesystem IPC, uses fixed executable/script paths, validates the readiness URL, restricts navigation to that exact loopback origin, denies extra windows and requests shutdown on exit. The parent protocol, EOF shutdown and single-vault lease are Node-tested. OS-native lifecycle events remain unverified.

## Prerequisites on your build machine

Build on the destination OS/architecture with matching Node and Rust targets. Do not stage an Intel Node binary into an ARM app. The scripts refuse cross-target staging.

Install trusted Node 24.16+ within 24.x, Rust and the platform-native prerequisites listed in Tauri's guide. The preview workflow pins `tauri-cli` 2.11.2 (development tooling, not a production application dependency). Retain the **LICENSE from the exact Node distribution** you will bundle. Windows needs its C++ build tools/WebView prerequisites; macOS needs its Xcode tooling. Review upstream requirements rather than disabling OS protection warnings.

## Check and plan

```sh
npm ci --ignore-scripts
npm run check
npm run desktop:plan
```

The plan has no download/write side effects. It reports whether the current Node runtime can actually be bundled. A compatibility-mode plan is not a successful stage.

## Explicit staging and verification

```sh
node scripts/prepare-desktop.mjs --node-license "/path/to/exact-node-distribution/LICENSE"
npm run desktop:verify
```

When omitted, the license option checks the exact runtime archive's usual adjacent LICENSE locations; missing notices stop the build, not trigger an unverified download. Preparation copies only selected source roots and a reviewed JSON allowlist, streams hashes, emits manifest v2 and verifies every staged file. It rejects traversing/symlink paths, accidental vault artifacts and version drift. No vaults, private keys, fixtures or test data are intentionally selected. Review source for embedded secrets separately.

Hashes prove consistency relative to the manifest, **not authenticity if both manifest and files are replaced**. The manifest is not a signature or installed runtime integrity mechanism. Generated runtime/binaries stay out of Git and are not included in the source ZIP.

## First developer preview

No Cargo.lock has been fabricated. The first native resolution requires an explicit flag:

```sh
npm run desktop:build -- --resolve-lockfile --node-license "/path/to/exact-node-distribution/LICENSE"
```

This script checks source versions, verifies Cargo/CLI availability, resolves a missing lockfile, stages/verifies the local runtime, runs `cargo test --locked`, then attempts an NSIS bundle on Windows, DMG on macOS or DEB on Linux. It never silently installs a tool or publishes a release. Building dependencies does require network access when their caches are empty.

Review the generated `apps/desktop/src-tauri/Cargo.lock`, licenses and advisories, commit it, and omit `--resolve-lockfile` for subsequent builds. The Tauri crate is pinned to 2.11.5 and tauri-build to 2.6.3; a compatible, resolved transitive graph is still required. Resolve actual native errors before calling this app distributable. Rust stable and action tags in the preview workflow are not a fully frozen production supply chain.

The dev-server path is not wired to ordinary `cargo run`; the current host expects resources in packaged app locations. This is an **installed-package** acceptance target, not a promise that every Tauri development mode works.

## Optional manual GitHub workflow

After you manually publish this source to your own repository, select **Actions -> Manual unsigned desktop preview -> Run workflow**. This is an alternative to running the native build on your computer, not a GitHub action executed from this chat.

The workflow is manual-only, has `contents: read`, does not persist checkout credentials, and has Windows/macOS jobs. It checks the intended Node toolchain, attempts native compilation, retains actual Cargo.lock/manifest evidence and uploads successful bundles as short-lived workflow artifacts. Artifacts follow repository access controls; **they are not guaranteed private in a public repository**. No public Release/tag or automatic updater is created.

macOS is configured for ad-hoc signing (`-`), not a trusted Apple identity or notarization. Windows has no publisher signing certificate. Do not call these trusted consumer installers. The workflow has not been executed here; native compilation and package discovery may reveal additional work.

## Acceptance before public distribution

- Review/freeze dependencies, source licensing, transitive notices and build identities.
- Compile Rust tests; install the real bundle on every claimed architecture.
- Verify bundled Node, resource paths, terminal suppression, private URL handling and no public listener.
- Exercise dialogs, clipboard, backups/downloads, keyboard shortcuts, DPI/zoom and screen readers.
- Prove last-window close, parent crash, logout, sleep/resume and duplicate launch preserve data and stop/lock the service.
- Verify Host/Origin/CSP and absence of native IPC escalation in the actual WebView.
- Evaluate OS key protection and database/WAL encryption against an explicit threat model.
- Measure whole-process-tree memory/startup/idle CPU on low-spec machines with other apps open.
- Sign/notarize, validate upgrade/uninstall/data retention and audit distribution/update integrity.

## Primary references

- Native prerequisites: https://v2.tauri.app/start/prerequisites/
- External binary target naming: https://v2.tauri.app/develop/sidecar/
- Resource/bundle configuration: https://v2.tauri.app/reference/config/
- Official build workflow/signing notes: https://v2.tauri.app/distribute/pipelines/github/
- Preview CLI release: https://v2.tauri.app/release/tauri-cli/v2.11.2/

## v0.9 note

New AI and browser-capture server modules are included by the runtime source plan. This was checked as a plan on Node 22, not staged into a native binary. The browser extension remains a separately loaded source component. No native OS capture or global popup was added by these server/extension changes.
