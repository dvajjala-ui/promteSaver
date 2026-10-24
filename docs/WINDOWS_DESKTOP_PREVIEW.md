# Windows desktop developer preview

This is an unsigned portable WinForms app built locally from this repository. It opens a native window, owns a private local vault service, and keeps pause, lock and quit controls in the Windows tray. It is for harmless personal testing. It is not an installer, a signed release, or verified all-day capture on real services.

## Open it

1. In this checkout, open `.local/windows-preview/promteSaver.exe`, or extract `.local/promteSaver-windows-preview-2026-10-25-notepad-pilot-r3.zip` to a new folder and open the EXE there. Keep `runtime/`, `binaries/`, `browser-helper/`, `promteSaver.ico`, and `promteSaver.exe.config` beside the EXE in a bundled build. The bundled Node 24.16 runtime starts with the native host; no terminal, pasted PowerShell script or browser window is needed. Windows .NET Framework 4.7.2+ is required. This is not a clean-device installer test.
2. Click **Create vault** once. On later launches, click **Open vault**. The Windows app no longer asks for a passphrase. It uses a random secret protected by Windows CurrentUser DPAPI and stores its separate vault in `%LOCALAPPDATA%\promteSaver\desktop-vault`. The older `%USERPROFILE%\.promtesaver-local` passphrase vault remains untouched and is not imported. Back up the complete desktop vault, including `desktop-credential.bin`, before changing Windows accounts or devices. The protected credential cannot open on another account by itself; a recovery/import flow for old vaults is not yet built into the native window.
3. The app starts with capture paused. Closing the window keeps the visible tray app running. Use tray **Open promteSaver**, **Pause all capture**, **Lock vault and stop capture**, or **Quit promteSaver**. Quit stops its local service; Windows session lock and vault idle lock stop capture. After lock, **Open vault** uses your Windows account without another password.

In the unlocked window, **Start with Windows** is an optional per-user setting. It launches this portable EXE at sign-in; it does not unlock the vault, renew browser pairing or authorize any source. It is off by default. If you move the portable folder, turn it off first and enable it again from the new location. The checkbox was inspected in a synthetic native window, but a login/reboot trial has not been completed.

The compiled `.local/windows-preview/` folder is ignored by Git and is not in a source ZIP. Developers with a trusted supported Node runtime, the Windows .NET Framework compiler and the full matching Node license file can run `apps/desktop/windows-host/build-preview.ps1 -NodeLicense <local-license-path>` to rebuild it. The script stages allowlisted runtime files and the browser helper; it does not download, install, sign or publish anything. Runtime hashes detect accidental changes relative to the included manifest and are not a signature. Do not change organization PowerShell policy to run a source build.

## Try native Notepad capture

In the unlocked window, check **Save Notepad editor text** and click **Start Notepad**. Any changed text in an approved Notepad editor can be saved, including non-prompts; use the source only for text you intend to keep. Only keyboard activity while a Notepad editor is foreground schedules a read; after a 1.3-second pause, the app checks the foreground process and focused field, rejects password/unknown fields, and requests at most 50,001 characters through Windows UI Automation. Changed snapshots are saved locally as `draft_snapshot` with `notepad.exe` attribution and no submission claim. The key values themselves are never stored. Use harmless test text, then **Refresh prompts**. **Pause all**, lock or Quit stops the hook. The consent ends on lock/restart and Start with Windows does not resume it.

This source has compiled native code, synthetic encrypted service tests and one real Windows 11 Notepad typing test in a temporary vault. The draft appeared in the native list with `notepad.exe` and `draft_snapshot`; typing after **Pause all** left the saved count and text unchanged. If another Notepad version exposes an unsupported editor, the app reports a capture gap. It does not cover other apps, browsers, all pasted/dictated changes, or text typed before approval. Use the optional browser helper separately for its supported sites.

## Try browser capture

In Chrome (`chrome://extensions`) or Edge (`edge://extensions`), enable Developer mode and **Load unpacked** from the preview folder's `browser-helper/`. In the unlocked native app select one site, click **Connect browser**, approve that host, and copy the one-time code into the helper popup. Click **Pair with local vault**. On a normal, non-private tab at the selected site, click **Enable for this site** and grant its optional permission. Send harmless text with the site's Send button. Look for **Saved locally / delivery not verified**, then **Refresh prompts** in the native capture list. Pairing is write-only for the extension and is revoked on lock; each site requires explicit permission. Real site selectors, human permission grant and consented installed-extension capture have not yet passed a manual pilot.

The saved capture snapshot and editable library copy are separate encrypted records. Obvious sensitive matches may be redacted before persistence, so the saved snapshot is not guaranteed to be byte-for-byte identical to what was typed. A browser Send/Enter creates `draft_snapshot` evidence: it is **not** proof that the AI service received a prompt. The Notepad source also produces draft snapshots, not send evidence. The app does not record raw key values, clipboard contents, screenshots, audio, full browsing history or other desktop apps. A Codex local transcript producer exists in source and passed isolated synthetic-file tests, but the real Windows preview keeps it disabled until private/protected-session exclusion can be verified.

## Review and stop

Select a capture to read its saved snapshot. **Review recent wording** runs a bounded local check for spacing, repeated words and punctuation only when clicked. It never edits the saved evidence or calls cloud AI. The current desktop preview has no automatic end-of-day grammar rewrite or inline suggestions in other apps. The default vault idle lock is 15 minutes; successful Notepad activity can renew the unlocked session, but login starts locked and there is no dependable unattended all-day mode.

For a first pilot, confirm capture is off before approval, save one harmless prompt from one approved browser site, inspect the saved snapshot, pause that site, try another harmless prompt and confirm it is not saved, then lock and verify capture remains stopped. A previously accepted write cannot be withdrawn; failed text is not queued for later capture.

## If something does not work

| Symptom | Check |
| --- | --- |
| Native app says the local vault cannot start | Quit an older promteSaver instance or stop its PowerShell service; keep the whole portable folder together. Do not kill an unknown process or delete vault locks/keys manually. |
| Windows vault credential cannot be opened | Use the original Windows account and restore the complete desktop vault backup. Do not replace `desktop-credential.bin` or make a new vault over the old database. |
| Window closes but capture status remains in tray | This is the normal minimize behavior. Use tray **Open** or **Quit**. |
| Codex source says coming soon | Expected in the real preview. Private/protected-session exclusion is not verified, so only isolated synthetic source tests can enable that producer. |
| Browser paired but no prompt appears | Confirm the vault is unlocked, one supported site is enabled with its optional permission, the tab is non-private, and the page acknowledged that particular send. Pairing state alone is not a live save heartbeat. Re-pair after lock, browser restart or expiry. |
| Review shows no change | The lightweight offline checker found nothing in its limited rules. Originals stay unchanged. |
| Source fallback opens Notepad or PowerShell closes | Use the native EXE above. For the older browser UI, double-click `start-windows.cmd` from the repository instead of opening or pasting `start-windows.ps1`; its console retains startup errors. |

Report only OS/browser versions, a harmless reproduction and expected versus observed result. Do not share real prompts, the vault directory, private local URL, pairing code, protected credential or database. The older source/browser fallback and portable backups still use separate passphrases. See the [pilot guide](PILOT_GUIDE_V0_9.md), [readiness matrix](READINESS_V0_9.md) and [test report](TEST_REPORT_V0_9.md) for the remaining product gates.
