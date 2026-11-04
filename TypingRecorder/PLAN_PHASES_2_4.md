# Phases 2–4 — de-conflicted build plan

Produced by a parallel design workflow (7 agents: 3 designers → 3 adversarial
reviewers → 1 integrator). All three phases are **feasible inside the single
native `.exe`** (no SQLite / NuGet / Node). Detailed per-module APIs and core
logic live in the workflow output; this file is the build order + decisions.

## Verdicts

| Phase | Feasibility | Single-exe safe | C# 5 safe | Notes |
| --- | --- | --- | --- | --- |
| P2 field capture | needs-changes | ✅ | ✅ | namespace + IPC-codec + Enter-semantics fixes |
| P3 library | needs-changes | ✅ | ❌ → must fix | design used modern C#; port to C# 5 |
| P4 lifecycle | needs-changes | ✅ | ✅ | missing `app.ico` build blocker; autostart hidden-handle fix |

## New modules (20 files)

**Independent (no `Program.cs` edits — parallelizable):**
- P2: `WorkerProtocol.cs`, `FocusedFieldReader.cs`, `FieldWorkerHost.cs`, `ClipboardWatch.cs`
- P3: `CaptureEntry.cs`, `AiSites.cs`, `BoundedTopK.cs`, `CaptureParser.cs`, `CaptureOverlayStore.cs`, `CaptureQuery.cs`, `CaptureIndex.cs`
- P4: `TrayController.cs`, `StartupManager.cs`, `ExclusionStore.cs`, `ExclusionsForm.cs`, `SingleInstanceGuard.cs`, `setup/Installer.cs`

**Coupled (wired into `Program.cs`, serial):**
`FieldSnapshotClient.cs` (P2), `CaptureReconciler.cs` (P2), `LibraryPanel.cs` (P3)

**Build order among the independent modules** (later batch depends on earlier):
1. Leaves: WorkerProtocol, FocusedFieldReader, ClipboardWatch, CaptureEntry, AiSites, BoundedTopK, TrayController, StartupManager, SingleInstanceGuard, setup/Installer
2. FieldWorkerHost, CaptureParser, CaptureOverlayStore, CaptureQuery, ExclusionStore
3. CaptureIndex, ExclusionsForm
4. LibraryPanel (needs the index)

## `Program.cs` wiring order (serial — one shared hub)

0. **Prereq (outside the serial window):** add `assets/app.ico` + setup `READ-ME.txt` (else `build.ps1`'s `/win32icon` fails CS1566 for everyone).
1. **P2 owns `Main`:** `static void Main()` → `static int Main(string[] args)`; first line dispatches `--field-worker` to `FieldWorkerHost.Run()`.
2. P2 MainForm fields + ctor: reconciler, fieldClient, clipboard.
3. P2 write-path: `OnChunk → reconciler.FeedKeystroke(...)`; copy/cut via ClipboardWatch; paste folds into the field session.
4. P2 lifecycle: Start/Stop also start/stop clipboard + field worker (worker failure **non-fatal** — keystrokes still record).
5. **P4 Main** (builds on P2's int Main): `--autostart`; replace inline mutex with `SingleInstanceGuard`.
6. P4 `GlobalKeyboardCapture` ctor gains a `Func<string,bool> userExcluded` OR'd into the skip test.
7. P4 consent + tray gating; `SetVisibleCore` hidden under autostart but force handle creation (so writer/clipboard BeginInvoke don't throw).
8. P4 exclusion enforcement at the top of every reconciler feed (the P2×P4 seam).
9. P4 `build.ps1` adds `/win32icon` (after step 0).
10. **P3 last** (it deletes shared members): thread `When` through `WriteQueue`'s callback.
11. P3 BuildUi: replace the Library tab's SplitContainer with `LibraryPanel`.

## Decisions (made as product owner)

- **Search index:** rebuildable in-RAM metadata+preview index over the immutable daily `.md`, with a sidecar `index/overlay.tsv` for pinned / soft-deleted / open-count. **No SQLite / embedded DB** (keeps the single-exe model). ✅
- **Permanent delete:** overlay **tombstone** (hides the entry; the `.md` evidence stays immutable). A real erase-from-disk can be an explicit, logged option later. ✅
- **IME/CJK:** the UIA field path captures IME/paste/autocomplete as **draft snapshots** that supersede the keystroke reconstruction, with a length sanity-gate. Full system-wide IME beyond that stays deferred. ✅
- **Signing/distribution:** the per-user installer is **unsigned** for now (will trip SmartScreen; two global hooks + a hidden child also look malware-ish to AV). Code signing is a later, explicit distribution step. ✅ (flagged)
- **Branding:** placeholder `app.ico` + placeholder Publisher/DisplayVersion now; finalize at distribution. ✅

## Open — need owner confirmation (behavior / policy)

1. **Enter semantics (P2):** session grouping makes an entry appear on ~4 s idle instead of per-Enter, collapsing a multi-message chat/AI-prompt burst into one delayed entry — a visible change from today. Proposed: **soft-break default** (Enter = newline within a session), configurable.
2. **Consent under tray residency (P4):** a tray-resident/autostart app shifts consent from *every launch* (today, per AGENTS.md) to *once per resident lifetime*, re-consent after lock/quit. Proposed: accept that, re-consent on unlock.
3. **Auto-stop on Windows lock / sign-out (P4):** recommended for privacy — include it?
