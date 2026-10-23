#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io::{self, BufRead, BufReader, Read, Write},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};
use serde::Deserialize;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// No frontend invoke handler or filesystem/shell capabilities are registered.
struct Service(Mutex<Option<Child>>);
impl Service {
    fn stop(&self) {
        let Ok(mut slot) = self.0.lock() else { return; };
        let Some(mut child) = slot.take() else { return; };
        if let Some(mut input) = child.stdin.take() {
            let _ = input.write_all(b"{\"type\":\"shutdown\"}\n");
        }
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline {
            if matches!(child.try_wait(), Ok(Some(_))) { return; }
            thread::sleep(Duration::from_millis(40));
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}
impl Drop for Service { fn drop(&mut self) { self.stop(); } }
#[derive(Deserialize)]
struct Ready { r#type: String, version: u8, url: String }

fn validate_ready(line: &str) -> Result<tauri::Url, io::Error> {
    let fail = || io::Error::other("Invalid desktop service handshake");
    let ready: Ready = serde_json::from_str(line).map_err(|_| fail())?;
    let url = tauri::Url::parse(&ready.url).map_err(|_| fail())?;
    let token = url.fragment().unwrap_or("");
    if ready.r#type != "ready" || ready.version != 1 || url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1") || url.port().unwrap_or(0) == 0
        || !url.username().is_empty() || url.password().is_some() || url.path() != "/"
        || url.query().is_some() || token.len() != 64
        || !token.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
        return Err(fail());
    }
    Ok(url)
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Service(Mutex::new(None)))
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let script = resources.join("runtime/apps/desktop/sidecar.ts");
            let parent = std::env::current_exe()?.parent().ok_or_else(|| io::Error::other("Missing executable directory"))?.to_path_buf();
            let binary = parent.join(if cfg!(windows) { "promtesaver-runtime.exe" } else { "promtesaver-runtime" });
            if !binary.is_file() || !script.is_file() {
                return Err(io::Error::other("Desktop resources are missing. Run the documented desktop preparation and bundle build steps.").into());
            }
            let mut command = Command::new(binary);
            command.arg(script).arg("--desktop-child")
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
                .env_remove("NODE_OPTIONS").env_remove("NODE_PATH").env_remove("PROMTESAVER_DATA_DIR");
            #[cfg(windows)]
            { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
            let mut child = command.spawn()?;
            let stdout = child.stdout.take().ok_or_else(|| io::Error::other("Missing service handshake pipe"))?;
            *app.state::<Service>().0.lock().map_err(|_| io::Error::other("Service state lock failed"))? = Some(child);
            let (tx, rx) = mpsc::channel();
            thread::spawn(move || {
                let mut reader = BufReader::new(stdout);
                let mut message = String::new();
                let result = reader.by_ref().take(4097).read_line(&mut message);
                let valid = result.is_ok() && message.len() <= 4096 && message.ends_with('\n');
                let _ = tx.send(if valid { Ok(message) } else { Err("Invalid service handshake") });
                // Drain the pipe; never write a session capability to console or disk.
                let _ = io::copy(&mut reader, &mut io::sink());
            });
            let message = match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(Ok(message)) => message,
                _ => { app.state::<Service>().stop(); return Err(io::Error::other("Local service did not start. Check for another app instance or a stale service lease.").into()); }
            };
            let url = validate_ready(&message)?;
            let expected_origin = url.origin().ascii_serialization();
            let menu = tauri::menu::Menu::default(app.handle())?;
            app.set_menu(menu)?;
            WebviewWindowBuilder::new(app, "vault", WebviewUrl::External(url))
                .title("promteSaver - Local Vault").inner_size(1240.0, 820.0).min_inner_size(680.0, 560.0)
                .incognito(true).devtools(cfg!(debug_assertions)).enable_clipboard_access()
                .on_navigation(move |next| next.origin().ascii_serialization() == expected_origin)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("promteSaver desktop could not start; see desktop build and recovery documentation");
    app.run(|handle, event| {
        match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => handle.state::<Service>().stop(),
            tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label == "vault" => {
                handle.state::<Service>().stop();
                handle.exit(0);
            },
            _ => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_private_loopback_capability_url() {
        let good = format!(r#"{{"type":"ready","version":1,"url":"http://127.0.0.1:4567/#{}"}}"#, "a".repeat(64));
        assert!(validate_ready(&good).is_ok());
        for value in [good.replace("127.0.0.1", "evil.example"), good.replace("http:", "https:"), good.replace("4567/", "4567/private"), good.replace("ready", "unknown")] {
            assert!(validate_ready(&value).is_err());
        }
    }
}
