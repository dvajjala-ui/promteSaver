// Desktop field capture allows browsers and general applications.
// Password managers, credential tools, and OS authentication remain excluded.
const excluded = new Set([
  'bitwarden.exe', '1password.exe', 'keepass.exe', 'keepassxc.exe',
  'lastpass.exe', 'dashlane.exe', 'nordpass.exe', 'protonpass.exe',
  'enpass.exe', 'roboform.exe',
  'logonui.exe', 'credentialui.exe', 'credentialuibroker.exe',
  'consent.exe', 'lsass.exe', 'securityhealthsystray.exe',
  'applicationframehost.exe', 'svchost.exe', 'systemsettings.exe',
  'textinputhost.exe', 'explorer.exe', 'codex-computer-use.exe'
]);

export function allowedDesktopFieldSource(source: unknown): source is string {
  return typeof source === 'string' && source.length <= 68 &&
    /^[a-z0-9][a-z0-9._-]{0,63}\.exe$/.test(source) && !excluded.has(source);
}
