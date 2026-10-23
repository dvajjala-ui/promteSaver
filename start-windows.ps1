# Run from the source root. No npm install, GitHub access or background recorder required.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
try {
  $version = (& node -p 'process.versions.node').Trim()
  $parts = $version.Split('.')
  $major = [int]$parts[0]; $minor = [int]$parts[1]
} catch { Write-Error 'Install a trusted Node.js 24.16+ release within 24.x, then run again.'; exit 1 }
$appVersion = (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "promteSaver $appVersion - Back up the complete stopped-service vault folder before upgrading." -ForegroundColor Yellow
if ($major -eq 24 -and $minor -ge 16) {
  & node apps/local-web/server.ts
} elseif ($major -eq 22 -and $minor -ge 16) {
  Write-Warning 'Node 22 compatibility mode: development only; target Windows/Mac Node 24 checks remain required.'
  & node --experimental-strip-types apps/local-web/server.ts
} else { Write-Error 'Unsupported runtime. Use Node 24.16+ within 24.x (Node 22.16+ is development compatibility only).'; exit 1 }
exit $LASTEXITCODE
