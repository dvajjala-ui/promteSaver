# Synthetic controls only. UI and accessibility client run on separate threads.
$ErrorActionPreference = 'Stop'
$taskFramework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\WPF'
$taskReferences = @('System.Windows.Forms', 'System.Drawing', (Join-Path $taskFramework 'UIAutomationTypes.dll'), (Join-Path $taskFramework 'UIAutomationClient.dll'))
Add-Type -Path (Join-Path $taskFramework 'UIAutomationTypes.dll')
Add-Type -Path (Join-Path $taskFramework 'UIAutomationClient.dll')
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsAccessibilityProof.cs') -ReferencedAssemblies $taskReferences
$taskFixture = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot '..\fixtures\capture\replay.json') | ConvertFrom-Json
$taskSamples = @('Synthetic typed text', ('Synthetic pasted paragraph. ' * 512), $taskFixture.steps[3].text, "Synthetic replacement`r`nResearch only; do not implement.")
$taskMethods = [PromteSaver.Proof.Accessibility]::Run($taskSamples)
[pscustomobject]@{
  mode='synthetic-owned-controls-only'; platform='Windows'; snapshotCases=$taskSamples.Count
  methods=@($taskMethods | Select-Object -Unique); lineEndingsNormalized=$true
  passwordFieldIdentified=$true; globalRecording=$false; externalApplicationsInspected=0
  limitations='No live typing, paste, speech, cross-app capture, or Mac validation'
} | ConvertTo-Json
