# TypingRecorder

A visible, consent-first Windows text recorder in a **single `.exe`**.

You press **Record**. From then until you press **Stop**, it reconstructs the
text you type across your applications and writes it to plain **Markdown files**
on your own PC. For every block of text it also saves:

- the **application** you typed in (e.g. `chrome.exe`, `Code.exe`),
- the **window title**, and
- the **active website** (host + path) when that application is a browser.

Copy / cut / paste text is recorded too. You review everything in the app's
**Library** tab, which reads the Markdown files directly.

Nothing is uploaded. There is no network code in the app.

## Build (one exe)

Requires Windows 10/11 (the .NET Framework it uses is built into Windows — no
SDK or install needed).

```bat
build.cmd
```

or

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

This produces `TypingRecorder.exe` (~30 KB) next to the script. Copy that one
file anywhere and run it.

## Use

1. Run `TypingRecorder.exe`.
2. Read the monitoring agreement and click **Agree & continue**.
3. Click **Record**. The dot turns red and the header shows the app/site you are
   currently typing in.
4. Type in any app. Captured blocks stream into the **Live** tab and are saved.
5. Open the **Library** tab to read the saved Markdown (one file per day).
6. Click **Stop** to end recording. **Open data folder** shows the files.

Captures are saved under:

```
Documents\TypingRecorder\captures\YYYY-MM-DD.md
```

## What it deliberately does *not* do

- It never starts recording on its own — only after you press Record.
- **Password and Windows credential windows are skipped** before any text is
  read (so secrets aren't recorded). Password-manager windows are skipped too.
- URL **query strings and fragments are dropped** — only scheme/host/path are
  stored — so tokens some sites put in the URL aren't written to disk.
- No upload, no cloud, no telemetry, no AI inference.

## How it works (files in `src/`)

| File | Role |
| --- | --- |
| `GlobalKeyboardCapture.cs` | Low-level keyboard hook (`WH_KEYBOARD_LL`); reconstructs typed text per app with `ToUnicodeEx` (layout-correct). Reports copy/cut/paste as clipboard events. |
| `ActiveContext.cs` | Background poller for the active app, window title, and — for browsers — the address-bar URL via UI Automation. |
| `MarkdownStore.cs` | Writes daily Markdown files; wraps captured text in a backtick fence sized so untrusted text can't break the document. |
| `Program.cs` | WinForms UI: consent dialog, Record/Stop, live feed, file-backed library. |

## Status

Verified here (with automated UI Automation driving):

- Builds to a single `TypingRecorder.exe` with the in-box compiler.
- Full UI flow works: consent dialog → **Agree and continue** → main window →
  **Record** toggles to **Stop**. Pressing Record installs the global keyboard
  hook with no error (`SetWindowsHookEx` returns a valid handle).
- Markdown writer verified with real data, including the dynamic backtick-fence
  that stops captured text (even text containing ```` ```` ) from breaking the
  document.

Two bugs were found and fixed during verification:

- Controls exposed only as generic `Pane` to accessibility tools — added the
  Common-Controls v6 manifest dependency so visual styles and proper UI
  Automation roles apply.
- The consent button label "Agree & continue" had its `&` eaten as a WinForms
  mnemonic (rendered "Agree  continue") — changed to "Agree and continue".

**Not yet confirmed — needs real physical typing:** live keystroke → Markdown
capture could not be exercised in this automated environment because it does not
deliver *synthetic* keyboard input (tested: neither `SendInput` nor WScript
`SendKeys` reached a low-level keyboard hook, though the hook installs fine).
Only physical keystrokes reach the hook. Browser-URL reads (per browser family)
and clipboard copy/cut/paste capture are unconfirmed for the same reason.

To confirm it yourself in ~20 seconds: run the exe, Agree, press **Record**,
physically type a sentence in Notepad/VS Code/a browser and press Enter, then
open the **Library** tab (or **Open data folder**) — your text should appear in
today's `.md` file, tagged with the app and site.
