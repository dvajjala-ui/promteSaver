# Writing Studio synthetic benchmark

> **Documentation scope (31 October 2026): Historical evidence.** Preserve the recorded environment and outcomes. These results do not certify the current build, another device or a real third-party source. [Core objective](../../CORE_OBJECTIVE.md) | [Documentation index](../../DOCUMENTATION_INDEX.md)

Run on the source runtime with `node --experimental-strip-types scripts/bench-writing.ts 40` (Node 22 compatibility) or `npm run bench:writing` (supported Node 24 runtime). Inputs are synthetic; the script does not access any saved profile, key, vault, browser, service or external resource.

The recorded values are standalone Node-process microbenchmarks: they do not include WebView/Chromium, cold starts, request/response latency, browser DOM work or native OS overhead. The sample file preserves the run results and limitations.
