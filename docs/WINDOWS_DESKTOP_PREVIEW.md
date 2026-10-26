# Windows desktop developer preview

This is an unsigned WinForms app and per-user setup preview built locally from this repository. It opens a native window, owns a private local vault service, and keeps pause, lock and quit controls in the Windows tray. It is for harmless personal testing. The setup is not a signed public release or verified all-day capture on real services.

## Open it

1. In this checkout, run `.local/promteSaver-Setup.exe` to install for this Windows account, or open `.local/windows-preview/promteSaver.exe` from its complete portable folder. Setup is designed to put program files in `%LOCALAPPDATA%\Programs\promteSaver` and leave vault data separate. The bundled Node 24.16 runtime starts with the native host; no terminal, pasted PowerShell script or browser window is needed. Windows .NET Framework 4.7.2+ is required. The setup is unsigned; an earlier build passed an isolated temporary install, but the final build's normal Start Menu/uninstall and clean-device paths have not been tested.
2. Click **Create vault** once. On later launches, click **Open vault**. The Windows app no longer asks for a passphrase. It uses a random secret protected by Windows CurrentUser DPAPI and stores its separate vault in `%LOCALAPPDATA%\promteSaver\desktop-vault`. The older `%USERPROFILE%\.promtesaver-local` passphrase vault remains untouched and is not imported. Back up the complete desktop vault, including `desktop-credential.bin`, before changing Windows accounts or devices. The protected credential cannot open on another account by itself; a recovery/import flow for old vaults is not yet built into the native window.
3. The app starts with capture paused. Closing the window keeps the visible tray app running. Use tray **Open promteSaver**, **Pause all capture**, **Lock vault and stop capture**, or **Quit promteSaver**. Quit stops its local service; Windows session lock and vault idle lock stop capture. After lock, **Open vault** uses your Windows account without another password.

The home screen shows saved text, source/time, search, copy, **Text from app**, **Start capture** and **Pause all**. **More options** contains browser pairing, the older Notepad pilot, wording review and **Start with Windows**. Startup is an optional per-user setting, off by default. It launches the locked app at sign-in and does not renew browser pairing or authorize any source. If you use the portable folder and move it, turn startup off first and enable it again from the new location. A login/reboot trial has not been completed.

The compiled `.local/windows-preview/` folder and `.local/promteSaver-Setup.exe` are ignored by Git and absent from a source checkout until built. Developers with a trusted supported Node runtime, the Windows .NET Framework compiler and the full matching Node license file can run `apps/desktop/windows-host/build-setup.ps1 -NodeLicense <local-license-path>` to rebuild both. It stages allowlisted runtime files and embeds them in setup; it does not download, sign or publish anything. Runtime hashes detect accidental changes relative to the included manifest and are not a signature. Do not change organization PowerShell policy to run a source build.

The setup preview registers a per-user Start Menu shortcut and uninstall entry. Its removal helper is designed to delete only listed program files while preserving the separate vault; it leaves its small helper file for a future cleanup flow. Actual Start Menu registration, uninstall, update/reinstall, Windows warning behavior and a clean-device run remain unverified. Do not use this preview as a public installer yet.

## Try one approved desktop app

Open a non-sensitive editor, choose its running executable under **Text from app**, click **Start capture** and review the per-app consent dialog. A keyboard event only signals that a field may have changed; the app never reads or saves key values. Windows UI Automation focus/text/value events can also signal a paste or other insertion when the app exposes them. After a 1.3-second settle, the observer checks the foreground process and focused editable field, excludes password/read-only/unknown controls and reads at most 50,001 characters. Existing text is a comparison baseline, not an import; a later change can save the full changed field as an encrypted `draft_snapshot`. Any changed text may be saved, including non-prompts, and no send is proven. Browsers, credential and system processes are excluded from this native route. **Pause this app**, **Pause all**, lock and Quit stop it; approval ends on lock/restart.

A real Windows pilot with a synthetic WPF app saved typed and pasted text, excluded password and read-only fields, ignored focus of pre-existing text and stopped after Pause all. This is not evidence for actual voice dictation, Electron/Word/terminal controls, fast sends or all-day use. A slow third-party accessibility provider can still block the native UI thread. Start with harmless text and inspect the list; use a separate browser helper for AI sites.

## Older Notepad pilot

Under **More options**, check **Notepad pilot** and click **Start Notepad** to try the earlier source-specific adapter. Any changed Notepad editor text can be saved, including non-prompts. It requires a keyboard event and a supported foreground Notepad editor. Use **Pause all** or lock to stop it. The current **Text from app** picker is the main experimental native source.

The older adapter has compiled native code, synthetic encrypted service tests and one real Windows 11 Notepad typing/pause pilot in a temporary vault. It does not verify other Notepad versions, paste-only/dictation paths or long sessions.

## Try browser capture

In Chrome (`chrome://extensions`) or Edge (`edge://extensions`), enable Developer mode and **Load unpacked** from the preview folder's `browser-helper/`. In the unlocked native app select one site, click **Connect browser**, approve that host, and copy the one-time code into the helper popup. Click **Pair with local vault**. On a normal, non-private tab at the selected site, click **Enable for this site** and grant its optional permission. Send harmless text with the site's Send button. Look for **Saved locally / delivery not verified**, then **Refresh prompts** in the native capture list. Pairing is write-only for the extension and is revoked on lock; each site requires explicit permission. Real site selectors, human permission grant and consented installed-extension capture have not yet passed a manual pilot.

The saved capture snapshot and editable library copy are separate encrypted records. Obvious sensitive matches may be redacted before persistence, so the saved snapshot is not guaranteed to be byte-for-byte identical to what was typed. A browser Send/Enter creates `draft_snapshot` evidence: it is **not** proof that the AI service received a prompt. Desktop field and Notepad snapshots also lack send evidence. The app does not record raw key values, poll clipboard contents or take screenshots/audio/full browsing history. A Codex local transcript producer exists in source and passed isolated synthetic-file tests, but the real Windows preview keeps it disabled until private/protected-session exclusion can be verified.

## Review and stop

Select a capture to read its saved snapshot. **Review wording** runs a bounded local check for spacing, repeated words and punctuation only when clicked. It never edits the saved evidence or calls cloud AI. The current desktop preview has no automatic end-of-day grammar rewrite or inline suggestions in other apps. The default vault idle lock is 15 minutes; successful capture writes can renew the unlocked session, but login starts locked and there is no dependable unattended all-day mode.

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
