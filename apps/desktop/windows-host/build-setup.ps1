# Unsigned per-user Windows setup preview. Build from a bundled, verified native folder.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$NodeLicense)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$preview = Join-Path $sourceRoot '.local/windows-preview'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The .NET Framework C# compiler is missing.' }
& (Join-Path $PSScriptRoot 'build-preview.ps1') -NodeLicense $NodeLicense
if ($LASTEXITCODE -ne 0) { throw 'The bundled Windows preview did not build.' }
& node (Join-Path $sourceRoot 'scripts/desktop-integrity.mjs')
if ($LASTEXITCODE -ne 0) { throw 'The bundled runtime did not verify.' }

$installerSource = Join-Path $PSScriptRoot 'Installer.cs'
$icon = Join-Path $preview 'promteSaver.ico'
$remove = Join-Path $preview 'promteSaver-Remove.exe'
$references = @('/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll', '/reference:System.IO.Compression.dll')
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /warn:4 /define:UNINSTALLER /out:$remove /win32icon:$icon $references $installerSource
if ($LASTEXITCODE -ne 0) { throw 'The removal helper did not compile.' }

$payload = Join-Path $sourceRoot '.local/promteSaver-setup-payload.zip'
$items = @('runtime', 'binaries', 'browser-helper', 'promteSaver.exe', 'promteSaver.exe.config',
    'promteSaver.ico', 'promteSaver-Remove.exe', 'READ-ME.txt')
$paths = foreach ($item in $items) {
    $path = Join-Path $preview $item
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing setup input: $item" }
    $path
}
Compress-Archive -LiteralPath $paths -DestinationPath $payload -CompressionLevel Optimal -Force
$setup = Join-Path $sourceRoot '.local/promteSaver-Setup.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /warn:4 /out:$setup /win32icon:$icon $references ('/resource:' + $payload + ',PromteSaver.Payload.zip') $installerSource
if ($LASTEXITCODE -ne 0) { throw 'The setup EXE did not compile.' }
Write-Output ('Built unsigned per-user setup preview: ' + $setup)
Write-Output ('Bytes: ' + (Get-Item -LiteralPath $setup).Length)
Write-Output ('SHA-256: ' + (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash)
