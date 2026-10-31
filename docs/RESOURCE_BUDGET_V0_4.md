# Resource profile and hardware acceptance — v0.4

> **Documentation scope (31 October 2026): Version-specific reference.** Apply the stated version and component scope. Current Windows setup, vault recovery and product priorities are described in the current guides. [Core objective](CORE_OBJECTIVE.md) | [Documentation index](DOCUMENTATION_INDEX.md)

## Goal

Smooth manual save/search/reuse on 4–8 GiB Windows PCs and base-memory macOS machines **with many other applications running**. This is an unverified acceptance target, not a supported-hardware claim. No background recording or local AI model is required. Low-memory settings should be useful without installing a second browser engine.

## Local measurements: 22 October 2026

| Workload | Result | Critical boundary |
| --- | --- | --- |
| Isolated Node process, 300 synthetic prompts | 171 ms readiness, 237 ms setup/KDF, 102 MiB idle RSS, 0% sampled idle CPU for 3s | Not whole app; Node 22.16 Linux compatibility |
| Same harness on unchanged v0.3 | 152 ms readiness, 233 ms setup, 98 MiB idle RSS | Cross-run variance; **no memory regression or gain conclusively established** |
| v0.4 backend: 10,000 prompts | Distinct-query median 132 ms, p95 182 ms; cached-query median 0.60 ms; 115 MiB sampled RSS | 10 synthetic distinct misses, one Linux run; Node only |
| Chromium fixture, 2,000 records, 4x CPU throttling, low-memory | 20 cards; 3.55 MiB JS heap, 547 MiB process tree RSS; median measured input-to-settle 412 ms | Browser UI with mock backend; includes fixed 360 ms wait and 240 ms search debounce |
| Chromium fixture, 2,000 records, 4x CPU throttling, normal | 40 cards; 5.44 MiB JS heap, 562 MiB process tree RSS; median input-to-settle 437 ms | Different renderer workload; not a native WebView2 measurement |
| Chromium idle after resetting throttling | ~1.5–2.5% of one core in sampled runs | Two-second, non-representative headless sample |

The headless Chromium tree can exceed **500 MiB** in this environment, before adding the Node service. Do not present 'lightweight Tauri' as proven lower-memory until the same workflow is profiled in installed **Windows WebView2 and macOS WKWebView** packages. JS heap is only one subset of the browser's memory; memory size from one sample is neither peak nor a RAM requirement.

## Reproduction (developer-only tools)

Use a trusted Node **24.16.x**, Python 3.12+ with `psutil` and, for Chromium, `playwright` plus a separately installed Chromium browser. The production application **does not need Python, Playwright or psutil**.

```sh
python -m pip install psutil playwright
python -m playwright install chromium
python scripts/profile-resources.py --records 300 --idle-seconds 10 --output resource.json
python scripts/chromium-perf.py --items 2000 --low-memory --cpu-throttle 4 --output chromium-low.json
python scripts/chromium-perf.py --items 2000 --cpu-throttle 4 --output chromium-normal.json
```

`profile-resources.py` launches a temporary isolated server, creates only synthetic prompts and does not read user data. `chromium-perf.py` uses the actual UI and **mocked in-page API**, so it does not certify CSP, HTTP or storage integration. Both tools refrain from printing a session URL/token. For native hardware, add Windows Task Manager/Process Explorer, macOS Activity Monitor/Instruments and real suspend/idle measurements. GitHub Actions `resource-profile.yml` is manual opt-in and was **not run** while creating this ZIP.

## Hardware release acceptance proposal (targets, not met)

- Windows 10/11 x64 and ARM64 where supported, macOS Apple Silicon and Intel: cold/second launch, 30-minute idle, unlock/lock cycles, copy/paste, backups, shutdown/restart, and WebView process exit.
- Test 4 GiB, 8 GiB and 16 GiB under real multi-application pressure. Record peak and steady-state **entire process-tree PSS/RSS**, CPU, disk reads/writes, and page faults; use 3+ repetitions with warmed/cold caches.
- Prototype targets pending hardware evidence: service idle CPU <1% of one core after startup, 95th percentile search <300 ms at 5,000 realistic prompts in low-memory mode, recover from 60-second OS sleep without data loss, no unbounded RSS growth after 250 edits/reuses. These are **targets**; not pass/fail results here.
- Investigate Node baseline RSS, expensive key derivation, SQLite full-text scans, resource-heavy WebView animations, and installer overhead if measured budgets fail. Avoid reducing KDF strength simply to speed unlock; changes need review.

Guidance: [WebView2 process model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/end-user-faq), [Microsoft performance practices](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance).
