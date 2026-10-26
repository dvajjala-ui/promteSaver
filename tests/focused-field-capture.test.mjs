import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, resolve, sep} from 'node:path';

test('native field capture rejects protected controls and unchanged or empty snapshots', (t) => {
  if (process.platform !== 'win32') return t.skip('Windows UI Automation is required');
  const framework = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = join(framework, 'csc.exe');
  const types = join(framework, 'WPF', 'UIAutomationTypes.dll');
  const client = join(framework, 'WPF', 'UIAutomationClient.dll');
  if (![compiler, types, client].every(existsSync)) return t.skip('Windows .NET Framework UI Automation compiler is unavailable');

  const tempBase = realpathSync(tmpdir());
  const work = mkdtempSync(join(tempBase, 'promtesaver-field-policy-test-'));
  try {
    const harness = join(work, 'FieldPolicyHarness.cs');
    const executable = join(work, 'FieldPolicyHarness.exe');
    writeFileSync(harness, `using System;
using PromteSaver.WindowsPreview;
internal static class FieldPolicyHarness {
  static void Check(bool condition, string name) {
    if (!condition) throw new Exception(name);
  }
  static void Main() {
    Check(FocusedFieldCapture.IsEligibleMetadata(false, true, false, "Edit"), "ordinary edit");
    Check(FocusedFieldCapture.IsEligibleMetadata(false, true, false, "Document"), "ordinary document");
    Check(!FocusedFieldCapture.IsEligibleMetadata(true, true, false, "Edit"), "password excluded");
    Check(!FocusedFieldCapture.IsEligibleMetadata(false, false, false, "Edit"), "disabled excluded");
    Check(!FocusedFieldCapture.IsEligibleMetadata(false, true, true, "Edit"), "offscreen excluded");
    Check(!FocusedFieldCapture.IsEligibleMetadata(false, true, false, "Button"), "noneditor excluded");
    Check(FocusedFieldCapture.IsEditableValue(true, false, false, false), "writable value");
    Check(FocusedFieldCapture.IsEditableValue(false, false, true, false), "writable text");
    Check(!FocusedFieldCapture.IsEditableValue(true, true, true, false), "read-only value excluded");
    Check(!FocusedFieldCapture.IsEditableValue(true, false, true, true), "read-only text excluded");
    Check(!FocusedFieldCapture.IsEditableValue(false, false, false, false), "unknown editability excluded");
    Check(!FocusedFieldCapture.IsEligibleProcess("chrome"), "browser excluded");
    Check(!FocusedFieldCapture.IsEligibleProcess("bitwarden"), "credential app excluded");
    Check(!FocusedFieldCapture.ShouldSave(null, ""), "empty excluded");
    Check(!FocusedFieldCapture.ShouldSave(null, "   "), "whitespace excluded");
    Check(FocusedFieldCapture.ShouldSave(null, "a harmless synthetic prompt"), "first content");
    Check(!FocusedFieldCapture.ShouldSave("same text", "same text"), "unchanged excluded");
    Check(FocusedFieldCapture.ShouldSave("first", "first and second"), "changed content");
  }
}
`);
    const source = resolve('apps/desktop/windows-host/FocusedFieldCapture.cs');
    assert.ok(existsSync(source), 'focused field module must exist');
    const compile = spawnSync(compiler, ['/nologo', '/target:exe', `/out:${executable}`,
      '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Windows.Forms.dll',
      `/reference:${types}`, `/reference:${client}`, source, harness],
      {encoding: 'utf8', windowsHide: true, timeout: 30_000});
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    const run = spawnSync(executable, [], {encoding: 'utf8', windowsHide: true, timeout: 30_000});
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    const target = resolve(work); const inside = relative(tempBase, target);
    assert.ok(inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !inside.startsWith('../'));
    rmSync(target, {recursive: true, force: true});
  }
});
