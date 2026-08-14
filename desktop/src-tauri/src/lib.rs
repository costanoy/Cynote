mod identity;
mod sync;

use std::fs;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

static LAST_GEOMETRY_SAVE_MS: AtomicI64 = AtomicI64::new(0);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn window_state_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("window_state.json"))
}

/// Remembers wherever the user leaves the window so it reopens in the same place next time.
/// Debounced since Resized/Moved fire repeatedly during an interactive drag.
fn save_window_geometry(app: &AppHandle, window: &tauri::Window) {
    let now = now_ms();
    if now - LAST_GEOMETRY_SAVE_MS.load(Ordering::Relaxed) < 250 {
        return;
    }
    LAST_GEOMETRY_SAVE_MS.store(now, Ordering::Relaxed);

    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        let scale = window.scale_factor().unwrap_or(1.0);
        let geometry = serde_json::json!({
            "x": pos.x as f64 / scale,
            "y": pos.y as f64 / scale,
            "width": size.width as f64 / scale,
            "height": size.height as f64 / scale,
        });
        if let Ok(path) = window_state_path(app) {
            let _ = fs::write(path, geometry.to_string());
        }
    }
}

fn restore_window_geometry(app: &AppHandle, window: &tauri::WebviewWindow) {
    let Ok(path) = window_state_path(app) else { return };
    let Ok(contents) = fs::read_to_string(&path) else { return };
    let Ok(geometry) = serde_json::from_str::<serde_json::Value>(&contents) else { return };

    if let (Some(x), Some(y)) = (geometry["x"].as_f64(), geometry["y"].as_f64()) {
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
    }
    if let (Some(width), Some(height)) = (geometry["width"].as_f64(), geometry["height"].as_f64()) {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
    }
}

pub(crate) fn notes_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("notes.json"))
}

#[tauri::command]
fn save_notes(app: AppHandle, json: String) -> Result<(), String> {
    let path = notes_file_path(&app)?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_notes(app: AppHandle) -> Result<Option<String>, String> {
    let path = notes_file_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

/// Writes plain text to an arbitrary path the user picked via the save dialog.
/// Unscoped on purpose (same trust level as save_notes) - the path only ever
/// comes from a native file-save dialog the user just drove themselves.
#[tauri::command]
fn export_note_txt(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

/// First launch after this feature shipped: turn autostart on so the global
/// shortcut is always available, even after a reboot, without the user having
/// to find the setting. Runs in Rust (not JS) so it still happens even if the
/// webview fails to load. A marker file makes this a one-time nudge — if the
/// user turns it back off in Settings, we don't fight them on the next launch.
fn enable_autostart_on_first_run(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let Ok(dir) = app.path().app_data_dir() else { return };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let marker = dir.join("autostart_initialized");
    if marker.exists() {
        return;
    }
    if let Err(e) = app.autolaunch().enable() {
        eprintln!("Failed to enable autostart: {e}");
    }
    let _ = fs::write(marker, "");
}

fn toggle_window(window: &tauri::WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ctrl+Shift+N was the original pick, but that's the universal "new incognito
    // window" shortcut in every browser, so it kept fighting with that instead.
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_shortcut && event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_window(&window);
                        }
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // Best-effort: a stale instance or another app can already hold this hotkey.
            // That shouldn't stop Cynote from launching, just leave the shortcut inactive.
            if let Err(e) = app.global_shortcut().register(toggle_shortcut) {
                eprintln!("Failed to register global shortcut: {e}");
            }

            enable_autostart_on_first_run(app.handle());

            if let Ok(identity) = identity::load_or_create(app.handle()) {
                sync::start(app.handle().clone(), identity);
            }

            if let Some(window) = app.get_webview_window("main") {
                restore_window_geometry(app.handle(), &window);
            }

            let show_hide = MenuItem::with_id(app, "show_hide", "Mostrar/Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_hide, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_window(&window);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            toggle_window(&window);
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                save_window_geometry(window.app_handle(), window);
                let _ = window.hide();
            }
            WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                save_window_geometry(window.app_handle(), window);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            save_notes,
            load_notes,
            export_note_txt,
            identity::get_device_identity,
            sync::list_discovered_devices,
            sync::list_trusted_devices,
            sync::list_reachable_trusted_devices,
            sync::fetch_peer_notes,
            sync::request_pairing,
            sync::list_pairing_requests,
            sync::respond_to_pairing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
