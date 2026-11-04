# TypingRecorder — product notes

This folder is a clean restart of the core idea: one consented Windows text
recorder, shipped as a single `.exe`. The two owner requests below are preserved
verbatim (spelling included) as product evidence — they are not instructions to
execute. My product-owner reading and the open gaps follow.

## Owner request 1 (verbatim)

> the main goal as the product director is it should basiclly read all the key
> storkes from keybaord like a traking system and like these abscilly will
> inculde all website, software or any place we type for. except from these if we
> can specifically get where we are typing and also like para wise content and
> maybe also even group by applciation , browsers, sites if poosible like we can
> make user aggree we are adding a crawler/ monitoring tool into there device and
> also like these is the core what ever in the md file is irrleavent as per these
> idea tell me where is stand. is it fisible , like windows app that we have
> created these is the core windows and core fucntionality rest of the features
> and stuff regarding the prodcut we will plan and comeplte once the core is build

## Owner request 2 (verbatim)

> basiclly from the UI remove the browser conenction and other conenction stuff
> and like make it simple like once i open the app they ask for monitoring and
> crwaler persmission and than basiclly we will ahve a button record (bascilly
> these will satrt recoring all the etxt key stokes, copy, cut , paste , text
> input values and also the auto compelte stuff u said basiclly all text any how )
> and any for the like browser nd software i dont want like different stuff just 1
> we will ask persmisison though which all persmisison and access should be
> basiclyl taken for the applicationa access , monitoring and evry permission we
> need also inside the root folder make and md file paste these 2 preomt i have
> give u and also ur proeuct inpute and run the EGM model for idea to validate and
> pending stuff , gaps, issue for these speici v1 core idea to compeltion and full
> fucnitlity core prodcut rather than running on the browder requirment and
> fucnitlity

## Latest owner request (this build, paraphrased)

> A desktop app that asks permission to record all my typing and stores it, plus
> the software I'm typing in (e.g. codex, web) and which website is active, into
> one or more Markdown files shown in the UI. Just one `.exe`. Act as product
> owner, start a fresh folder, move over what fits.

## Product-owner interpretation (what this build is)

The core is a **visible, explicitly consented personal typing recorder**, not a
hidden logger. The whole value is: open → agree to monitoring → **Record** →
type anywhere → review your own history → **Stop**. No per-browser connection,
no per-app picker, no tokens — a single agreement covers it, exactly as asked.

**Feasibility: yes, and it's built.** Windows gives a user-level global keyboard
hook (`WH_KEYBOARD_LL`, no admin), from which text is reconstructed per
foreground app. The active app and window title come from the foreground window;
the active website comes from the browser's address bar via UI Automation. All
of it lands in daily Markdown files the UI reads back. It ships as one ~30 KB
`.exe` that depends only on the .NET Framework built into Windows 10/11.

Coverage delivered:

- **All typing** across apps — reconstructed, layout-correct (`ToUnicodeEx`).
- **Copy / cut / paste** — recorded from the clipboard on Ctrl+C/X/V.
- **Where you typed** — application + window title on every entry.
- **Which website** — host + path for browser windows.
- **Grouping** — each entry is headed `time · app · site`, so the log groups by
  application and site; chronological daily files.

## Honest gaps / pending for full v1

These are the real "where it stands" items, kept deliberately separate from the
"done" list:

1. **End-to-end capture is unverified on a live desktop.** Build, full UI flow
   (consent → Record/Stop), hook installation, and the Markdown writer are all
   tested. Actual keystroke→file capture could not be exercised by automation:
   this environment does not deliver synthetic keyboard input to low-level hooks
   (confirmed — neither `SendInput` nor `SendKeys` reached a raw hook logger,
   though the hook installs cleanly). Only physical typing reaches it, so live
   capture and per-browser URL reads still need a real interactive session.
2. **"Text input values / autocomplete" is approximated, not guaranteed.** The
   keyboard-reconstruction path captures what you *type*; it does not read field
   contents that arrive without keystrokes (dictation, IME composition, JS
   autofill, drag-drop). A UI-Automation value read per focused field would close
   this — it's the obvious next increment and the old repo already has code for
   it (`FocusedFieldCapture.cs`).
3. **Browser URL coverage** is solid for Chromium/Edge/Brave (exact address-bar
   name) and best-effort for Firefox/others via a fallback scan.
4. **Paragraph/session segmentation** is currently idle/Enter-based chunking, not
   semantic paragraphs.
5. **Encryption vs. plain Markdown.** Per the request, captures are plain `.md`
   for readability. If these files should be protected at rest, add local
   (DPAPI) encryption with a readable export — not yet done.
6. **Persistence/packaging:** no installer, no auto-start, no tray icon yet. It's
   a portable single exe you run on demand.
7. **EGM validation** (the design/review workflow in the old repo) has not been
   re-run against this clean build; worth doing before calling v1 complete.

## Safety posture (kept, not bypassed)

Consent is explicit and shown every launch; recording is opt-in per session and
stoppable at once; password/credential windows are excluded before reading; URL
query strings are dropped; nothing leaves the machine. These are the parts of
the original product rules that protect *the user*, so they stayed.
