# Dependency and distribution inventory - 0.3

The local service and UI have **no third-party production npm dependencies**. They rely on the user's Node runtime, operating system and browser. The existing package-lock is retained, with root version updated, rather than inventing newly resolved integrity hashes.

| Component | Configuration / observed | Verification status |
| --- | --- | --- |
| Node | Target 24.16+ within24.x; actual tests22.16.0 | Target install/matrix not run here; compatibility tested |
| TypeScript | Pinned7.0.2; installed checker5.8.3 used | `npm ci` of exact pinned dev graph not repeated here |
| @types/node | Pinned24.19.2 | Global compatibility typings used for offline check |
| undici-types | Transitive existing lockfile entry | Existing dev lock retained; not re-audited |
| Chromium | Observed144.0.7559.96 | Actual UI fixture scenarios only; not bundled |
| Python Playwright | Optional QA dependency, outside npm/runtime | Used for Chromium harness; install separately |
| Tauri | Manifest exactly2.11.5 | Official API reviewed, not compiled |
| tauri-build | Manifest exactly2.6.3 | Official version reviewed, not compiled |
| serde/serde_json | Native manifest1.x | Generate/review native lockfile and notices before release |

Historical AJV dependencies mentioned in M0 notes are no longer runtime package dependencies in the supplied v0.2/0.3 package. No new `npm audit` or native advisory sweep is claimed. An empty production npm dependency map is not an application security guarantee.

The source ZIP contains no Node executable, native WebView, Rust build products or installed npm dependencies. Desktop preparation stages a trusted local Node executable and requires its distribution LICENSE. All native/transitive/runtime licenses and notices must be reviewed for an installer. The original promteSaver source license is still unselected; `private:true` prevents accidental npm publication but is not a license choice.

No competitor code was copied in this increment. Production source performs no automatic dependency downloads, telemetry or external inference. Cargo/npm development installs require normal explicit network access and review.
