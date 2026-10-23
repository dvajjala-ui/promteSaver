#!/bin/sh
# Runs the local app. Use a trusted supported Node runtime; no npm install is required.
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf 'Install a trusted Node.js 24.16+ release within 24.x, then run again.\n' >&2
  exit 1
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
minor="$(node -p 'process.versions.node.split(".")[1]')"
app_version="$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json","utf8")).version')"
printf 'promteSaver %s - Back up the complete stopped-service vault folder before upgrading.\n' "$app_version"
if [ "$major" -eq 24 ] && [ "$minor" -ge 16 ]; then
  exec node apps/local-web/server.ts
elif [ "$major" -eq 22 ] && [ "$minor" -ge 16 ]; then
  printf 'Node 22 development compatibility mode; target Windows/Mac Node 24 checks remain required.\n' >&2
  exec node --experimental-strip-types apps/local-web/server.ts
fi
printf 'Unsupported runtime. Use Node 24.16+ within 24.x.\n' >&2
exit 1
