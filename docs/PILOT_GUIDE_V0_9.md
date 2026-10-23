# Windows / macOS pilot guide - v0.9

Use harmless synthetic prompts first. This is source you run locally, not an installer or a verified everyday recorder. The local vault and browser UI were exercised on Windows with synthetic data; the full extension consent/capture pilot and macOS remain open.

## 1. Start a safe test vault

Stop previous versions and back up the whole `~/.promtesaver-local` folder first. Extract v0.9 into a new directory. Install a trusted Node.js 24.16+ release within 24.x. No `npm install` is needed merely to run the application.

Windows PowerShell, from the extracted `promteSaver` folder:

```powershell
.\start-windows.ps1
```

If local PowerShell policy blocks the launcher, do not disable organization policy; run the equivalent trusted source with `node apps/local-web/server.ts` in that folder, subject to your device rules.

macOS Terminal:

```sh
sh ./start-mac.command
```

Open the private URL printed by the service. Do not send that URL in bug reports. Keep the terminal running. Create/unlock your vault. Low-memory mode and idle duration are in Settings. Default idle lock is 15 minutes; capture is revoked at lock. Lock-on-hide, if enabled, intentionally prevents capture after leaving the vault tab. No auto-start-on-login or universal OS listener is installed.

## 2. Load and pair the browser companion

In Chrome use `chrome://extensions`, or in Edge use `edge://extensions`. Enable Developer mode and choose **Load unpacked**. Select the extracted `apps/browser-helper` folder, not the ZIP. This is a local developer install; no extension-store approval is claimed.

In the unlocked app's Settings, find the browser helper section. Check the explicit browser send-snapshot approval, then choose **Generate a pairing code**. Paste the code into the companion popup and pair. The code expires and is single-use; never share it. Only one paired origin/session is active. Re-pair after locking, restarting, expiry or browser-session loss.

Open a regular non-private tab on one of:

- `https://chatgpt.com`
- `https://claude.ai`
- `https://gemini.google.com`

Open the companion popup, choose **Enable for this site**, and approve that site's optional permission. Local hints are a separate checkbox. Reload that site if an existing page does not show the panel when focusing its known composer. Do not grant incognito access; the manifest disallows it.

**Expected first test:** type `Summarize the benefits of a short daily planning habit. Return three bullet points.` and use the site's Send button. The companion should acknowledge **Saved locally / delivery not verified**. In promteSaver, choose **All prompts**, click **Refresh**, and filter project **Browser inbox**. The item should show its source host. The Captured section holds the separate immutable draft snapshot. Delivery to the AI site is not proved by this acknowledgement.

If the page editor is not recognized, do not widen capture to arbitrary fields. Pause the site and use manual preview/save. Report the browser version, site host, editor type and harmless reproduction steps. Do not include page URLs with private conversation IDs or real prompt contents.

## 3. Test the privacy boundaries before real use

| Action | Expected outcome |
| --- | --- |
| Type without Send/Enter | No captured item; optional local hints only |
| Shift+Enter, IME composition, synthetic page keyboard events | No capture from these paths |
| Use unrelated search/password/private-marked inputs | Excluded |
| Pause site | Future capture attempts stop; already accepted requests cannot be withdrawn |
| Lock vault / revoke helper / close service | No saving; visible failure on next attempt; nothing queued |
| Restart browser | Pairing must be re-established; nonsecret per-site choices may remain |
| Unknown site or embedded frame | No automatic capture |
| Send secret-shaped synthetic text | Known regex matches redacted, but never assume all secrets are detected |

Recognized temporary-page markers are only heuristics. Do not use this developer pilot on sensitive or temporary conversations before validating that particular site mode. The panel's ready state is not a live heartbeat; authorization is checked on each send. The vault can lock silently while you work elsewhere, so watch the per-send acknowledgement. Browser capture does not extend the vault idle timer.

## 4. Configure and test Groq on your computer

No real API key was available in the build environment, and none is included in the package. In Settings, enter your Groq key into the password field, choose an available model ID, explicitly enable requests, and save. Default is `llama-3.3-70b-versatile`. Never paste the key into a chat or issue. Provider/model access and charges depend on your account.

Open **AI assistant**, or select a prompt and choose **AI assist**. Choose Summary, Structure, Improve or Rewrite. Optionally pick a writing profile. Click **Preview outgoing text**, inspect the exact messages, tick the consent box and send. Every fresh send requires approval. Changing the source, model, profile, settings or session invalidates the preview; preview again.

Expected: a draft appears on the right. Copy only after review, or choose **Save as a new prompt**. The original and captured evidence must remain unchanged; the saved result belongs to **AI drafts**, labelled AI-generated. Stored writing examples are not sent automatically. A local preview is not a successful provider connection.

Invalid key/permission/model, rate limit, network failure or deadline should show a safe error, without exposing the key or automatically retrying. Cancel drops the local result but cannot retract data already received by Groq. No cloud AI runs automatically while typing or after capture.

## 5. Recovery and deletion drill

Create a portable encrypted backup. Edit the library copy of a captured item and confirm the original evidence is unchanged. Move the copy to Trash: it remains recoverable and evidence still exists. Permanently purge it: its linked evidence is deleted too. Deleting evidence from Captured removes its linked copy/history. Restoring an older backup must not resurrect a tombstoned capture or linked copy. Independently duplicated or AI-derived prompts are separate records and are not deleted by inference.

New linked captures require snapshot v4. Earlier software may reject these backups and can lose linkage if used on the active vault. Keep the pre-upgrade full-folder copy. Groq keys are excluded from portable backups, so configure the key again after a portable restore. Full-folder backups contain it encrypted and must be protected.

## 6. Report only safe diagnostics

Settings -> Check this device -> Save diagnostic report produces a local report without prompts, key values, file paths or session URLs. Include OS/browser/Node versions, the action that failed and expected vs observed behavior. Do not upload vault databases, keyinfo.json, passwords, pairing codes or the private URL. Reports can contain device platform/memory information; review before sharing.

## Current unresolved gates

The Windows local-browser test passed against a temporary vault. A separate full-Chromium unpacked worker probe passed seven scoped checks, including no injection before optional site permission. The automated permission prompt did not resolve, so enabling a site, installed content-script capture, real AI-site selectors and real Groq inference are not verified. Native installation, screen readers, low-spec hardware, OS keychain and full-database encryption remain open. Passing a synthetic test is not a certification that a particular device or third-party editor works.
