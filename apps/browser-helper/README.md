# Browser Companion - v0.9 developer pilot

Opt-in send-intent snapshots and optional local writing hints on three approved AI hosts. Manual focused-editor preview/save remains available on the earlier wider allowlist. This is unpacked extension source, **not a validated/store-published extension**.

Read the [complete pilot guide](../../docs/PILOT_GUIDE_V0_9.md) first. Load this directory with Chrome/Edge Developer mode -> Load unpacked. Unlock the vault, separately approve automatic browser snapshots in Settings, pair the popup, then enable each supported site and optional hints. Both approval layers are required. Keep the service running and unlocked.

Auto hosts: `chatgpt.com`, `claude.ai`, `gemini.google.com`. Host access is optional and requested only when enabling that site. Dynamic scripts are top-frame only. Incognito is disallowed. Recognized private/temporary/protected fields are excluded on a best-effort basis; do not trust untested site modes with private data.

The visible panel shows site status, failures and Pause. Send/Enter produces a **draft snapshot**, not delivery proof. Modifier/IME/synthetic keyboard events are excluded. Source host only; no conversation URL/title/history or account identifiers. Hints check limited English patterns after a 900 ms pause; they never edit text or call Groq.

The service worker derives the host from its sender, uses a trusted-context-only session token, forwards only bounded events to loopback and never persists raw text. It has no plaintext queue, retries or polling. Maximum two requests, four-second deadlines, bounded response bodies. Actual browser-worker memory/lifecycle still needs measurement.

Lock/revoke/restart/expiry invalidates saving. Browser sends do not extend vault idle time (15 minutes by default). Watch the per-send acknowledgement: an enabled site is not a live connectivity heartbeat. Pause cannot withdraw already accepted requests. Default controls fail closed rather than saving later without the user knowing.

Manual preview still supports ChatGPT (including the earlier chat.openai.com host), Claude, Gemini, Perplexity, Copilot, Poe, AI Studio, DeepSeek and Grok via its fixed allowlist. These are not claims of verified automatic recording on those sites. It requires your explicit Preview and Save actions.

## Permissions

- `activeTab`, `scripting`: explicit preview and dynamic optional-site scripts.
- `storage.session`: temporary write-only pairing; trusted contexts only, no raw prompts.
- `storage.local`: nonsecret per-site enable/hint choices; trusted contexts only.
- `clipboardWrite`: explicit manual Copy.
- Loopback host permission: local pairing/save endpoint, never arbitrary destinations.
- Optional three-site hosts: only explicitly enabled top-level composers.

No vault read/export privileges, no Groq key, no native app permissions or hidden cloud calls.

## Verification

Seven worker tests pass in Node VM with Chrome API doubles. Actual recorder code passes Chromium synthetic composer scenarios. The attempted real unpacked worker did not become available in this managed environment; real-site and Windows/Mac browser validation remain open. See [test report](../../docs/TEST_REPORT_V0_9.md). Do not broaden the permission scope to work around a failing selector.
