use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
pub struct ScannedNote {
    #[serde(rename = "fullPath")]
    pub full_path: String,
    #[serde(rename = "rootLabel")]
    pub root_label: String,
    #[serde(rename = "relativeDirs")]
    pub relative_dirs: Vec<String>,
    #[serde(rename = "fileName")]
    pub file_name: String,
}

/// Common dev-tool/build directory names that bury the user's own notes under
/// thousands of irrelevant LICENSE.txt/metadata files (seen in practice: a
/// single project's node_modules alone can contribute over a hundred of these).
const SKIP_DIR_NAMES: &[&str] = &[
    "node_modules",
    "build",
    "dist",
    "target",
    ".dart_tool",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
    "Pods",
    ".vs",
    ".idea",
    ".vscode",
    "bin",
    "obj",
];

/// `.cynote` is Cynote's own format (every Save/Save As writes one); `.txt`
/// and `.md` are imported read/write as plain text, for notes that came
/// from elsewhere.
fn has_note_extension(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".cynote") || lower.ends_with(".txt") || lower.ends_with(".md")
}

fn collect_txt_files(dir: &Path, root_label: &str, rel: &mut Vec<String>, depth: u32, out: &mut Vec<ScannedNote>) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        if SKIP_DIR_NAMES.iter().any(|skip| skip.eq_ignore_ascii_case(&name)) {
            continue;
        }
        let Ok(file_type) = entry.file_type() else { continue };
        if file_type.is_dir() {
            rel.push(name);
            collect_txt_files(&entry.path(), root_label, rel, depth + 1, out);
            rel.pop();
        } else if file_type.is_file() && has_note_extension(&name) {
            out.push(ScannedNote {
                full_path: entry.path().to_string_lossy().to_string(),
                root_label: root_label.to_string(),
                relative_dirs: rel.clone(),
                file_name: name,
            });
        }
    }
}

/// Scoped to Desktop + Documents rather than the whole disk, for speed and
/// so Cynote isn't silently indexing unrelated parts of the user's computer.
#[tauri::command]
pub fn scan_txt_notes(app: AppHandle) -> Vec<ScannedNote> {
    let mut out = Vec::new();
    if let Ok(desktop) = app.path().desktop_dir() {
        collect_txt_files(&desktop, "Área de Trabalho", &mut Vec::new(), 0, &mut out);
    }
    if let Ok(docs) = app.path().document_dir() {
        collect_txt_files(&docs, "Documentos", &mut Vec::new(), 0, &mut out);
    }
    out
}

/// Returns the file's raw text - title/body/metadata splitting now happens
/// on the frontend (src/cynoteFormat.ts), since it has to run there anyway
/// to render sketches and needs a single source of truth for the format.
#[tauri::command]
pub fn read_txt_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Brings the main window to front and hands it the note to open; the
/// frontend does the actual read via read_txt_file and creates/activates a tab.
#[tauri::command]
pub fn open_note_in_main(app: AppHandle, path: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    app.emit("open-note-file", path).map_err(|e| e.to_string())
}

pub fn dashboard_icon_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().resource_dir().ok()?;
    let path = dir.join("icons").join("dashboard.ico");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

fn start_menu_programs_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    let data_dir = app.path().data_dir().ok()?;
    Some(data_dir.join("Microsoft").join("Windows").join("Start Menu").join("Programs"))
}

fn write_shortcut(target: &Path, args: &str, icon: Option<&Path>, output: &Path) {
    use mslnk::ShellLink;
    let Ok(mut link) = ShellLink::new(target) else { return };
    link.set_arguments(Some(args.to_string()));
    if let Some(icon_path) = icon {
        link.set_icon_location(Some(icon_path.to_string_lossy().to_string()));
    }
    if let Err(e) = link.create_lnk(output) {
        eprintln!("Failed to create shortcut {}: {e}", output.display());
    }
}

/// One-time setup: gives the user a second, distinct entry point ("Cynote
/// Dashboard") into the folder/notes overview, alongside the regular Cynote
/// shortcut the installer already creates. The Desktop copy is flagged so it
/// opens as a compact popup; the Start Menu copy opens as a normal window.
pub fn create_dashboard_shortcuts_once(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let marker = dir.join("dashboard_shortcuts_created");
    if marker.exists() {
        return;
    }
    let Ok(exe) = std::env::current_exe() else { return };
    let icon = dashboard_icon_path(app);

    if let Ok(desktop) = app.path().desktop_dir() {
        write_shortcut(
            &exe,
            "--dashboard --popup",
            icon.as_deref(),
            &desktop.join("Cynote Dashboard.lnk"),
        );
    }
    if let Some(start_menu) = start_menu_programs_dir(app) {
        let _ = fs::create_dir_all(&start_menu);
        write_shortcut(&exe, "--dashboard", icon.as_deref(), &start_menu.join("Cynote Dashboard.lnk"));
    }

    let _ = fs::write(marker, "");
}
