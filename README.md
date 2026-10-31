# promteSaver — Windows developer preview

> **Documentation scope (31 October 2026): Current reference.** Use the current objective for priorities and the readiness/test records for acceptance; dated results retain their original scope. [Core objective](docs/CORE_OBJECTIVE.md) | [Documentation index](docs/DOCUMENTATION_INDEX.md)

Windows is the immediate product priority; macOS comes later. The intended loop is install → approve a supported source → capture locally → review → reuse. The library supports that loop. Automatic daily AI review and suggestions inside other apps remain planned. Read the [core objective](docs/CORE_OBJECTIVE.md) and [documentation index](docs/DOCUMENTATION_INDEX.md) for the current direction and the scope of older plans.

**Automatically remember prompts from approved sources, keep trustworthy local history, and reuse useful wording when similar work returns.**

The product priority is a native Windows prompt memory app. The compiled preview offers **Text from app → Start capture** for a selected running desktop app: approve that app in the unlocked vault, then changed text in its focused editable field can be saved after a short pause. Keyboard events only signal a change; key values are not read or stored. Windows UI Automation text-change events can also detect paste or text inserted by another input method when the app exposes them. Browser, password-manager, operating-system authentication and protected fields are excluded. The existing browser helper remains an optional, separately approved path. An experimental Codex transcript producer is disabled for real sessions until private/protected-session exclusions can be verified.

**Observed Windows pilot:** typed text and a paste in an approved synthetic WPF editor each appeared as a saved draft in a temporary encrypted vault; text entered into its password field did not; **Pause all** prevented a later editor change from being saved. This tests one synthetic app, not arbitrary software or real voice dictation. The earlier real Windows 11 Notepad typing and pause pilot is separate evidence. Browser integration is a separate workstream. Capturing every app or all-day operation is not implemented.

**Source and build status:** The latest reviewed source includes a writable ValuePattern fallback. Its native sources compiled to an alternate EXE and the recorded source check passed 190/190 tests. The bundled rebuild stopped at a running EXE file lock, so no new setup was produced for that final source change. The preceding unsigned setup at `.local/promteSaver-Setup.exe` and portable folder at `.local/windows-preview/` belong to an earlier tree. They are generated locally and absent from a fresh checkout. An earlier setup passed one isolated temporary install and installed-path synthetic self-test; normal Start Menu registration, uninstall, updates, signing and clean-device acceptance remain open. See [Windows setup and build instructions](docs/WINDOWS_DESKTOP_PREVIEW.md).

[Windows preview setup](docs/WINDOWS_DESKTOP_PREVIEW.md) | [Pilot checklist](docs/PILOT_GUIDE_V0_9.md) | [Exact feature status](docs/READINESS_V0_9.md) | [Complete backlog](docs/PRODUCT_BACKLOG.md) | [Verification](docs/TEST_REPORT_V0_9.md) | [Architecture](docs/ARCHITECTURE_V0_9.md) | [Release notes](docs/RELEASE_NOTES_V0_9.md)

## Try the Windows preview

Run `.local/promteSaver-Setup.exe`, or open `.local/windows-preview/promteSaver.exe` from its complete portable folder. Click **Create vault** once. On later launches or after idle lock, click **Open vault**; no password is requested. The desktop vault lives in `%LOCALAPPDATA%\promteSaver\desktop-vault`, separate from the prior `%USERPROFILE%\.promtesaver-local` passphrase vault. Back up the complete desktop vault, including `desktop-credential.bin`, before changing Windows accounts or devices. In the native home screen choose a running app under **Text from app**, click **Start capture**, and approve the dialog. The home screen shows saved text with source and time, search, copy, capture state and Pause. Browser setup, login startup and optional wording review are under **More options**. Closing the window keeps the tray app running; use the tray's **Quit** action to stop it.

The optional **Start with Windows** checkbox is under **More options**. It is off by default and starts the locked app at sign-in; it does not approve a desktop app or reconnect browser capture. A stable installed path avoids a portable-folder move breaking this setting. Continuous all-day capture is not established: the vault locks after 15 idle minutes and capture approval is revoked on lock.

For an experimental desktop source, choose the running app in **Text from app**, click **Start capture** and review its consent dialog. Changed text in a focused editable field may then be saved after a 1.3-second pause, including pasted or dictated text **if that app exposes a supported accessibility change**. Any changed text can be saved, including non-prompts. Each save is labelled an editor `draft_snapshot`; the app does not know whether you sent it. Use **Pause this app**, **Pause all**, lock or Quit to stop. Approval is not restored after lock or restart. Browser pages, credential tools, password fields and unknown/protected controls are excluded from this native route. Only a synthetic WPF TextBox has been live-tested for typed and pasted text; voice input and other ordinary apps still need a pilot.

The older **Notepad pilot** remains under **More options** for comparison with the new app picker. It also saves editor drafts after keyboard activity and has one earlier Windows 11 typing/pause pilot. The main **Text from app** path is the current experimental desktop workflow; neither path verifies that text was submitted.

Codex transcript capture is disabled in the preview. Its local file format and private/protected-session signals have not been verified. Synthetic injected-directory tests exercise the producer without reading real user sessions.

For browser capture, load `browser-helper/` from the preview folder as an unpacked Chrome/Edge extension. In the native app select **ChatGPT**, **Claude** or **Gemini**, click **Connect browser**, copy the one-time code into the helper, then enable that same site and grant its permission. Test with harmless text and confirm a saved acknowledgement. The browser extension remains a separate component; neither a site permission nor capture starts on launching the app.

The native preview does not automatically rewrite prompts at the end of the day. **Review wording** under **More options** runs bounded offline spacing/repetition/punctuation checks only when clicked and leaves saved snapshots intact. Automatic AI grammar review and Grammarly-style suggestions in other apps remain planned. The default idle lock revokes capture approval. Native authenticated requests can renew an unlocked session; passive browser bridge saves do not. Unattended all-day capture is not established.

## What is implemented, and what is not

| Workflow | Implemented source | Verification / limit |
| --- | --- | --- |
| Windows desktop preview | Native WinForms executable, prompt-first home, one-click Windows-protected vault, private Node service, lock, tray pause/quit and secondary browser/wording options | Compiled and visually inspected with synthetic records; one isolated setup install and installed-path synthetic self-test passed; unsigned, no clean-device or actual uninstall result |
| Approved desktop editable field | Pick a running app, approve it in the unlocked window, save bounded focused editable text on change as an encrypted `draft_snapshot` with app attribution and a separate editable copy | Typed and pasted text saved in one synthetic WPF Windows app; its password field was excluded and Pause all stopped later saves. Other app frameworks, actual dictation and prolonged use are untested |
| Notepad keyboard-triggered source | Opt-in, active Notepad process check, protected-field exclusion, bounded UI Automation editor snapshot after typing pause, app attribution and immutable `draft_snapshot` | Native build, synthetic encrypted HTTP path, and one real Windows 11 Notepad typing/pause pilot pass; other versions and endurance are unverified |
| Codex desktop source | Experimental producer for new local `user_message` transcript events, disabled for real sessions | Real Windows filesystem watching on synthetic fixtures only; private/protected-session exclusions and actual Codex compatibility are unverified |
| Local prompt library | Encrypted payloads, search, projects, tags, templates, history, Trash, draft recovery, backup, writing profiles | Real storage/HTTP tests plus actual Chromium UI fixtures; not Windows/Mac device certified |
| Related prompt recall | From a draft in the vault editor, click **Find related saved prompts** to see local keyword matches with source context and add a chosen prompt to the draft | Explicit local action; no learned patterns, automatic suggestions or extension read access |
| Automatic browser capture | Opt-in send-click/Enter snapshots on known ChatGPT, Claude and Gemini composers; source host recorded | Real recorder code tested on synthetic DOM fixtures; real site layouts and installed MV3 extension remain unverified |
| Inline writing hints | Debounced local checks for repeated words, spaces, punctuation and missing output-format guidance | Limited English heuristics; no AI autocomplete, automatic replacement or system-wide popup |
| Groq AI | Explicit summary, prompt structuring, improvement and style-guided rewriting | Real request-building/backend tests with mocked provider; no real credential or live provider test here |
| Reviewed instruction extraction | Open AI assist on a saved prompt; review a source-bound understanding; separately preview/approve exact-quote candidates; choose task/project/personal scope and save selected copies | Synthetic provider/Chromium/HTTP tests; independent editable templates, not durable learned preferences or live provider validation |
| Related results and feedback | See local keyword/source context; copy exact wording or add an editable draft copy; explicitly correct the draft project; mark the saved revision worked, not useful or hidden | Feedback is encrypted and reversible; only Hidden suppresses recall. This does not learn preferences or measure success automatically |
| Capture receipts and gaps | Captured cards explain source method, quality, time and deletion; the view pages and searches older records; Settings offers reviewed age-based cleanup. Browser popup lists up to 20 content-free failed-save reasons for its current session | Unknown editors and actual message delivery remain unverified; no failed text is queued |
| Source preservation | Immutable saved snapshot plus separate editable copy and separate AI result; obvious sensitive matches may be redacted before persistence | Tested links, tombstones, backup restore and deletion; not a byte-for-byte original or proof of delivery |
| Universal desktop recording | Not implemented | The approved-app adapter depends on Windows UI Automation support and has no submission signal. VS Code/Cursor/terminal/Word, browsers, arbitrary typing and voice input have no acceptance result |
| Native installers / OS key protection / whole-DB encryption | Unsigned per-user setup preview plus portable folder / Windows CurrentUser DPAPI protects the vault wrapping secret / whole-DB encryption not implemented | Public release, Start Menu and uninstall acceptance gates remain open; the previous passphrase vault is not migrated |

A snapshot at a send action is **not proof of model delivery**. Capture is labelled `draft_snapshot`, never `exact_submitted`. Desktop field and Notepad snapshots are not send evidence at all. No whole-page history, full source URL, screenshot, audio, clipboard polling or raw key values are recorded.

## Run the source/browser fallback

Back up the **complete stopped-service vault folder** before upgrading. Extract into a new folder. Use a trusted Node.js **24.16 or newer within 24.x**. No production npm install is needed.

Windows: double-click **`start-windows.cmd`** in the extracted folder. It checks Node, runs from the correct folder and keeps startup errors visible. Keep its console window open while using the app; open the private browser address it prints. No PowerShell policy change is needed. Starting the app does not enable capture.

Alternatively, in PowerShell inside `promteSaver`, run the saved script (do not paste its contents):

```powershell
.\start-windows.ps1
```

macOS Terminal:

```sh
sh ./start-mac.command
```

Open the private `127.0.0.1` URL printed in the terminal. Keep the terminal running; stop with Ctrl+C. That URL contains a session capability: **never share it or include it in screenshots/support logs**. The default vault is `~/.promtesaver-local` (under your Windows user home too). It is not a public site or LAN/mobile service.

Node 22.16+ is an explicitly warned development-compatibility fallback, not the Windows preview runtime. The current native preview uses Node 24.16.0. See the test report for historical runs on other runtimes.

## Enable the browser companion deliberately

1. Load the portable preview's `browser-helper/` folder, or `apps/browser-helper` when using the source fallback, as an unpacked extension in Chrome or Edge developer mode. It is not a browser-store release.
2. Unlock the vault. In the native preview use **Connect browser**; in the source fallback use Settings. Generate a one-time pairing code and paste it into the extension popup.
3. Open a supported site, choose **Enable for this site**, approve that site's optional permission, and separately enable local hints if desired.
4. Test with nonsensitive sample text. The visible panel reports success or failure. The native preview shows recent saved snapshots; the source UI's **Captured** view contains that evidence and **Browser inbox** holds editable copies.

Pairing is write-only, bound to the extension origin, valid for at most eight hours and revoked on lock/restart/re-pair. **The vault's default 15-minute idle lock still applies; capturing does not silently disable or renew it.** When locked, stopped, unpaired, expired or unreachable, prompts are **not saved or queued**. Pause stops future attempts, not requests already accepted by the service. See [the pilot guide](docs/PILOT_GUIDE_V0_9.md) for the full acceptance checklist and known exclusions.

## Use Groq locally configured, never pasted into chat

In Settings, enter your own Groq API key on your computer and explicitly enable the connection. The key is encrypted in the vault, is never sent to the extension, and is excluded from portable backups. This build contains no real key. Default model: `llama-3.3-70b-versatile`; an available model ID can be chosen locally.

Open **AI assistant** or a prompt's **AI assist** action. Choose summarize, structure, improve or rewrite; optionally select a writing profile. Preview the exact messages, review redactions, approve the cloud send, then review the result. Saving creates a separate labelled AI draft. It never overwrites evidence or edits another app.

No cloud request happens just because a prompt was captured or someone typed. A request is rejected when text, profile, model, settings or unlocked session no longer match its preview. Raw writing examples are not sent by this integration. User-entered preferences may contain personal information: inspect the preview. Redaction is not a guarantee that all secrets are detected. Provider policies/charges apply; cancellation cannot withdraw a request already received by the provider.

## Documentation and source verification — 31 October 2026

All 61 Markdown documents now identify their current or historical scope. The core objective, priorities and status were aligned without changing application behavior. `npm run check` passed **190/190** tests on Windows/Node 24.18.0; demo, doctor and the synthetic reliability benchmark also passed. Local documentation links and the owner's preserved request were checked. No new complete app build, install, real-site capture, provider or Mac pilot was run. See the [dated test report](docs/TEST_REPORT_V0_9.md) for exact outputs and limits.

## Recorded implementation verification (through 27 October 2026)

- **Tested locally on Windows:** After approval, focusing existing text in a synthetic WPF editor saved nothing; changing it saved one draft. A synthetic read-only field did not save its canary. The earlier WPF pilot captured typing and paste, excluded its password field, and stopped after **Pause all**.
- **Source and build checks:** The latest recorded suite passed **190/190** tests after the ValuePattern fallback; an alternate native EXE compiled. The preceding bundled build passed its native self-test and verified 44 staged files, but the latest bundle attempt stopped at an open EXE lock. The earlier 5,000-record synthetic run measured distinct-query p95 182.01 ms, explicit recall p95 145.85 ms and Node-only sampled RSS 88.71 MiB. Those artifact and performance results do not validate a new installation of the final source.

- **Earlier Windows build:** the native self-test covered Windows-protected credential tamper/missing cases, wrong secret, lock/unlock and extracted ZIP relocation. Its 186-test check and 42-file staging count are historical.
- **Synthetic browser evidence:** **30/30** actual-UI fixture scenarios, **20/20** UI-to-temporary-local-service scenarios (one accelerated idle scenario is fixture-only), and **53/53** core UI/recorder scenarios passed in Chromium. The recorder's composer pages and provider are synthetic.
- **Unverified in real use:** actual Codex session format/private-mode exclusions, human-granted site permissions and capture on live ChatGPT/Claude/Gemini pages, a live Groq request, clean-device install/uninstall and whole-app resources on low-memory Windows/macOS devices. Chrome access later became available, but Browser Use blocked the extension setup URL by policy. No helper was installed or real prompt sent by this test; manual helper loading is needed before the live-site check can continue.
- **Windows login launch:** compiled, visible in a synthetic native window and present in the extracted portable package; changing the checkbox and reboot/login behavior have not been exercised. The current machine's setting remains off.
- **Not implemented:** real Codex transcript capture, guaranteed capture across arbitrary desktop apps, an end-of-day AI grammar pass, suggestions inside other apps, automatic capture resume after login, signed installer and macOS app.

The original v0.9 report and earlier local runs remain in [the dated test report](docs/TEST_REPORT_V0_9.md); their counts and blocked-browser results are historical, not the latest Windows outcome.

## Resource choices and observed limits

No new production npm dependencies, bundled model, provider SDK, polling recorder or DOM mutation observer. The native preview owns one local Node sidecar and stops it on Quit. Hints run at most after a 900 ms typing pause on an opted-in known composer. One AI call at a time, six per minute, 12 s timeout, bounded input/output and no automatic retries. The worker allows two in-flight local captures, no queue, a four-second timeout and bounded responses. The service caps bridge writes at 15/minute.

A 300-record Linux test measured **123.45 MiB sampled Node RSS**, **163.39 ms service readiness**, and **0.0% sampled idle CPU over four seconds**. This excludes the browser and is not peak memory or a zero-CPU guarantee. A separate 2,000-record Chromium fixture measured **554.53 MiB browser process-tree RSS**; not incremental extension memory or native WebView memory. No low-spec hardware guarantee or whole-app memory reduction is established.

## Data and upgrade boundaries

Key envelope stays v2. Portable snapshots are v3 without linked captures and v4 when capture/library links exist. v4 includes links and deletion evidence; imports accept v1-v4. Older releases cannot be assumed to restore v4 or preserve links. Do not downgrade an active vault; restore a separate pre-upgrade full-folder backup instead. Groq credentials are absent from portable snapshots but present encrypted in full-folder copies. Removing a saved key does not revoke it at the provider or erase old backups.

SQLite payloads use AES-256-GCM, but database structure/metadata are not fully encrypted. The native Windows preview protects its random vault wrapping secret with CurrentUser DPAPI; the older source/browser fallback still requires a user passphrase. Deletion does not prove physical erasure from SSDs or backups. See [privacy and security](docs/PRIVACY_AND_SECURITY.md).

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run test:core
python scripts/browser-smoke.py --mode fixture --output qa-baseline
python scripts/core-browser-tests.py --output qa-core
python scripts/browser-smoke.py --mode live --output qa-live
python scripts/extension-worker-check.py
```

Playwright, Chromium and psutil are development/testing tools, not application dependencies. The C# Windows preview is native compilation; the separate Tauri source is still uncompiled. Build and packaging limits are documented in [DESKTOP_BUILD.md](docs/DESKTOP_BUILD.md) and [Windows preview setup](docs/WINDOWS_DESKTOP_PREVIEW.md). Read [AGENTS.md](AGENTS.md) and [HANDOFF.md](docs/HANDOFF.md). Keep real vaults, credentials and runtime binaries out of source control. Distribution licensing and signed release remain maintainer decisions.
