# Decision log

Planning snapshot: 19 October 2026. “Accepted direction” comes from the conversation; “proposed” is an implementation recommendation that can change with evidence.

| ID | Decision | Status | Reason / revisit trigger |
| --- | --- | --- | --- |
| D01 | Windows and Mac first; mobile later | Accepted direction | Desktop feasibility is the immediate focus. |
| D02 | Installed collector plus website; local operation without internet | Accepted direction | Daily work must not depend on network availability. |
| D03 | Broad permitted recording remains a primary collection source | Accepted direction | User explicitly wants automatic daily collection across tools. |
| D04 | Supplement events with editor snapshots and integrations | Proposed | Key events alone cannot establish final text or submission. Measure in M0. |
| D05 | Preserve retained sources separately from interpretation | Accepted direction | Re-analysis and exact historical reuse must remain possible. |
| D06 | Separate understanding from generalization | Accepted direction | Some information is reusable globally; some belongs only to a project. |
| D07 | Tauri 2 + Rust + React/TypeScript | Proposed | Native collector with a shared desktop interface. Revisit only if the platform spike exposes material problems. |
| D08 | SQLCipher local archive, OS-protected key storage | Proposed | Encrypt searchable local records. Cross-platform build and leakage tests are an early gate. |
| D09 | Next.js web/API, TypeScript worker, PostgreSQL | Proposed | Small initial service footprint; separate ingestion from AI jobs. |
| D10 | Add pgvector alongside keyword search | Proposed | Historical semantic retrieval should coexist with exact matching. |
| D11 | Transactional outbox, idempotent operations, cursors, tombstones | Proposed | Offline sync and deletion need explicit semantics. |
| D12 | Independent core with release-specific dependency review | Proposed | Preserve product flexibility; public source does not remove licence obligations. |
| D13 | Local picker first; live suggestions expand by measured surface | Proposed | Deliver reuse early while avoiding unsupported inline-completion claims. |
| D14 | No automatic prompt submission | Proposed v1 boundary | Insertion should not execute an unintended task. |
| D15 | Server-side AI reads authorized synced content | Proposed cloud mode | Do not market this mode as server-blind E2EE. Local inference is a future option. |
| D16 | Minimal deterministic exclusions before persistence/upload | Proposed necessary design | Filtering after upload does not remove material already disclosed. |
| D17 | No screenshots, continuous audio, mobile keyboards, or team surveillance in v1 | Proposed scope boundary | Concentrate resources on text collection and reuse. |
| D18 | Planning and handoff documents published to the user's repository | User requested | Enable implementation in a new chat without relying on conversation history. |
| D19 | Use Node/TypeScript and encrypted-record SQLite for the first executable synthetic harness | Implemented prototype, 19 October 2026 | Node is available; Rust/native encryption packaging is unverified. This does not replace the planned Rust collector or claim SQLCipher encryption. Revisit before retaining real typing. |
| D20 | Use a separate UI thread for the owned-control Windows accessibility experiment | Verified on synthetic Windows controls | The same-thread probe exposed no readable pattern; the threaded probe read `TextPattern`. General application coverage remains unproven. |

## Open decisions

- Product branding and public source licence; no licence for original Pomte code has been selected.
- Exact Windows/macOS version and architecture support after testing.
- Cloud vendor, region, authentication system, staging deployment, and operating budget.
- AI provider, models, embedding dimensions, data handling settings, and daily limits.
- Retention defaults and whether additional draft/raw observations sync or remain device-local.
- Native dependency choices after M0, especially event observation, secret storage, encryption packaging, and insertion.
- Automatic project attribution confidence thresholds and user correction behavior.

Do not require answers to every open decision before starting M0. Resolve each when it affects the next concrete milestone. Log changed decisions with date, evidence, and migration implications rather than silently editing the product's direction.

## 22 October 2026 — local-value-first implementation decisions

| ID | Decision | Status | Rationale / limits |
| --- | --- | --- | --- |
| D20 | Ship an explicitly saved, local prompt/template library before cloud and AI | Implemented preview | Creates a real user workflow without unproven capture or backend costs; broad recorder direction remains planned |
| D21 | Use a zero-production-package Node built-in loopback service with vanilla HTML/CSS/JS for the local preview | Implemented preview | Offline prototyping and low dependency churn; **not** the future signed native architecture |
| D22 | Keep editable library items separate from immutable captured PromptRecord evidence | Implemented | User edits should not counterfeit original provenance or quality |
| D23 | Only complete direct submission-hook text may be labelled `exact_submitted` | Implemented | A previous snapshot plus an inferred submit signal is not sufficient proof |
| D24 | Replace AJV runtime dependency with a fail-closed, checked-in-schema **subset** validator | Implemented, review at schema expansion | Enables local preview without npm networking; consciously does not claim general JSON Schema compatibility |
| D25 | Password-derived AES record storage with ephemeral loopback auth is an *interim* vault | Implemented, security caveats | SQLCipher, OS keychain, backup/migration review are release blockers; not full-database encryption |
| D26 | Browser helper uses explicit user click + activeTab allowlist, no background script | Implemented, compatibility unverified | Privacy-first stepping stone; no claim of universal or passive capture |
| D27 | No cloud inference, telemetry, or sync by default | Implemented | Validate user value and scope first; scope remote processing separately |
| D28 | Tauri 2 + Rust native shell remains the preferred hypothesis, not a completed migration | Proposed | Profile startup, RAM, capture OS permissions and platform stability before confirming |
