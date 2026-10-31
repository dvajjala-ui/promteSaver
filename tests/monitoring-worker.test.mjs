import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('monitoring worker isolates native calls and survives bounded synthetic process failures', {
  skip: process.platform !== 'win32', timeout: 45_000,
}, async () => {
  const framework = join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = join(framework, 'csc.exe');
  assert.ok(existsSync(compiler), 'native compiler must exist for this Windows test');
  const root = resolve('.local');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'monitoring-worker-'));
  let scenarioError;
  try {
    const executable = join(directory, 'monitoring-worker-harness.exe');
    const compilation = spawnSync(compiler, [
      '/nologo', '/target:exe', '/warn:4', `/out:${executable}`,
      '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Windows.Forms.dll',
      '/reference:System.Web.Extensions.dll',
      resolve('apps/desktop/windows-host/MonitoringCapture.cs'),
      resolve('tests/fixtures/MonitoringWorkerHarness.cs'),
    ], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
    for (const mode of ['healthy', 'startup-gap', 'backpressure', 'stop-hang', 'stale', 'hang', 'oversize', 'stdin-eof']) {
      const result = spawnSync(executable, [mode], { encoding: 'utf8', timeout: 12_000, windowsHide: true });
      assert.equal(result.status, 0, `${mode}: ${result.stdout}${result.stderr}${result.error || ''}`);
      assert.match(result.stdout, /PASS synthetic worker/);
    }
    // Standalone worker dispatch cannot start recording without its private stdin handshake.
    const unpaired = spawnSync(executable, ['--monitoring-worker'], { input: '', encoding: 'utf8', timeout: 4000, windowsHide: true });
    assert.equal(unpaired.status, 2, unpaired.stdout + unpaired.stderr);
    const parentDeath = spawnSync(executable, ['parent-death'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(parentDeath.status, 0, parentDeath.stdout + parentDeath.stderr);
    const childPid = Number(/OWNED_CHILD (\d+)/.exec(parentDeath.stdout)?.[1]);
    assert.ok(Number.isSafeInteger(childPid) && childPid > 0, 'synthetic owned child PID must be reported');
    let exited = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { process.kill(childPid, 0); } catch (error) {
        assert.equal(error.code, 'ESRCH'); exited = true; break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
    assert.ok(exited, 'worker must exit after abrupt parent death without a graceful Stop');
    // Let libuv close exited-process handles before Windows unmaps the EXE.
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    scenarioError = error;
    throw error;
  } finally {
    // Node-generated temporary path is resolved and constrained before recursive removal.
    assert.ok(directory.startsWith(root + '\\') && directory !== root);
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); }
    catch (error) {
      if (!scenarioError) throw error;
      scenarioError.message += '; synthetic artifact cleanup also failed: ' + error.code;
    }
  }
});

test('monitoring mode rejects an owned ValuePattern-only provider without reading its value', {
  skip: process.platform !== 'win32', timeout: 15_000,
}, () => {
  const framework = join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = join(framework, 'csc.exe');
  const wpf = join(framework, 'WPF');
  const root = resolve('.local');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'monitoring-value-'));
  try {
    const executable = join(directory, 'bounded-value-provider.exe');
    const assemblies = ['UIAutomationTypes', 'UIAutomationClient', 'UIAutomationProvider',
      'PresentationCore', 'PresentationFramework', 'WindowsBase'];
    const compilation = spawnSync(compiler, ['/nologo', '/target:exe', `/out:${executable}`,
      '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Xaml.dll', '/reference:System.Windows.Forms.dll',
      ...assemblies.map(name => `/reference:${join(wpf, name + '.dll')}`),
      resolve('apps/desktop/windows-host/FocusedFieldCapture.cs'), resolve('tests/fixtures/MonitoringBoundedValuePeer.cs')],
    { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
    const result = spawnSync(executable, [], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS bounded monitoring excludes ValuePattern getter/);
  } finally {
    assert.ok(directory.startsWith(root + '\\') && directory !== root);
    rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
