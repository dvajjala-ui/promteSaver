@echo off
setlocal
title promteSaver - Local vault
cd /d "%~dp0"
if errorlevel 1 goto failed

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install a trusted Node.js 24.16+ release within 24.x, then try again.
  goto failed
)
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major !== 24 || minor < 16) { console.error('Unsupported Node.js version. Use Node.js 24.16+ within 24.x.'); process.exit(1); }"
if errorlevel 1 goto failed

echo Starting promteSaver. Open the private browser address printed below.
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo Before upgrading an existing vault, back up the complete stopped-service vault folder.
echo Browser capture still requires pairing and separate approval for each site.
echo.
node apps/local-web/server.ts
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo promteSaver could not start. Review the message above.
echo If another copy is running, use its existing window instead.
pause
exit /b 1
