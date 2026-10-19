# M0 dependency inventory

Recorded 19 October 2026. Versions are pinned in `package.json` and resolved with integrity hashes in `package-lock.json`. Registry metadata and installed top-level licence texts were inspected for the packages below. This is an inventory, not a completed distribution audit.

| Package | Version | Role | Declared licence |
| --- | --- | --- | --- |
| Node.js | 24.16.0 tested | User-installed runtime; SQLite, crypto, test runner | Runtime distribution notices remain with Node; not bundled by this prototype |
| ajv | 8.20.0 | JSON Schema validation | MIT |
| fast-deep-equal | 3.1.3 | AJV dependency | MIT |
| fast-uri | 3.1.8 | AJV dependency | BSD-3-Clause |
| json-schema-traverse | 1.0.0 | AJV dependency | MIT |
| require-from-string | 2.0.2 | AJV dependency | MIT |
| typescript | 7.0.2 | Development type checking | Apache-2.0 |
| @typescript/typescript-* | 7.0.2 | TypeScript platform binaries in the lockfile | Apache-2.0 per package metadata |
| @types/node | 24.19.2 | Development typings | MIT |
| undici-types | 7.24.6 | Typings dependency | MIT |

No external recording/memory repository code was copied. The Windows proof is original C# using the OS-provided .NET Framework UI Automation and WinForms assemblies; it is not a production native collector.

Before packaging an installer, review all shipped components and full licence/notice texts again, including native libraries and the chosen Rust/SQLite encryption backend. Source licence for original promteSaver code is still unselected; `private: true` prevents accidental npm publication.

`npm audit --omit=dev --audit-level=high` reported zero known production dependency vulnerabilities during the local verification. Hosted audits and their results can change; they do not establish application security.
