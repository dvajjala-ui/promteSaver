# Explicit, local developer preview build. No downloads, installs, signing or release publishing.
[CmdletBinding()]
param([string]$NodeLicense)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The .NET Framework C# compiler is missing. No tools were installed.' }
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = (& $nodeExecutable -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^24\.(\d+)\.' -or [int]$Matches[1] -lt 16) { throw 'The Windows developer preview requires supported Node 24.16+ within 24.x.' }
$outputDirectory = Join-Path $sourceRoot '.local/windows-preview'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$bundled = -not [string]::IsNullOrWhiteSpace($NodeLicense)
if ($bundled) {
    $prepareScript = Join-Path $sourceRoot 'scripts/prepare-desktop.mjs'
    & $nodeExecutable $prepareScript --node-license $NodeLicense
    if ($LASTEXITCODE -ne 0) { throw 'Runtime staging failed. No native preview was rebuilt.' }
    foreach ($artifactName in @('runtime', 'binaries')) {
        $artifactOutput = [IO.Path]::GetFullPath((Join-Path $outputDirectory $artifactName))
        $outputPrefix = [IO.Path]::GetFullPath($outputDirectory) + [IO.Path]::DirectorySeparatorChar
        if (-not $artifactOutput.StartsWith($outputPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe preview output path.' }
        if (Test-Path -LiteralPath $artifactOutput) {
            if ((Get-Item -LiteralPath $artifactOutput -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlink/reparse output rejected.' }
            Remove-Item -LiteralPath $artifactOutput -Recurse -Force
        }
        Copy-Item -LiteralPath (Join-Path $sourceRoot ('apps/desktop/src-tauri/' + $artifactName)) -Destination $outputDirectory -Recurse -Force
    }
    $helperSource = Join-Path $sourceRoot 'apps/browser-helper'
    $helperOutput = [IO.Path]::GetFullPath((Join-Path $outputDirectory 'browser-helper'))
    $outputPrefix = [IO.Path]::GetFullPath($outputDirectory) + [IO.Path]::DirectorySeparatorChar
    if (-not $helperOutput.StartsWith($outputPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe browser helper output path.' }
    if (Test-Path -LiteralPath $helperOutput) {
        if ((Get-Item -LiteralPath $helperOutput -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlink/reparse browser helper output rejected.' }
        Remove-Item -LiteralPath $helperOutput -Recurse -Force
    }
    New-Item -ItemType Directory -Path $helperOutput | Out-Null
    foreach ($name in @('manifest.json', 'background.js', 'editor-core.js', 'recorder.js', 'popup.js', 'popup.html', 'popup.css', 'README.md')) {
        $sourceFile = Join-Path $helperSource $name
        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf) -or ((Get-Item -LiteralPath $sourceFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Browser helper source is missing or unsafe.' }
        Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $helperOutput $name)
    }
}
$configPath = Join-Path $outputDirectory 'PreviewConfig.cs'
if ($bundled) {
    $nodeArchitecture = (& $nodeExecutable -p 'process.arch').Trim()
    $runtimeTarget = switch ($nodeArchitecture) { 'x64' { 'x86_64-pc-windows-msvc' }; 'arm64' { 'aarch64-pc-windows-msvc' }; default { throw 'Unsupported Windows Node architecture.' } }
    $configSource = 'namespace PromteSaver.WindowsPreview { internal static class PreviewConfig { internal static string SourceRoot { get { return System.IO.Path.Combine(System.AppDomain.CurrentDomain.BaseDirectory, "runtime"); } } internal static string NodePath { get { return System.IO.Path.Combine(System.AppDomain.CurrentDomain.BaseDirectory, "binaries", "promtesaver-runtime-' + $runtimeTarget + '.exe"); } } } }'
} else {
    $configSource = 'namespace PromteSaver.WindowsPreview { internal static class PreviewConfig { internal const string SourceRoot = @"' + $sourceRoot.Replace('"', '""') + '"; internal const string NodePath = @"' + $nodeExecutable.Replace('"', '""') + '"; } }'
}
[IO.File]::WriteAllText($configPath, $configSource, [Text.Encoding]::UTF8)
$executable = Join-Path $outputDirectory 'promteSaver.exe'
$source = Join-Path $PSScriptRoot 'Program.cs'
$icon = Join-Path $sourceRoot 'apps/desktop/src-tauri/icons/icon.ico'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /warn:4 /out:$executable /win32icon:$icon /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.Security.dll $source $configPath
if ($LASTEXITCODE -ne 0) { throw "Native C# compilation failed with exit code $LASTEXITCODE." }
Copy-Item -LiteralPath $icon -Destination (Join-Path $outputDirectory 'promteSaver.ico') -Force
[IO.File]::WriteAllText(($executable + '.config'), '<?xml version="1.0" encoding="utf-8"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.7.2"/></startup><runtime><AppContextSwitchOverrides value="Switch.System.Windows.Forms.DoNotSupportSelectAllShortcutInMultilineTextBox=false"/></runtime></configuration>', [Text.Encoding]::UTF8)
Write-Output ('Built native Windows developer preview: ' + $executable)
if ($bundled) {
    [IO.File]::WriteAllText((Join-Path $outputDirectory 'READ-ME.txt'), "promteSaver native Windows portable developer preview`r`n`r`nOpen promteSaver.exe. Keep runtime/, binaries/, browser-helper/, the icon and config beside it.`r`nUses bundled supported Node $nodeVersion and Windows .NET Framework 4.7.2+. No browser or PowerShell window is needed.`r`n`r`nThis is an unsigned developer preview, not a tested consumer installer. Clean-device, distribution licensing, signing and native capture hardware acceptance remain open.`r`nThe Windows app creates a separate encrypted vault under LocalAppData/promteSaver/desktop-vault. A random vault secret is protected by Windows CurrentUser DPAPI; there is no passphrase prompt in the native window. The prior .promtesaver-local passphrase vault is not modified or imported. Back up the desktop vault before changing Windows accounts/devices; its protected credential cannot be used from a different account.`r`nCapture sources are off until explicitly approved after opening the vault. Closing minimizes to its visible tray; tray Quit stops the owned local service. The optional Start with Windows setting launches the visible app at sign-in but does not unlock or reconnect a capture site.`r`nFor browser capture, load browser-helper/ as an unpacked Chrome or Edge extension, select one AI site in the app, use Connect browser to pair, then approve the same site in the extension. Browser installation, site permission and real-site capture remain manual acceptance gates.`r`nSaved capture snapshots may redact obvious secrets before persistence and remain separate from offline wording suggestions. Codex and other desktop app capture are disabled in this preview.`r`n`r`nThe full Node distribution notices are in runtime/NODE-LICENSE.txt, retrieved from https://raw.githubusercontent.com/nodejs/node/v$nodeVersion/LICENSE.`r`nRuntime hashes in runtime/resource-manifest.json detect accidental alterations relative to that manifest; they are not a code signature.`r`n", [Text.Encoding]::UTF8)
    Write-Output ('Runtime: bundled supported Node ' + $nodeVersion + ' with full Node license. Native .NET Framework 4.7.2+ required. Portable unsigned preview; clean-device installability remains untested.')
} else {
    Write-Output ('Runtime: supported installed Node ' + $nodeVersion + '; source folder required. This is not a standalone installer or signed release.')
}
