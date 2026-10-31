# Browser Companion - v0.9 developer pilot

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](../../docs/CORE_OBJECTIVE.md) | [Documentation index](../../docs/DOCUMENTATION_INDEX.md)

Opt-in send-intent snapshots and optional local writing hints on three approved AI hosts. Manual focused-editor preview/save remains available on the earlier wider allowlist. This is unpacked extension source, **not a validated/store-published extension**.

Read the [complete pilot guide](../../docs/PILOT_GUIDE_V0_9.md) first. Load this directory (or the portable preview's `browser-helper/` folder) with Chrome/Edge Developer mode -> Load unpacked. Unlock the vault, choose **Connect browser** in the Windows preview (or approve browser snapshots in Settings in the source app), pair the popup, then enable each supported site and optional hints. Both approval layers are required. Keep the service running and unlocked.

Auto hosts: `chatgpt.com`, `claude.ai`, `gemini.google.com`. Host access is optional and requested only when enabling that site. Dynamic scripts are top-frame only. Incognito is disallowed. Recognized private/temporary/protected fields are excluded on a best-effort basis; do not trust untested site modes with private data.

The popup shows whether the current site still needs optional permission before capture can be enabled, then reuses an existing grant on later opens. The visible page panel shows site status, failures and Pause. Send/Enter produces a **draft snapshot**, not delivery proof. Modifier/IME/synthetic keyboard events are excluded. Source host only; no conversation URL/title/history or account identifiers. Hints check limited English patterns after a 900 ms pause; they never edit text or call Groq.

The service worker derives the host from its sender, uses a trusted-context-only session token, forwards only bounded events to loopback and never persists raw text. It has no plaintext queue, retries or polling. Maximum two requests, four-second deadlines, bounded response bodies. Actual browser-worker memory/lifecycle still needs measurement.

Lock/revoke/restart/expiry invalidates saving. Browser sends do not extend vault idle time (15 minutes by default). Watch the per-send acknowledgement: an enabled site is not a live connectivity heartbeat. Pause cannot withdraw already accepted requests. Default controls fail closed rather than saving later without the user knowing.

Manual preview still supports ChatGPT (including the earlier chat.openai.com host), Claude, Gemini, Perplexity, Copilot, Poe, AI Studio, DeepSeek and Grok via its fixed allowlist. These are not claims of verified automatic recording on those sites. It requires your explicit Preview and Save actions.

The 24 October reliability increment makes manual preview use the recorder's shared private/protected/visibility checks and excludes single-line inputs. It clears older previews before another attempt and rejects a result if the tab host changed. The worker checks actual optional permission and serializes enable/pause registration. Observed revocation aborts pending requests; it cannot undo a save the service already accepted. A lost response is shown as an unconfirmed save: check the vault before manually retrying. Hints stop on focus changes, ambiguous composers fail closed, and form-associated Send buttons stay within their form. Reload extension source and test tabs when testing an update.

The popup now shows at most 20 capture-save gaps from this browser session, with fixed reason, supported site and time only. Clear them in the popup. A gap with an unconfirmed save means the service may already have accepted the text, so check the vault before retrying. Unsupported editors that never send a request are not detected by this list.

## Permissions

- `activeTab`, `scripting`: explicit preview and dynamic optional-site scripts.
- `storage.session`: temporary write-only pairing and bounded content-free gap receipts; trusted contexts only, no raw prompts.
- `storage.local`: nonsecret per-site enable/hint choices; trusted contexts only.
- `clipboardWrite`: explicit manual Copy.
- Loopback host permission: local pairing/save endpoint, never arbitrary destinations.
- Optional three-site hosts: only explicitly enabled top-level composers.

No vault read/export privileges, no Groq key, no native app permissions or hidden cloud calls.

## Verification

Fourteen worker tests pass in Node VM with Chrome API doubles. Actual recorder/UI code passes 53 Chromium synthetic scenarios. On Windows, full Chromium loaded the unpacked worker and passed eight scoped checks, including default-off behavior and no injection before optional site permission. The human permission prompt, injected script after consent, real-site capture, and Edge/macOS validation remain open. See [test report](../../docs/TEST_REPORT_V0_9.md). Do not broaden the permission scope to work around a failing selector.
