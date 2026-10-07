mod cloud_sync;
mod dashboard;
mod identity;
mod sync;
#[cfg(windows)]
mod taskbar;

use std::fs;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
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

    // Windows reports a minimized window's position/size as a placeholder far
    // off-screen (e.g. -32000,-32000) rather than its real bounds. Saving that
    // verbatim would make the window unreachable on every future launch.
    if window.is_minimized().unwrap_or(false) {
        return;
    }

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

    // Safety net against corrupted/stale state (e.g. an old minimized-window
    // sentinel position from before this was guarded against) putting the
    // window somewhere the user can never see or reach again.
    if let (Some(x), Some(y)) = (geometry["x"].as_f64(), geometry["y"].as_f64()) {
        if x > -10000.0 && y > -10000.0 {
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
        }
    }
    if let (Some(width), Some(height)) = (geometry["width"].as_f64(), geometry["height"].as_f64()) {
        if width >= 420.0 && height >= 320.0 {
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
        }
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

/// Called by the frontend once it's confirmed (or had nothing to confirm)
/// that quitting won't silently drop unsaved changes - see "quit-requested".
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Holds a file path handed to us on the command line (Explorer's "Open with"
/// / double-click, via the .cyte file association) until the frontend is
/// ready to consume it. Pushing this straight to the webview via an emitted
/// event at launch is unreliable - the page may not have its listener
/// attached yet - so the frontend pulls it once instead, via take_startup_file.
struct StartupFile(Mutex<Option<String>>);

/// A bare (non-flag) argument ending in one of the extensions Cynote can open.
fn find_note_file_arg(argv: &[String]) -> Option<String> {
    argv.iter()
        .skip(1)
        .find(|a| {
            let lower = a.to_lowercase();
            !a.starts_with("--")
                && (lower.ends_with(".cyte") || lower.ends_with(".txt") || lower.ends_with(".md"))
        })
        .cloned()
}

#[tauri::command]
fn take_startup_file(state: tauri::State<StartupFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// One-time cleanup: earlier builds force-enabled autostart on first run and
/// left an `autostart_initialized` marker behind. That default was removed,
/// but the marker (and the Run key it caused) can still be sitting on a
/// machine that already hit it - undo it once so autostart actually goes
/// back to off, then delete the marker so a later deliberate choice in
/// Settings is never touched by this again.
fn undo_forced_autostart_once(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let Ok(dir) = app.path().app_data_dir() else { return };
    let marker = dir.join("autostart_initialized");
    if !marker.exists() {
        return;
    }
    let _ = app.autolaunch().disable();
    let _ = fs::remove_file(marker);
}

/// Tray marks, as raw RGBA written by scripts/generate-tray-icons.mjs. The
/// "simple" pair is the small-size drawing (gold C on the green disc); the
/// "detailed" pair adds the inner ring and the leaf, for high-DPI taskbars
/// where the tray icon really gets 32 pixels. Each has an "alert" twin with
/// the colors swapped.
const TRAY_ICON_SIZE: u32 = 32;
static TRAY_SIMPLE: &[u8] = include_bytes!("../icons/tray/simple.rgba");
static TRAY_SIMPLE_ALERT: &[u8] = include_bytes!("../icons/tray/simple-alert.rgba");
static TRAY_DETAILED: &[u8] = include_bytes!("../icons/tray/detailed.rgba");
static TRAY_DETAILED_ALERT: &[u8] = include_bytes!("../icons/tray/detailed-alert.rgba");

/// Below this display scale the tray shows the icon at well under 32px, where
/// the ring and leaf would only turn to mush.
const TRAY_DETAILED_MIN_SCALE: f64 = 1.75;
static TRAY_USE_DETAILED: AtomicBool = AtomicBool::new(false);
static TRAY_ALERTING: AtomicBool = AtomicBool::new(false);

const TRAY_ALERT_STEP_MS: u64 = 600;
/// Safety net: stop blinking on our own after a minute if nobody reacts.
const TRAY_ALERT_MAX_BLINKS: u32 = 50;

fn tray_image(alert: bool) -> tauri::image::Image<'static> {
    let bytes = match (TRAY_USE_DETAILED.load(Ordering::Relaxed), alert) {
        (false, false) => TRAY_SIMPLE,
        (false, true) => TRAY_SIMPLE_ALERT,
        (true, false) => TRAY_DETAILED,
        (true, true) => TRAY_DETAILED_ALERT,
    };
    tauri::image::Image::new(bytes, TRAY_ICON_SIZE, TRAY_ICON_SIZE)
}

/// Alternates the tray icon with its alert twin so Cynote calls attention to
/// itself the moment a peer asks to sync - the tray icon is the one thing
/// that's always present, whether the main window is shown, minimized, or
/// hidden away (its usual state, since closing the window hides it to the
/// tray instead of quitting). Keeps going until the request is noticed (see
/// stop_tray_alert).
pub fn flash_tray_icon(app: &AppHandle) {
    use tauri::tray::TrayIcon;
    let Some(tray) = app.try_state::<TrayIcon<tauri::Wry>>() else { return };
    let tray = tray.inner().clone();
    if TRAY_ALERTING.swap(true, Ordering::SeqCst) {
        return; // already blinking
    }
    std::thread::spawn(move || {
        let step = std::time::Duration::from_millis(TRAY_ALERT_STEP_MS);
        for _ in 0..TRAY_ALERT_MAX_BLINKS {
            if !TRAY_ALERTING.load(Ordering::SeqCst) {
                break;
            }
            let _ = tray.set_icon(Some(tray_image(true)));
            std::thread::sleep(step);
            let _ = tray.set_icon(Some(tray_image(false)));
            std::thread::sleep(step);
        }
        TRAY_ALERTING.store(false, Ordering::SeqCst);
    });
}

/// Called once the sync request has been seen: the tray was clicked, the
/// window came to the front, or the request was answered.
pub fn stop_tray_alert() {
    TRAY_ALERTING.store(false, Ordering::SeqCst);
}

/// show() + set_focus() alone often leaves the window visible but stuck
/// behind whatever already had focus (Explorer, another app...) - Windows
/// silently refuses SetForegroundWindow for a process that isn't already
/// foreground, which is exactly the case when a second launch of the app
/// (e.g. from the desktop shortcut) redirects here via the single-instance
/// plugin. Briefly forcing always-on-top isn't subject to that restriction,
/// so it reliably pulls the window to the front even when focus doesn't
/// follow.
fn bring_to_front(window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    let _ = window.set_always_on_top(false);
    let _ = window.set_focus();
}

fn toggle_window(window: &tauri::WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        bring_to_front(window);
    }
}

/// WebView2 treats a handful of Ctrl/F-key combos (Ctrl+N, Ctrl+W, Ctrl+F,
/// F3, F5, F12...) as its own built-in "browser accelerator" shortcuts,
/// handled before the page's own JavaScript ever sees the keydown event -
/// this is why Ctrl+W/Ctrl+T for tabs silently did nothing no matter what
/// the frontend's keydown handler did. Turning this off hands every key
/// combo to the page, which is what we want since this app has no browser
/// chrome of its own for WebView2's defaults to make sense of anyway.
#[cfg(windows)]
fn disable_browser_accelerator_keys(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    let _ = window.with_webview(|webview| unsafe {
        let controller = webview.controller();
        let Ok(core) = controller.CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
}

/// The Desktop shortcut launches with --popup for a compact panel that stays
/// out of the taskbar; the Start Menu one omits it and behaves like a normal
/// app window. Both are frameless now - the frontend draws its own liquid-
/// glass title bar and window controls instead of relying on native chrome.
fn show_dashboard_window(app: &AppHandle, popup: bool) {
    if let Some(window) = app.get_webview_window("dashboard") {
        bring_to_front(&window);
        return;
    }

    let url = if popup { "index.html?dashboard-popup=1" } else { "index.html" };
    let mut builder = tauri::WebviewWindowBuilder::new(app, "dashboard", tauri::WebviewUrl::App(url.into()))
        .title("Dashnotes")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(true);

    builder = if popup {
        builder.inner_size(560.0, 480.0).skip_taskbar(true)
    } else {
        builder.inner_size(880.0, 600.0).skip_taskbar(false)
    };

    if let Ok(window) = builder.build() {
        // Distinct taskbar icon so a visible Dashboard window doesn't look
        // like a second copy of the main Cynote window - both share the same
        // .exe icon by default unless overridden here.
        let icon_path = dashboard::dashboard_icon_path(app);
        if let Some(icon_path) = &icon_path {
            if let Ok(icon) = tauri::image::Image::from_path(icon_path) {
                let _ = window.set_icon(icon);
            }
        }
        // Its own taskbar button, apart from Cynote's (see taskbar.rs).
        #[cfg(windows)]
        if let (Ok(hwnd), Ok(exe)) = (window.hwnd(), std::env::current_exe()) {
            taskbar::separate_dashnotes_window(hwnd.0 as isize, &exe, icon_path.as_deref());
        }
        #[cfg(windows)]
        disable_browser_accelerator_keys(&window);
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ctrl+Shift+N was the original pick, but that's the universal "new incognito
    // window" shortcut in every browser, so it kept fighting with that instead.
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .manage(StartupFile(Mutex::new(find_note_file_arg(
            &std::env::args().collect::<Vec<_>>(),
        ))))
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let popup = argv.iter().any(|a| a == "--popup");
            if argv.iter().any(|a| a == "--dashboard") {
                show_dashboard_window(app, popup);
            } else if let Some(window) = app.get_webview_window("main") {
                bring_to_front(&window);
                // The app was already running - the frontend's listener is
                // definitely attached by now, so pushing the event directly
                // (rather than through StartupFile) is safe here.
                if let Some(path) = find_note_file_arg(&argv) {
                    let _ = window.emit("open-note-file", path);
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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

            undo_forced_autostart_once(app.handle());
            dashboard::sync_dashboard_shortcuts(app.handle());

            if let Ok(identity) = identity::load_or_create(app.handle()) {
                sync::start(app.handle().clone(), identity);
            }

            let args: Vec<String> = std::env::args().collect();
            let launched_as_dashboard = args.iter().any(|a| a == "--dashboard");

            if let Some(window) = app.get_webview_window("main") {
                restore_window_geometry(app.handle(), &window);
                #[cfg(windows)]
                disable_browser_accelerator_keys(&window);
                if !launched_as_dashboard {
                    let _ = window.show();
                }
            }
            if launched_as_dashboard {
                let popup = args.iter().any(|a| a == "--popup");
                show_dashboard_window(app.handle(), popup);
            }

            let show_hide = MenuItem::with_id(app, "show_hide", "Mostrar/Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_hide, &quit])?;

            let scale = app
                .get_webview_window("main")
                .and_then(|w| w.scale_factor().ok())
                .unwrap_or(1.0);
            TRAY_USE_DETAILED.store(scale >= TRAY_DETAILED_MIN_SCALE, Ordering::Relaxed);

            let tray = TrayIconBuilder::new()
                .icon(tray_image(false))
                .tooltip("Cynote")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_hide" => {
                        stop_tray_alert();
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_window(&window);
                        }
                    }
                    "quit" => {
                        // Don't drop unsaved work just because the tray menu
                        // was clicked - let the frontend check for unsaved
                        // tabs and confirm (or not) before we actually exit.
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("quit-requested", ());
                        } else {
                            app.exit(0);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        stop_tray_alert();
                    }
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
            app.manage(tray);

            Ok(())
        })
        .on_window_event(|window, event| {
            // The dashboard window is a lightweight, disposable panel - only
            // "main" hides-to-tray and remembers its geometry across launches.
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    save_window_geometry(window.app_handle(), window);
                    let _ = window.hide();
                }
                WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                    save_window_geometry(window.app_handle(), window);
                }
                WindowEvent::Focused(true) => stop_tray_alert(),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            save_notes,
            load_notes,
            export_note_txt,
            quit_app,
            take_startup_file,
            dashboard::scan_txt_notes,
            dashboard::note_previews,
            dashboard::read_txt_file,
            dashboard::file_exists,
            dashboard::open_note_in_main,
            identity::get_device_identity,
            sync::list_discovered_devices,
            sync::list_trusted_devices,
            sync::list_reachable_trusted_devices,
            sync::fetch_peer_notes,
            sync::request_pairing,
            sync::list_pairing_requests,
            sync::respond_to_pairing,
            cloud_sync::get_cloud_sync_id,
            cloud_sync::generate_cloud_sync_id,
            cloud_sync::set_cloud_sync_id,
            cloud_sync::clear_cloud_sync_id,
            cloud_sync::push_cloud_notes,
            cloud_sync::fetch_cloud_peers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
