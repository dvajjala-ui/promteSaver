# Builds TypingRecorder.exe as a single Windows executable using the in-box
# .NET Framework C# compiler. No SDK, NuGet, or project file required.
# Output depends only on .NET Framework 4.x, which ships with Windows 10/11.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) {
    $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $csc)) { throw 'The .NET Framework C# compiler (csc.exe) was not found.' }

# UI Automation client assemblies live next to csc, under WPF\.
$uia = Join-Path (Split-Path $csc -Parent) 'WPF'
$uiaTypes  = Join-Path $uia 'UIAutomationTypes.dll'
$uiaClient = Join-Path $uia 'UIAutomationClient.dll'
foreach ($dll in @($uiaTypes, $uiaClient)) {
    if (-not (Test-Path -LiteralPath $dll)) { throw "Required UI Automation assembly missing: $dll" }
}

$src      = Join-Path $PSScriptRoot 'src'
$manifest = Join-Path $src 'app.manifest'
$out      = Join-Path $PSScriptRoot 'TypingRecorder.exe'
$files    = Get-ChildItem -LiteralPath $src -Filter *.cs | ForEach-Object { $_.FullName }

$refs = @(
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    ('/reference:' + $uiaTypes),
    ('/reference:' + $uiaClient)
)

Write-Host "Compiling TypingRecorder.exe ..."
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /warn:4 `
    ('/win32manifest:' + $manifest) ('/out:' + $out) @refs @files
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

$item = Get-Item -LiteralPath $out
Write-Host ''
Write-Host ('Built: ' + $out)
Write-Host ('Size : ' + [math]::Round($item.Length / 1KB, 1) + ' KB')
Write-Host ('SHA256: ' + (Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash)
