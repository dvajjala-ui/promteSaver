# v0.9 evidence index

Final acceptance evidence is all-tests.tap, core-tests.tap, worker-unit.tap, source-checks.txt, typecheck.txt, environment.json and the two browser report directories linked by TEST_REPORT_V0_9.md. Empty typecheck output means the command exited successfully without diagnostics. Node and Chromium resource profiles are separate fixtures, not a combined installed-app memory test.

core-first.tap and bridge-initial.tap are early development failures retained for transparency; they were superseded by passing final regressions. Unresolved integration failures are explicitly retained in live-probe/report.json, blocked-site-fixture-probe.log and extension-worker.json. Do not count these as passes. No real credentials, native builds or live provider responses are included.
