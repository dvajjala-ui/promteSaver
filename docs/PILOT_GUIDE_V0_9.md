# Windows / macOS pilot guide - v0.9

Start with harmless test prompts. The new [Windows desktop preview](WINDOWS_DESKTOP_PREVIEW.md) has an unsigned per-user setup prototype and a portable option; neither is an everyday recorder certified on real sites. The browser helper needs explicit pairing and per-site approval. The Codex transcript producer remains disabled for real sessions because private/protected-session exclusion is unverified. Mac still uses the source/browser flow below; no macOS native app was built.

## 1. Open the Windows desktop preview

In this checkout, run `.local/promteSaver-Setup.exe` to install for your Windows account, or open `.local/windows-preview/promteSaver.exe` from its complete portable folder. Both are ignored by Git and absent from a source checkout until built. A supported Node runtime is bundled, so this preview does not need an open terminal or a localhost page. The Windows preview creates a separate vault at `%LOCALAPPDATA%\promteSaver\desktop-vault`; the older `%USERPROFILE%\.promtesaver-local` vault remains untouched. Setup is unsigned; an earlier build passed one isolated temporary install, while normal Start Menu and uninstall flows remain unverified.

Click **Create vault** once, then **Open vault** on later launches or after locking. The native app has no passphrase prompt: Windows CurrentUser DPAPI protects its random vault secret. Back up the complete desktop vault, including `desktop-credential.bin`, before changing Windows accounts or devices. The home screen shows saved text with source/time, search, copy, **Text from app**, **Start capture** and **Pause all**. Browser connection, offline wording review, the older Notepad pilot and **Start with Windows** are under **More options**. Capture is off until you approve a source. Closing the window leaves a visible tray app running; use tray **Pause all capture**, **Lock vault and stop capture**, or **Quit promteSaver** as needed. Quit stops the owned local service. Startup does not unlock the vault or reconnect a source; it is off by default and was not reboot-tested. Windows session lock also locks the vault. Default vault idle lock is 15 minutes; successful source writes may renew an unlocked session, but unattended all-day capture is not established.

**Desktop first test:** Open a non-sensitive text editor, choose its running executable under **Text from app**, click **Start capture**, and read the per-app approval dialog. Type harmless text in a normal editable field and pause for about two seconds. Confirm one app-attributed `draft_snapshot` appears in the native list; the app does not claim you sent it. Try a harmless paste. Click **Pause all**, change the text again and verify no new item appears. The source may save any changed text, including non-prompts. Browsers, credential/system apps, password/read-only fields and controls without reliable editability metadata are excluded. This has been live-tested only with a synthetic WPF editor; actual dictation and other editor frameworks remain unverified. The older Notepad pilot remains under **More options** and passed one separate Windows 11 typing/pause test.

## 2. Pair the browser companion

The Codex transcript producer is implemented only for synthetic injected-directory tests. The real Windows preview leaves it unavailable until private/protected-session exclusions can be verified. The approved desktop source uses keyboard events only to schedule an editor snapshot; it does not store key values or poll clipboard contents. Browser pages require the separate helper.

In Chrome use `chrome://extensions`, or in Edge use `edge://extensions`. Enable Developer mode, choose **Load unpacked**, and select the preview folder's `browser-helper/` directory. For the source/browser fallback, select `apps/browser-helper/` from the repository. This local developer installation has no extension-store approval.

Select one site in the unlocked Windows app, click **Connect browser**, approve that host and copy its one-time code into the companion popup. Click **Pair with local vault**. The code expires in ten minutes and is single-use; do not share it. In the source/browser fallback, use the browser helper controls under Settings to approve send snapshots and generate the code. Re-pair after vault lock, app restart, expiry or browser-session loss.

Open a regular non-private tab at `https://chatgpt.com`, `https://claude.ai` or `https://gemini.google.com`. In that site's companion popup choose **Enable for this site**, approve its optional browser permission, and leave local typing hints unchecked unless you want them. Reload an already-open page if its known composer has no panel. Private/incognito windows and unrelated fields are outside the capture scope.

**Harmless first test:** send `Summarize the benefits of a short daily planning habit. Return three bullet points.` with the site's Send button. Look for the companion's saved acknowledgement, then click **Refresh** in the Windows app and open the recent saved snapshot. In the source/browser UI use **Captured** and **Browser inbox**. Obvious sensitive matches may be redacted before persistence. A saved acknowledgement means the local vault accepted a send-intent snapshot; it does not prove the AI site received the prompt. If the composer is not recognized, pause that site and report only site host, browser version, editor type and safe reproduction steps. Do not widen capture to arbitrary fields.

## 3. Test stop and exclusion behavior

| Action | Expected outcome |
| --- | --- |
| Launch/unlock without source approval | No capture source starts |
| Type in a known browser composer without Send/Enter | No saved capture; optional local hints only |
| Shift+Enter, IME composition or synthetic page keyboard event | No browser capture from those paths |
| Use unrelated search/password/private-marked input | Excluded by the source's checks; never assume all sensitive modes are detectable |
| Pause one browser site | Future attempts from that site stop; an already accepted save cannot be withdrawn |
| Pause all, lock vault or quit | Future source writes stop; no failed prompt text is queued for retry |
| Restart browser or unlock after lock | Pair and approve again where required; nonsecret per-site choices may remain |
| Unknown site, embedded frame or desktop app without explicit approval | No automatic capture |

The browser popup may show a bounded, content-free failure reason if a request reaches the worker. An unsupported editor that never sends a request cannot produce such a record. Pairing status is not a live save heartbeat: inspect the acknowledgement after each send. Browser pairing expires within eight hours, and the vault's default 15-minute idle lock can end it sooner. This pilot does not provide continuous all-day collection, automatic daily AI grammar review, or suggestions in other apps.

## 4. Source/browser fallback and macOS

The old browser UI is still available for testing secondary features. On Windows, double-click `start-windows.cmd` in the repository folder; it checks Node 24.16+ within 24.x, chooses the correct working directory and keeps startup errors visible. Keep the console open and use the printed private URL. Do not paste `start-windows.ps1` contents into an interactive shell or change organizational PowerShell policy. The saved `.ps1` file is optional; `node apps/local-web/server.ts` is another source launch path under your device rules. This flow needs an installed trusted Node and does not provide the native tray or Codex source.

On macOS use `sh ./start-mac.command` from the source folder with a trusted supported Node. This is source/browser testing, not a macOS app/DMG. Do not share the private local URL, vault, pairing code or passphrase in reports.

## 5. Optional Groq test in the source/browser UI

This is a secondary workflow in the source/browser UI under **More features**; the Windows desktop preview does not perform AI review. No real API key was available in the build environment, and none is included in the package. In Settings, enter your Groq key into the password field, choose an available model ID, explicitly enable requests, and save. Default is `llama-3.3-70b-versatile`. Never paste the key into a chat or issue. Provider/model access and charges depend on your account.

Open **AI assistant**, or select a prompt and choose **AI assist**. Choose Summary, Structure, Improve or Rewrite. Optionally pick a writing profile. Click **Preview outgoing text**, inspect the exact messages, tick the consent box and send. Every fresh send requires approval. Changing the source, model, profile, settings or session invalidates the preview; preview again.

Expected: a draft appears on the right. Copy only after review, or choose **Save as a new prompt**. The saved source and captured evidence must remain unchanged; the saved result belongs to **AI drafts**, labelled AI-generated. Stored writing examples are not sent automatically. A local preview is not a successful provider connection.

Invalid key/permission/model, rate limit, network failure or deadline should show a safe error, without exposing the key or automatically retrying. Cancel drops the local result but cannot retract data already received by Groq. No cloud AI runs automatically while typing or after capture.

## 6. Recovery and deletion drill in the source/browser UI

Create a portable encrypted backup. Edit the library copy of a captured item and confirm the saved evidence is unchanged. Move the copy to Trash: it remains recoverable and evidence still exists. Permanently purge it: its linked evidence is deleted too. Deleting evidence from Captured removes its linked copy/history. Restoring an older backup must not resurrect a tombstoned capture or linked copy. Independently duplicated or AI-derived prompts are separate records and are not deleted by inference.

New linked captures require snapshot v4. Earlier software may reject these backups and can lose linkage if used on the active vault. Keep the pre-upgrade full-folder copy. Groq keys are excluded from portable backups, so configure the key again after a portable restore. Full-folder backups contain it encrypted and must be protected.

## 7. Report only safe diagnostics

In the source/browser UI, Settings -> Check this device -> Save diagnostic report produces a local report without prompts, key values, file paths or session URLs. Include OS/browser/Node versions, the action that failed and expected vs observed behavior. Do not upload vault databases, keyinfo.json, passwords, pairing codes or the private URL. Reports can contain device platform/memory information; review before sharing.

## Current unresolved gates

The compiled Windows executable passed a temporary-vault service smoke test and a relocated portable-folder test. Its visual check used synthetic records. The real Codex transcript source is disabled; only isolated synthetic source files were tested. The browser UI passed synthetic fixtures and temporary local-service scenarios; a full-Chromium unpacked worker passed scoped checks, but human permission grant and real ChatGPT/Claude/Gemini capture were not verified. Live Groq inference, consented installed-extension use, clean-device installation, signing, screen readers, low-spec hardware, macOS runtime, OS keychain and full-database encryption remain open. Passing a synthetic test does not certify a particular device or third-party editor.
