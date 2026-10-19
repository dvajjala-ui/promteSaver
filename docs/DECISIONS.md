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

## Open decisions

- Product branding and public source licence; no licence for original Pomte code has been selected.
- Exact Windows/macOS version and architecture support after testing.
- Cloud vendor, region, authentication system, staging deployment, and operating budget.
- AI provider, models, embedding dimensions, data handling settings, and daily limits.
- Retention defaults and whether additional draft/raw observations sync or remain device-local.
- Native dependency choices after M0, especially event observation, secret storage, encryption packaging, and insertion.
- Automatic project attribution confidence thresholds and user correction behavior.

Do not require answers to every open decision before starting M0. Resolve each when it affects the next concrete milestone. Log changed decisions with date, evidence, and migration implications rather than silently editing the product's direction.
