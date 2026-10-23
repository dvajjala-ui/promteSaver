# promteSaver v0.7 verification

- **Node unit and integration:** 96/96 passed on the available Linux Node 22.16 TypeScript stripping compatibility path (`node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs`).
- **Actual Chromium interface with mocked API:** 17/17 scenarios passed (`python scripts/browser-smoke.py --mode fixture`). Includes inspector, list/card layout, focus mode, Writing Studio, responsiveness, encrypted drafts, and lock clearing.
- **Static site:** product website source and screenshots included; this is not a deployed or production-verified public site.
- **TypeScript target toolchain:** not verified; this container lacks pinned Node 24/TypeScript 7 and Node type definition package. No claim of a clean pinned build.
- **Native Windows/macOS installer:** not built or tested, source-only Tauri wrapper. OS keychain, full-file SQLite encryption and cross-app capture remain open.
- **Real browser-to-backend E2E:** cannot be verified in this environment because browser localhost navigation was administratively blocked. HTTP API and browser UI were tested separately.
- **Production performance:** not measured in this sprint; no RAM or startup improvement claim.

Evidence: `docs/verification/browser-v0.7/`, `docs/RELEASE_NOTES_V0_7.md`.
