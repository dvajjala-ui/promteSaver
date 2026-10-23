# promteSaver 0.4.0 — Recovery and resource profiling beta

22 October 2026. This source ZIP is a **development preview**, not a signed Windows or macOS installable application. It has not been deployed or pushed to GitHub. Read the upgrade warning in the README before using a real vault.

## Delivered and tested

1. **Encrypted interrupted-editor drafts.** When a user stops typing for 1.3 seconds, an encrypted draft copy is kept in the same authenticated vault. The library stays unchanged until explicit Save. A lock/restart followed by unlock reveals recoverable drafts, which can be restored **as new prompts** (never overwriting a potentially newer library revision) or deliberately discarded. Autosave status is visible. There are at most eight drafts per vault. Recovery drafts are deliberately omitted from portable backups; take a full stopped-service vault backup to preserve them. They are encrypted exactly as typed, before the finished library's credential redaction step. An abrupt process crash within the debounce interval can still lose the latest keystrokes. This is best-effort recovery, not a transactional guarantee of every character.
2. **Bounded list/query previews.** Normal list and quick-finder queries request `view=preview`. Long prompt bodies are reduced to the first 1,600 characters (420 in low-memory mode), and long notes to 240 characters. For editing, copying, templates, pinning, or Markdown export, the client fetches the entire individual entry first. ETags are calculated from the complete original item, and legacy full-response API calls remain compatible. A real HTTP test covers a 90k-character template, truncated responses, rehydration and unchanged full content after pinning.
3. **Constrained-device SQLite profile.** Low-memory preference limits the connection cache to 1 MiB and switches temporary sort storage to disk; default is a 2 MiB page cache and in-memory temporary storage. SQLite mmap is disabled. This reduces opportunities for SQLite transient memory growth, but can trade memory for disk I/O and is not a demonstrated whole-app RSS improvement.
4. **Reduced DOM churn.** Library page cards are appended in one `DocumentFragment`; low-memory UI still shows only 20 cards per page, regular mode 40. No virtualization, external UI framework, hidden collector, telemetry, or background model added.
5. **Repeatable resource acceptance tools.** Synthetic isolated Node service profile (`scripts/profile-resources.py`) and Chromium UI profile (`scripts/chromium-perf.py`), with optional 4x simulated CPU slowdown, process-tree RSS, JS heap and CPU samples. An opt-in GitHub Actions resource-profile matrix is supplied for later Windows/macOS CI runs. No such CI run has been observed here.

## Scope and evidence

- **81/81** Node tests passed in the available Linux Node **22.16.0 compatibility** environment; 4 tests are new (three draft tests, one list-projection integration test).
- **15/15** Chromium UI fixture scenarios passed against the actual DOM with a simulated in-page API. This is not networked browser-to-service E2E; the new scenarios cover recovery and hydration.
- Real Node HTTP server, SQLite persistence, lock/unlock/auth, encrypted storage and output projection are exercised directly by the Node tests.
- Chromium 144.0.7559.96, 2,000 synthetic items with CPU slowdown x4: low-memory 20-card view sampled **3.55 MiB renderer JS heap** and **547 MiB Chromium process tree RSS** (headless Playwright, not a native WebView); normal 40-card mode sampled **5.44 MiB JS heap** and **562 MiB Chromium process tree RSS**. Both are single runs and do not establish a general advantage or hardware requirement. CPU slowdown was reset before idle CPU sampling.
- Isolated Node service (300 synthetic prompts) sampled roughly **102 MiB idle RSS**, versus a similarly measured v0.3 run around **98 MiB**. **No idle memory reduction is claimed.** Idle CPU was below the sampling resolution over a three-second window.
- Chromium browser navigation to the actual loopback service returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`. That browser-to-HTTP path is not certified here. A native Tauri/Rust executable has not been built; Windows/macOS and installer behavior remain unverified.

Full details: [test evidence](TEST_REPORT_V0_4.md), [resource budgets](RESOURCE_BUDGET_V0_4.md), [architecture](ARCHITECTURE_V0_4.md).

## Still not market-ready

No actual trusted native Windows/macOS prompt capture, keychain integration, full DB/WAL encryption, large-backup streaming, native signed installers or validated global shortcuts. Windows WebView2/macos WKWebView memory and native lifecycle must be measured **on their target hardware**. Sync/AI remain optional later products and are disabled. This version is not a claim of 80% overall readiness.
