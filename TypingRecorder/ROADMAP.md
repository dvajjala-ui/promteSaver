# TypingRecorder — product roadmap

TypingRecorder is the single concrete base. Features attach to it one layer at a
time: **attach → build → verify**, never faking what isn't proven. This file is
the living plan; it is updated as phases land.

## North Star (owner's vision, distilled)

A **sellable Windows app** that quietly records the **text you type** with the
**app** and **website** it belongs to, **auto-saves** it, lets you **find and
reuse** it, optionally **cleans up grammar at end of day** (keeping the raw), and
**Grammarly-style** surfaces a past prompt when a similar one recurs — with
everything non-core kept behind a clearly-labelled "Coming soon" area.

## Locked decisions (4 Nov 2026)

1. **Architecture: one native `.exe`, no localhost/Node service.** Features are
   re-implemented in C# in the single binary; the old TypeScript/Node stack is a
   *reference to port from*, not a runtime to revive. Rationale: simplest,
   lowest-footprint, most sellable, and matches the owner's explicit rejection of
   a "localhost type of thing."
2. **First focus: Phase 1 — trust the core**, validated across real apps
   (browsers, Microsoft Teams, Claude Code, Codex, VS Code). Synthetic keystroke
   injection does not reach low-level hooks, so real-world proof needs physical
   typing + an in-app coverage view.
3. **Storage: readable Markdown now** (one file per day, monthly folders),
   a rebuildable search index at Phase 3, optional DPAPI encryption at Phase 5
   with readable export. Text is tiny; storage growth is a non-issue (a heavy
   *year* of typing is well under ~0.5 GB of plain text).

## Cross-cutting guardrails (apply to every phase)

- Consent + always-visible recording state; nothing captured until Record.
- Password / credential / system windows excluded before any text is read.
- Local-only by default; no network code unless a phase explicitly adds opt-in AI.
- Measured CPU/RAM budgets; captured text treated as untrusted data.
- Honest **tested vs untested** labelling in every handoff.

---

## Phases

### Phase 0 — Base ✅ (done)
Consent → Record → capture typing + app + site → Markdown → review → Stop.

### Phase 1 — Trust the core
- **1.1 Coverage/diagnostics view** — live "capturing vs skipped (why)" per app,
  session counters, so cross-app testing produces real evidence. *(in progress)*
- 1.2 First real-typing evidence across browsers, Teams, Claude Code, Codex, VS Code.
- 1.3 Keystroke robustness: IME/CJK composition, dead keys, AltGr, fast typing.
- 1.4 Foreground edge cases: app-switch mid-type, lock screen, multi-monitor.
- 1.5 Secret redaction before write ✅ (ported `packages/capture-core/redact.ts`
  → `src/Redaction.cs`; unit-tested, wired into the capture path).
- 1.6 Measured CPU/RAM over a long session; URL poller + writes never hitch typing.

### Phase 2 — "All text, any how"
- 2.1 Verified clipboard capture on copy/cut/paste (hook events already wired).
- 2.2 UIA field-value snapshots via an out-of-process worker — capture pasted /
  autocompleted text that never came from keystrokes.
- 2.3 Reconcile keystroke text vs field snapshot (no double-recording).
- 2.4 Paragraph/session grouping (one editing session = one entry).
- *Reuse:* `apps/desktop/windows-host/{MonitoringCapture,FocusedFieldCapture}.cs`.

### Phase 3 — A library you actually use
- 3.1 Fast search across captures; 3.2 filter/group by app, site, day.
- 3.3 **AI-prompt tagging** (chatgpt.com, claude.ai, gemini…) as a first-class filter.
- 3.4 Entry actions: copy, open, delete-with-undo, pin; 3.5 virtualized large lists.
- *Reuse:* `packages/local-store/top-k.ts`, browser-helper AI-site list.

### Phase 4 — A real, sellable desktop app
- 4.1 Tray icon + status + quick Record/Stop; 4.2 start-with-Windows (off by default).
- 4.3 Close-vs-Quit, minimize-to-tray, single-instance; 4.4 user exclusions UI.
- 4.5 Per-user installer, Start Menu, uninstall that keeps or offers to wipe data.
- *Reuse:* `Installer.cs`, `build-setup.ps1`, tray/pause from old `Program.cs`.

### Phase 5 — Privacy & data control
- Optional local encryption at rest (DPAPI-wrapped, readable export) · backup/import
  · trash/restore + retention · lock / idle-lock.
- *Reuse:* `apps/local-web/key-envelope.ts`, `packages/local-store/archive.ts`.

### Phase 6 — End-of-day review (grammar)
- Offline-first proofreading (no model needed) · optional cloud AI **off by default**
  (local key, per-request preview + consent, limits/cancel) · raw kept separate.
- *Reuse:* `packages/writing-style/proofread.ts`, `apps/local-web/ai.ts`.

### Phase 7 — Reuse / recall ("Grammarly for prompts")
- Keyword recall · "similar to what you're typing" suggestion (explicit, never
  auto-insert) · reusable templates.
- *Reuse:* `apps/local-web/{recall via server.ts, refinement.ts}`, `top-k.ts`.

### Phase 8 — "Coming soon" shell
- Clearly-labelled area for deferred work: sync, macOS, mobile, learned preferences.

---

## Status log

- **2026-11-04** — Phase 0 complete (base committed to `main`). Roadmap locked.
  Phase 1.1 (coverage/diagnostics) and Phase 1.5 (secret redaction) landed.
