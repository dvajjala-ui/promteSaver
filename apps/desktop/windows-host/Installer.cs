// Per-user Windows setup preview. The vault lives outside the program directory.
// This installer uses only Windows/.NET Framework components and an embedded,
// allowlisted portable payload. It is unsigned and is not a public release.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PromteSaver.Setup {
    internal static class Package {
        const string Marker = "promteSaver-preview-v1";
        const string FilesName = "installed-files.txt";
        const string MarkerName = "install-marker.txt";
        const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\promteSaver-preview";
        const string StartupKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string StartupValue = "promteSaver Windows Preview";

        internal static string DefaultTarget() {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "promteSaver");
        }
        static string SetupHelper() {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "promteSaver", "setup", "promteSaver-Remove.exe");
        }
        static string ShortcutPath() {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "promteSaver.lnk");
        }
        static bool Same(string a, string b) {
            return String.Equals(Path.GetFullPath(a).TrimEnd(Path.DirectorySeparatorChar),
                Path.GetFullPath(b).TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase);
        }
        static string ValidateTarget(string requested, bool testMode) {
            string target = Path.GetFullPath(requested);
            if (!testMode) {
                if (!Same(target, DefaultTarget())) throw new InvalidOperationException("The install location is not approved.");
            } else {
                string temp = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
                if (!Same(Path.GetDirectoryName(target), temp) ||
                    !Path.GetFileName(target).StartsWith("promtesaver-install-test-", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("The test location is not an isolated temporary folder.");
            }
            string parent = Path.GetDirectoryName(target);
            if (Directory.Exists(parent) && (File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("The install parent is a directory link.");
            if (Directory.Exists(target) && (File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("The install folder is a directory link.");
            return target;
        }
        static string SafeEntry(string root, string name) {
            if (String.IsNullOrWhiteSpace(name) || name.StartsWith("/", StringComparison.Ordinal) || name.Contains("\\") || name.Contains(":"))
                throw new InvalidOperationException("The package contains an unsafe path.");
            var segments = name.TrimEnd('/').Split('/');
            if (segments.Any(x => x.Length == 0 || x == "." || x == ".." || x.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0))
                throw new InvalidOperationException("The package contains an unsafe path.");
            string first = segments[0];
            if (first != "runtime" && first != "binaries" && first != "browser-helper" &&
                name != "promteSaver.exe" && name != "promteSaver.exe.config" && name != "promteSaver.ico" &&
                name != "promteSaver-Remove.exe" && name != "READ-ME.txt")
                throw new InvalidOperationException("The package contains an unexpected file.");
            string result = Path.GetFullPath(Path.Combine(root, name.Replace('/', Path.DirectorySeparatorChar)));
            if (!result.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("The package escapes its install folder.");
            return result;
        }
        static List<string> Extract(string stage) {
            var files = new List<string>(); var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long total = 0;
            using (var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("PromteSaver.Payload.zip")) {
                if (payload == null) throw new InvalidOperationException("The setup package has no application payload.");
                using (var archive = new ZipArchive(payload, ZipArchiveMode.Read, false)) {
                    if (archive.Entries.Count > 100) throw new InvalidOperationException("The package has too many files.");
                    foreach (var entry in archive.Entries) {
                        string output = SafeEntry(stage, entry.FullName);
                        if (entry.FullName.EndsWith("/", StringComparison.Ordinal)) continue;
                        if (!names.Add(entry.FullName)) throw new InvalidOperationException("The package repeats a file.");
                        if (entry.Length < 0 || entry.Length > 120L * 1024 * 1024 || total + entry.Length > 250L * 1024 * 1024)
                            throw new InvalidOperationException("The package exceeds the install size limit.");
                        Directory.CreateDirectory(Path.GetDirectoryName(output));
                        using (var source = entry.Open())
                        using (var destination = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                            var buffer = new byte[16384]; int count; long written = 0;
                            while ((count = source.Read(buffer, 0, buffer.Length)) > 0) {
                                written += count;
                                if (written > entry.Length || total + written > 250L * 1024 * 1024)
                                    throw new InvalidOperationException("The package exceeds the install size limit.");
                                destination.Write(buffer, 0, count);
                            }
                            if (written != entry.Length) throw new InvalidOperationException("The package file is incomplete.");
                        }
                        total += entry.Length; files.Add(entry.FullName);
                    }
                }
            }
            foreach (var required in new[] { "promteSaver.exe", "promteSaver-Remove.exe", "runtime/resource-manifest.json", "runtime/NODE-LICENSE.txt", "READ-ME.txt" })
                if (!names.Contains(required)) throw new InvalidOperationException("The package is missing a required file.");
            File.WriteAllLines(Path.Combine(stage, FilesName), files, Encoding.UTF8);
            File.WriteAllText(Path.Combine(stage, MarkerName), Marker, Encoding.ASCII);
            return files;
        }
        static void Shortcut(string target) {
            string shortcutPath = ShortcutPath(), executable = Path.Combine(target, "promteSaver.exe");
            if (File.Exists(shortcutPath) && !ShortcutPointsTo(shortcutPath, executable))
                throw new InvalidOperationException("A different Start Menu shortcut already uses this name.");
            Type kind = Type.GetTypeFromProgID("WScript.Shell");
            if (kind == null) throw new InvalidOperationException("Windows shortcuts are unavailable.");
            object shell = Activator.CreateInstance(kind), link = null;
            try {
                link = kind.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                Type linkType = link.GetType();
                linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { executable });
                linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { target });
                linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "promteSaver private prompt memory" });
                linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, new object[0]);
            } finally {
                if (link != null && Marshal.IsComObject(link)) Marshal.FinalReleaseComObject(link);
                if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
            }
        }
        static bool ShortcutPointsTo(string path, string expected) {
            Type kind = Type.GetTypeFromProgID("WScript.Shell");
            if (kind == null) return false;
            object shell = null, link = null;
            try {
                shell = Activator.CreateInstance(kind);
                link = kind.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
                object value = link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, new object[0]);
                return value is string && Same((string)value, expected);
            } catch { return false; }
            finally {
                if (link != null && Marshal.IsComObject(link)) Marshal.FinalReleaseComObject(link);
                if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
            }
        }
        static void Register(string target) {
            string helper = SetupHelper(), directory = Path.GetDirectoryName(helper);
            Directory.CreateDirectory(directory);
            if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("The setup helper folder is a directory link.");
            if (File.Exists(helper) && (File.GetAttributes(helper) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("The setup helper is a file link.");
            using (var existing = Registry.CurrentUser.OpenSubKey(UninstallKey, false)) {
                if (existing != null && !String.Equals(existing.GetValue("InstallLocation") as string, target, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("A different application registration already uses this name.");
            }
            string bundledHelper = Path.Combine(target, "promteSaver-Remove.exe");
            if (!File.Exists(bundledHelper)) throw new InvalidOperationException("The removal helper is missing.");
            File.Copy(bundledHelper, helper, true);
            using (var key = Registry.CurrentUser.CreateSubKey(UninstallKey)) {
                if (key == null) throw new InvalidOperationException("Windows app registration is unavailable.");
                key.SetValue("DisplayName", "promteSaver (preview)"); key.SetValue("DisplayVersion", "0.9.0");
                key.SetValue("Publisher", "promteSaver"); key.SetValue("InstallLocation", target);
                key.SetValue("DisplayIcon", Path.Combine(target, "promteSaver.exe"));
                key.SetValue("UninstallString", "\"" + helper + "\" --remove");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord); key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
        internal static string Install(string requested, bool testMode) {
            string target = ValidateTarget(requested, testMode);
            if (Directory.Exists(target)) {
                if (File.Exists(Path.Combine(target, MarkerName)) &&
                    File.ReadAllText(Path.Combine(target, MarkerName), Encoding.ASCII) == Marker &&
                    File.Exists(Path.Combine(target, "promteSaver.exe"))) {
                    if (!testMode) { Shortcut(target); Register(target); }
                    return target;
                }
                throw new InvalidOperationException("The app folder already exists and is not a complete preview installation.");
            }
            string parent = Path.GetDirectoryName(target); Directory.CreateDirectory(parent);
            string stage = target + ".stage-" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(stage);
            Extract(stage);
            Directory.Move(stage, target);
            if (!testMode) { Shortcut(target); Register(target); }
            return target;
        }
        static bool RunningFrom(string target) {
            string installed = Path.Combine(target, "promteSaver.exe");
            foreach (var process in Process.GetProcessesByName("promteSaver")) {
                try { if (Same(process.MainModule.FileName, installed)) return true; }
                catch { throw new InvalidOperationException("Close promteSaver before removing it."); }
                finally { process.Dispose(); }
            }
            return false;
        }
        internal static bool Remove(string requested, bool testMode) {
            string target = ValidateTarget(requested, testMode);
            if (!Directory.Exists(target)) return true;
            if (RunningFrom(target)) throw new InvalidOperationException("Quit promteSaver from its tray before removing it.");
            if (File.ReadAllText(Path.Combine(target, MarkerName), Encoding.ASCII) != Marker)
                throw new InvalidOperationException("This folder is not a promteSaver preview installation.");
            var files = File.ReadAllLines(Path.Combine(target, FilesName), Encoding.UTF8);
            if (files.Length > 100) throw new InvalidOperationException("The install file list is invalid.");
            var directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var installedPaths = new List<string>();
            foreach (string file in files) {
                string path = SafeEntry(target, file);
                string folder = Path.GetDirectoryName(path);
                while (!Same(folder, target)) {
                    if (Directory.Exists(folder) && (File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0)
                        throw new InvalidOperationException("An installed folder is a directory link.");
                    directories.Add(folder); folder = Path.GetDirectoryName(folder);
                }
                if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidOperationException("An installed file is a link.");
                installedPaths.Add(path);
            }
            foreach (string path in installedPaths) if (File.Exists(path)) File.Delete(path);
            File.Delete(Path.Combine(target, MarkerName)); File.Delete(Path.Combine(target, FilesName));
            foreach (string folder in directories.OrderByDescending(x => x.Length)) {
                if (Directory.Exists(folder) && (File.GetAttributes(folder) & FileAttributes.ReparsePoint) == 0) {
                    try { Directory.Delete(folder, false); } catch (IOException) { }
                }
            }
            try { Directory.Delete(target, false); } catch (IOException) { }
            if (!testMode) {
                string shortcut = ShortcutPath();
                if (File.Exists(shortcut) && ShortcutPointsTo(shortcut, Path.Combine(target, "promteSaver.exe"))) File.Delete(shortcut);
                using (var key = Registry.CurrentUser.OpenSubKey(StartupKey, true)) {
                    string expected = "\"" + Path.Combine(target, "promteSaver.exe") + "\"";
                    if (key != null && String.Equals(key.GetValue(StartupValue) as string, expected, StringComparison.OrdinalIgnoreCase))
                        key.DeleteValue(StartupValue, false);
                }
                using (var key = Registry.CurrentUser.OpenSubKey(UninstallKey, false)) {
                    string helper = "\"" + SetupHelper() + "\" --remove";
                    if (key != null && String.Equals(key.GetValue("UninstallString") as string, helper, StringComparison.OrdinalIgnoreCase))
                        Registry.CurrentUser.DeleteSubKey(UninstallKey, false);
                }
            }
            return !Directory.Exists(target);
        }
    }

    internal sealed class SetupWindow : Form {
        readonly Label status = new Label();
        readonly Button action = new Button(), open = new Button();
        readonly bool removal;
        internal SetupWindow(bool removal, bool fixture) {
            this.removal = removal;
            Text = removal ? "Remove promteSaver" : "Install promteSaver";
            Size = new Size(560, 310); MinimumSize = Size; MaximumSize = Size; StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(15, 21, 29); ForeColor = Color.White;
            var title = new Label { Text = removal ? "Remove the app" : "Your prompts, in one place", Font = new Font("Segoe UI", 20, FontStyle.Bold),
                Location = new Point(28, 26), Size = new Size(490, 45) }; Controls.Add(title);
            var detail = new Label { Text = removal ?
                "This removes the app and Start Menu entry. Your encrypted vault and backups stay on this computer." :
                "Installs for your Windows account. Capture stays off until you open the vault and approve a source. No browser setup is required for the Notepad pilot.",
                Location = new Point(30, 82), Size = new Size(490, 60) }; Controls.Add(detail);
            action.Text = removal ? "Remove app" : "Install app"; action.Location = new Point(30, 166); action.Size = new Size(160, 42);
            action.Click += delegate {
                action.Enabled = false; status.Text = removal ? "Removing app…" : "Installing app…"; status.Refresh();
                try {
                    bool complete = removal ? Package.Remove(Package.DefaultTarget(), false) : Package.Install(Package.DefaultTarget(), false) != null;
                    status.Text = complete ? removal ? "App removed. Your vault was kept." : "Installed. Open promteSaver to begin." : "Some added files remain in the app folder; your vault was kept.";
                    open.Visible = !removal && complete;
                } catch (Exception error) { status.Text = error.Message; action.Enabled = true; }
            }; Controls.Add(action);
            open.Text = "Open promteSaver"; open.Location = new Point(206, 166); open.Size = new Size(180, 42); open.Visible = false;
            open.Click += delegate { Process.Start(Path.Combine(Package.DefaultTarget(), "promteSaver.exe")); Close(); }; Controls.Add(open);
            status.Location = new Point(30, 220); status.Size = new Size(490, 40); status.Text = removal ? "Quit promteSaver from its tray first." : "Program files go in your account; the vault stays separate."; Controls.Add(status);
            if (fixture) { Text += " · SYNTHETIC UI FIXTURE"; action.Enabled = false; status.Text = "Synthetic setup preview. Installation is disabled."; }
        }
    }

    internal static class Program {
        [STAThread] static int Main(string[] args) {
            if (args.Length == 2 && args[0] == "--test-install") {
                try { Package.Install(args[1], true); return 0; } catch { return 1; }
            }
            if (args.Length == 2 && args[0] == "--test-remove") {
                try { return Package.Remove(args[1], true) ? 0 : 1; } catch { return 1; }
            }
            if (args.Length > 1 || (args.Length == 1 && args[0] != "--remove" && args[0] != "--ui-smoke")) return 2;
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
#if UNINSTALLER
            Application.Run(new SetupWindow(true, args.Length == 1 && args[0] == "--ui-smoke"));
#else
            Application.Run(new SetupWindow(args.Length == 1 && args[0] == "--remove", args.Length == 1 && args[0] == "--ui-smoke"));
#endif
            return 0;
        }
    }
}
