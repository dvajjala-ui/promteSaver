# v0.8 resource and responsiveness evidence

> **Documentation scope (31 October 2026): Version-specific reference.** Apply the stated version and component scope. Current Windows setup, vault recovery and product priorities are described in the current guides. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

Measured 2026-10-23 in this Linux x64 development container, Node v22.16.0. Synthetic data only. These are development observations, not service-level guarantees or native installer benchmarks.

## Password work: same cryptography, responsive event loop

`node --experimental-strip-types scripts/bench-responsiveness.ts`

One warm-up, then three alternating synchronous/async derivations. Both use scrypt N=32768, r=8, p=3 with the same 64 MiB maximum allocation setting. A 10 ms interval records observed gaps.

| Median across three rounds | Synchronous API | Async API |
| --- | ---: | ---: |
| Password derivation wall time | 297.45 ms | 307.12 ms |
| Maximum observed timer gap per round | 307.50 ms | 10.86 ms |

The result supports responsiveness during this operation, not faster key derivation. Async crypto uses native threadpool work; CPU and temporary allocation still exist. A single gate prevents application-level overlap rather than lowering the KDF work factor. Native cancellation cannot preempt a job that has started.

## Full-library search, 10,000 records

Commands: the same `scripts/bench-reliability.ts 10000` from the v0.7 archive and v0.8 tree, on this host. Each run seeds synthetic ~600-character records, performs ten distinct queries, twenty identical-query cache samples, a deep page, low-memory queries and a facet pass.

| Sampled metric | v0.7 baseline | v0.8 |
| --- | ---: | ---: |
| Median distinct-query cache miss | 259.58 ms | 225.48 ms |
| Median identical-query cache hit | 2.00 ms | 1.53 ms |
| Deep-page query, single sample | 263.33 ms | 239.87 ms |
| Low-memory cold query, single sample | 203.88 ms | 205.39 ms |
| Low-memory warm median | 0.59 ms | 0.67 ms |
| Sampled Node RSS | 114.26 MiB | 115.75 MiB |
| Sampled Node JS heap | 36.81 MiB | 33.70 MiB |

These are separate process runs, not controlled hardware statistics. Do not attribute every difference to the heap change: encryption, scheduling, JIT and allocation dominate much of the run. Some metrics regressed slightly. No overall memory reduction is established. Node RSS is not peak RSS, heap is not total memory, and browser/WebView processes are additional.

The v0.7 benchmark script accidentally reports `version: 0.4.0`; its untouched raw output is retained and identified as v0.7 by the source ZIP. v0.8 fixes the script to read the shared application version. Historical v0.3-v0.6 numbers were collected in different runs and should not be used for a cross-machine trend claim.

## Complexity improvement, not an indexed-search claim

The bounded heap avoids O(K) sorted-array shifts for each competitive candidate. Retained candidate count is still at most offset+limit and text scans still decrypt O(N) records. Deep offsets can therefore retain many IDs. The small result cache is bounded and respects low-memory mode; no persistent plaintext search index was added.

## Remaining performance gates

- Actual process-tree peak/idle RSS, CPU, startup and resume on 4 GiB and 8 GiB Windows/macOS machines with other applications open.
- Native WebView2/WKWebView plus bundled service; headless Chromium fixtures are not substitutes.
- 50k histories/large text, slow disks, battery load, sleep/resume and repeated lock/backup runs.
- Streaming backups beyond the existing 12 MiB portable limit.
- Measured design for encrypted indexed search and/or a Rust service, without weakening privacy boundaries.

Raw JSON: `verification/v0.8/responsiveness.json`, `search-v0.8.json`, `search-v0.7-baseline.json`. UI device-health screenshots contain explicitly synthetic figures and are not benchmark evidence.
