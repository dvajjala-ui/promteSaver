import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

test('actual Windows host rejects stale recording errors and bounds stalled response bodies', {
  skip: process.platform !== 'win32', timeout: 45_000,
}, async () => {
  const framework = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = join(framework, 'csc.exe');
  const assemblies = ['UIAutomationTypes.dll', 'UIAutomationClient.dll'].map(name => join(framework, 'WPF', name));
  assert.ok([compiler, ...assemblies].every(existsSync), 'Windows .NET Framework compiler/UIA references must exist');
  const workspace = realpathSync(resolve('.'));
  mkdirSync(join(workspace, '.local'), {recursive: true});
  const outputRoot = realpathSync(join(workspace, '.local'));
  const directory = mkdtempSync(join(outputRoot, 'monitoring-ui-test-'));
  let scenarioError;
  try {
    const executable = join(directory, 'monitoring-ui-harness.exe');
    const config = join(directory, 'PreviewConfig.cs');
    const literal = value => '@"' + value.replaceAll('"', '""') + '"';
    writeFileSync(config, 'namespace PromteSaver.WindowsPreview { internal static class PreviewConfig {' +
      'internal const string SourceRoot = ' + literal(workspace) + ';' +
      'internal const string NodePath = ' + literal(process.execPath) + ';} }');
    copyFileSync(join(workspace, 'apps/desktop/src-tauri/icons/icon.ico'), join(directory, 'promteSaver.ico'));
    writeFileSync(executable + '.config', '<?xml version="1.0" encoding="utf-8"?>' +
      '<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.7.2"/></startup></configuration>');
    const compilation = spawnSync(compiler, [
      '/nologo', '/target:exe', '/platform:anycpu', '/warn:4', '/main:MonitoringUiHarness', `/out:${executable}`,
      ...['System', 'System.Core', 'System.Drawing', 'System.Windows.Forms', 'System.Net.Http',
        'System.Web.Extensions', 'System.Security'].map(name => `/reference:${name}.dll`),
      ...assemblies.map(path => `/reference:${path}`),
      ...['Program.cs', 'FocusedFieldCapture.cs', 'MonitoringCapture.cs', 'NotepadKeyboardCapture.cs', 'GlobalKeyboardCapture.cs']
        .map(name => join(workspace, 'apps/desktop/windows-host', name)),
      join(workspace, 'tests/fixtures/MonitoringUiHarness.cs'), config,
    ], {encoding: 'utf8', windowsHide: true, timeout: 20_000});
    assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr + (compilation.error ?? ''));
    const result = spawnSync(executable, [directory], {
      encoding: 'utf8', windowsHide: true, timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr + (result.error ?? ''));
    for (const scenario of ['locked Stop', 'obsolete 423', 'obsolete generic', 'current 423', 'stalled body'])
      assert.ok(result.stdout.includes(scenario), `Compiled host scenario did not report: ${scenario}`);
    assert.match(result.stdout, /no service, worker, monitoring permission or live capture started/);
    console.log(result.stdout.trim());
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    scenarioError = error; throw error;
  } finally {
    // Verify the resolved target stays under this workspace's isolated .local
    // directory before recursive removal, including Windows EXE handle retries.
    const target = realpathSync(directory);
    assert.equal(dirname(target), outputRoot);
    assert.ok(target.startsWith(join(outputRoot, 'monitoring-ui-test-')));
    try { rmSync(target, {recursive: true, force: true, maxRetries: 8, retryDelay: 100}); }
    catch (error) {
      if (!scenarioError) throw error;
      scenarioError.message += '; synthetic test cleanup failed: ' + error.code;
    }
  }
});
