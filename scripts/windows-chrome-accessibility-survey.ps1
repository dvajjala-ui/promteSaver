# Read-only Chrome/ChatGPT feasibility check. Focus a harmless new test composer first.
# The console output contains fixed status labels only; it never emits page text.
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
$uia = Join-Path $framework 'WPF'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'Windows .NET Framework compiler is unavailable.' }
$source = Join-Path $PSScriptRoot 'WindowsChromeAccessibilitySurvey.cs'
$outputDirectory = Join-Path $PSScriptRoot '..\.local'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$output = Join-Path $outputDirectory 'windows-chrome-accessibility-survey.exe'
$uiaTypes = Join-Path $uia 'UIAutomationTypes.dll'
$uiaClient = Join-Path $uia 'UIAutomationClient.dll'
& $compiler /nologo /target:exe /platform:anycpu /optimize+ /out:$output `
  /reference:System.dll /reference:$uiaTypes /reference:$uiaClient $source
if ($LASTEXITCODE -ne 0) { throw 'Accessibility survey compilation failed.' }
& $output @args
exit $LASTEXITCODE
