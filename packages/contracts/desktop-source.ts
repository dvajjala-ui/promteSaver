// Desktop field capture is limited to an explicitly approved process. Keep this
// denylist aligned with the native producer; browser privacy cannot be proven
// by a generic Windows text-field observer.
const excluded = new Set([
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe',
  'vivaldi.exe', 'chromium.exe', 'iexplore.exe', 'tor.exe', 'waterfox.exe',
  'floorp.exe', 'zen.exe', 'safari.exe', 'arc.exe', 'browser.exe',
  'webview2.exe', 'msedgewebview2.exe',
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
