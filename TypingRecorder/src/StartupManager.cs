// Launch-at-login through the per-user HKCU Run key. Off by default.
// The registered command carries --autostart so a login launch opens the app
// minimized into the tray and does NOT begin recording; enabling startup never
// unlocks anything, grants a capture source, or starts capture on its own.
//
// Ported almost verbatim from the old PromteSaver.WindowsPreview.WindowsLoginStartup
// (apps/desktop/windows-host/Program.cs). Adapted out of that namespace into
// TypingRecorder, given a fixed Run value name, a parameterless API, and the
// --autostart argument. Uses only in-box Windows / .NET Framework components
// (Microsoft.Win32.Registry lives in mscorlib); no elevation / admin is required.
using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace TypingRecorder {

    // Per-user Windows login launch for TypingRecorder.
    internal static class StartupManager {

        // HKCU subkey holding this user's autostart commands.
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

        // The Run value name. Shared with the uninstaller (setup/Installer.cs) so the
        // startup entry is removed on uninstall. Keep this name AND the Command()
        // string format in lockstep with the installer; a mismatch orphans the entry.
        internal const string RunValueName = "TypingRecorder";

        // The exact command written under the Run key: the quoted full path to this
        // executable followed by --autostart. The --autostart flag tells Program.Main
        // to start minimized to the tray (not recording) when Windows launches us at
        // login. Everything else about launch behaviour is the host's concern.
        internal static string Command() {
            return "\"" + Path.GetFullPath(Application.ExecutablePath) + "\" --autostart";
        }

        // True only when the stored Run value exactly equals our Command()
        // (OrdinalIgnoreCase). The key is opened read-only. A missing key or value
        // means "not enabled". Registry exceptions surface to the caller.
        internal static bool IsEnabled() {
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey, false)) {
                if (key == null) return false;
                string current = key.GetValue(RunValueName) as string;
                return String.Equals(current, Command(), StringComparison.OrdinalIgnoreCase);
            }
        }

        // Enable: create the Run key if needed and write our Command().
        // Disable: delete the value only when it still equals our Command(), so a
        // foreign entry that happens to share the name is never clobbered.
        // No admin rights are required. Registry exceptions surface to the caller so
        // the UI can show a message instead of crashing.
        internal static void SetEnabled(bool enabled) {
            if (enabled) {
                using (var key = Registry.CurrentUser.CreateSubKey(RunKey)) {
                    if (key == null) throw new InvalidOperationException("Windows startup settings are unavailable.");
                    key.SetValue(RunValueName, Command(), RegistryValueKind.String);
                }
            } else {
                using (var key = Registry.CurrentUser.OpenSubKey(RunKey, true)) {
                    if (key != null && String.Equals(key.GetValue(RunValueName) as string, Command(), StringComparison.OrdinalIgnoreCase))
                        key.DeleteValue(RunValueName, false);
                }
            }
        }
    }
}
