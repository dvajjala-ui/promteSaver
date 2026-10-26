import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, resolve, sep} from 'node:path';

test('Windows value-only editable provider can supply a draft through fallback', (t) => {
  if (process.platform !== 'win32') return t.skip('Windows UI Automation is required');
  const framework = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = join(framework, 'csc.exe');
  const wpf = join(framework, 'WPF');
  const assemblies = ['UIAutomationTypes', 'UIAutomationClient', 'UIAutomationProvider',
    'PresentationCore', 'PresentationFramework', 'WindowsBase'].map(name => join(wpf, `${name}.dll`));
  if (![compiler, ...assemblies].every(existsSync)) return t.skip('Windows .NET Framework WPF compiler is unavailable');

  const tempBase = realpathSync(tmpdir());
  const work = mkdtempSync(join(tempBase, 'promtesaver-value-pattern-test-'));
  try {
    const executable = join(work, 'ValueOnlyPeer.exe');
    const compile = spawnSync(compiler, ['/nologo', '/target:exe', `/out:${executable}`,
      '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Xaml.dll',
      '/reference:System.Windows.Forms.dll',
      ...assemblies.map(path => `/reference:${path}`),
      resolve('apps/desktop/windows-host/FocusedFieldCapture.cs'),
      resolve('tests/fixtures/WindowsValueOnlyPeer.cs')],
    {encoding: 'utf8', windowsHide: true, timeout: 30_000});
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    const run = spawnSync(executable, [], {encoding: 'utf8', windowsHide: true, timeout: 30_000});
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /ValuePattern-only UIA read passed/);
  } finally {
    const target = resolve(work); const inside = relative(tempBase, target);
    assert.ok(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !inside.startsWith('../'));
    rmSync(target, {recursive: true, force: true});
  }
});
