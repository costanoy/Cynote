use serde::Serialize;
use std::fs;
use std::io::Read;
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
    /// Last-modified time, in milliseconds since the Unix epoch (0 if unknown).
    #[serde(rename = "modifiedMs")]
    pub modified_ms: u64,
}

/// How much of each file is read to build its preview - enough for three
/// lines on a card.
const PREVIEW_READ_BYTES: u64 = 1024;
const PREVIEW_MAX_CHARS: usize = 220;
/// Previews are only built for the notes on screen; this caps one request.
const PREVIEW_MAX_FILES: usize = 300;

/// Straight from the directory listing - no need to open the file.
fn modified_ms(entry: &fs::DirEntry) -> u64 {
    entry
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_preview(path: &Path, is_cyte: bool) -> String {
    let Ok(file) = fs::File::open(path) else { return String::new() };
    let mut buf = Vec::new();
    if file.take(PREVIEW_READ_BYTES).read_to_end(&mut buf).is_err() {
        return String::new();
    }
    let text = String::from_utf8_lossy(&buf);
    // A .cyte file is "title, blank line, body, metadata footer" - the card
    // already shows the title, and the footer is never meant to be read.
    let text = text.split("<!--CYNOTE:").next().unwrap_or("");
    let text = if is_cyte { text.split_once('\n').map(|(_, rest)| rest).unwrap_or("") } else { text };
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    flat.chars().filter(|c| *c != '\u{FFFD}').take(PREVIEW_MAX_CHARS).collect()
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

/// `.cyte` is Cynote's own format (every Save/Save As writes one); `.txt`
/// and `.md` are imported read/write as plain text, for notes that came
/// from elsewhere.
fn has_note_extension(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".cyte") || lower.ends_with(".txt") || lower.ends_with(".md")
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
                modified_ms: modified_ms(&entry),
                file_name: name,
            });
        }
    }
}

/// Scoped to Desktop + Documents rather than the whole disk, for speed and
/// so Cynote isn't silently indexing unrelated parts of the user's computer.
/// Walking those can take a while on a full disk, so it runs on a worker
/// thread - a plain (sync) command would run on the main thread and freeze
/// every Cynote window until it finished.
#[tauri::command]
pub async fn scan_txt_notes(app: AppHandle) -> Vec<ScannedNote> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        if let Ok(desktop) = app.path().desktop_dir() {
            collect_txt_files(&desktop, "Área de Trabalho", &mut Vec::new(), 0, &mut out);
        }
        if let Ok(docs) = app.path().document_dir() {
            collect_txt_files(&docs, "Documentos", &mut Vec::new(), 0, &mut out);
        }
        out
    })
    .await
    .unwrap_or_default()
}

/// The first few words of each given note, for the cards Dashnotes is
/// showing right now. Kept out of the scan itself: opening every note file
/// under Desktop and Documents made it far too slow.
#[tauri::command]
pub async fn note_previews(paths: Vec<String>) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .take(PREVIEW_MAX_FILES)
            .map(|p| read_preview(Path::new(p), p.to_lowercase().ends_with(".cyte")))
            .collect()
    })
    .await
    .unwrap_or_default()
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
    #[cfg(windows)]
    drop(crate::taskbar::write_dashnotes_shortcut(target, args, icon, output));
    #[cfg(not(windows))]
    let _ = (target, args, icon, output);
}

const SHORTCUT_NAME: &str = "Dashnotes.lnk";
/// What the shortcut was called before Dashnotes got its name.
const OLD_SHORTCUT_NAME: &str = "Cynote Dashboard.lnk";

/// Gives the user a second, distinct entry point ("Dashnotes") into the
/// folder/notes overview, alongside the regular Cynote shortcut the installer
/// already creates. The Desktop copy is flagged so it opens as a compact
/// popup; the Start Menu copy opens as a normal window.
///
/// Created once, on first launch. On every later launch the shortcuts that
/// still exist are rewritten to point at this copy of the app and its current
/// icon - otherwise they keep whatever exe path and icon they were made with,
/// so an update (or a reinstall elsewhere) left them launching a stale copy
/// with the old icon. Shortcuts under the old "Cynote Dashboard" name are
/// renamed; ones the user deleted stay deleted.
pub fn sync_dashboard_shortcuts(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let marker = dir.join("dashboard_shortcuts_created");
    let first_run = !marker.exists();
    let Ok(exe) = std::env::current_exe() else { return };
    let icon = dashboard_icon_path(app);

    let mut places: Vec<(std::path::PathBuf, &str)> = Vec::new();
    if let Ok(desktop) = app.path().desktop_dir() {
        places.push((desktop, "--dashboard --popup"));
    }
    if let Some(start_menu) = start_menu_programs_dir(app) {
        let _ = fs::create_dir_all(&start_menu);
        places.push((start_menu, "--dashboard"));
    }

    for (folder, args) in places {
        let current = folder.join(SHORTCUT_NAME);
        let old = folder.join(OLD_SHORTCUT_NAME);
        let had_old = old.exists();
        if had_old {
            let _ = fs::remove_file(&old);
        }
        if first_run || had_old || current.exists() {
            write_shortcut(&exe, args, icon.as_deref(), &current);
        }
    }

    if first_run {
        let _ = fs::write(marker, "");
    }
}
