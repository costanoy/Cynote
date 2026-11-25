//! Local half of Cynote sync v2 (see SYNC.md at the repo root).
//!
//! The network part lives in the webview (fetch to the Realtime Database), so
//! this file only keeps two small files in the app data folder:
//!  - `cloud_sync.json`: the sync code (same file older versions wrote, so
//!    existing users keep their code);
//!  - `sync_state.json`: the per-device sync state, written atomically.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Default)]
struct CloudSyncConfig {
    #[serde(rename = "syncId")]
    sync_id: Option<String>,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Writes `contents` next to `path` as `<name>.tmp`, then renames it over
/// `path`, so a crash or power cut never leaves a half-written file behind.
fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let mut tmp_name = path
        .file_name()
        .ok_or_else(|| "caminho inválido".to_string())?
        .to_os_string();
    tmp_name.push(".tmp");
    let tmp = path.with_file_name(tmp_name);
    let write_tmp = || -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(contents.as_bytes())?;
        // On disk before the rename makes it the real file.
        file.sync_all()
    };
    write_tmp().map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

fn load_config(app: &AppHandle) -> CloudSyncConfig {
    let Ok(dir) = data_dir(app) else { return CloudSyncConfig::default() };
    fs::read_to_string(dir.join("cloud_sync.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, config: &CloudSyncConfig) -> Result<(), String> {
    let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    write_atomic(&data_dir(app)?.join("cloud_sync.json"), &json)
}

/// Codes look like `4F2A9-C81D0-77B3E-0A1C5`. Accepting only that shape keeps
/// a mistyped (or crafted) code from turning into some other database path,
/// and matches what the database rules allow.
pub fn normalize_sync_id(raw: &str) -> Option<String> {
    let code = raw.trim().to_uppercase();
    let groups: Vec<&str> = code.split('-').collect();
    let well_formed =
        groups.len() == 4 && groups.iter().all(|g| g.len() == 5 && g.chars().all(|c| c.is_ascii_hexdigit()));
    well_formed.then_some(code)
}

/// The shared sync code, if this device has one - None means sync is off.
#[tauri::command]
pub fn get_cloud_sync_id(app: AppHandle) -> Option<String> {
    load_config(&app).sync_id
}

/// Stores a code (made in the webview, or typed in from another device).
#[tauri::command]
pub fn set_cloud_sync_id(app: AppHandle, sync_id: String) -> Result<(), String> {
    let code = normalize_sync_id(&sync_id).ok_or_else(|| "Código de sincronização inválido".to_string())?;
    save_config(&app, &CloudSyncConfig { sync_id: Some(code) })
}

#[tauri::command]
pub fn clear_cloud_sync_id(app: AppHandle) -> Result<(), String> {
    save_config(&app, &CloudSyncConfig { sync_id: None })
}

/// The sync state file's text, or None when there is none yet. The webview
/// parses it; a damaged file is treated there as "no state".
#[tauri::command]
pub fn load_sync_state(app: AppHandle) -> Option<String> {
    let dir = data_dir(&app).ok()?;
    fs::read_to_string(dir.join("sync_state.json")).ok()
}

#[tauri::command]
pub fn save_sync_state(app: AppHandle, json: String) -> Result<(), String> {
    // Refuse anything that isn't JSON, so a bug upstream can't replace a good
    // state file with garbage.
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    write_atomic(&data_dir(&app)?.join("sync_state.json"), &json)
}

#[cfg(test)]
mod tests {
    use super::{normalize_sync_id, write_atomic};

    #[test]
    fn accepts_only_well_formed_codes() {
        assert_eq!(normalize_sync_id(" 4f2a9-c81d0-77b3e-0a1c5 "), Some("4F2A9-C81D0-77B3E-0A1C5".to_string()));
        assert_eq!(normalize_sync_id("4F2A9-C81D0-77B3E"), None);
        assert_eq!(normalize_sync_id("4F2A9-C81D0-77B3E-0A1CZ"), None);
        assert_eq!(normalize_sync_id("../../x"), None);
        assert_eq!(normalize_sync_id("4F2A9-C81D0-77B3E-0A1C5/../y"), None);
    }

    #[test]
    fn atomic_write_replaces_the_file_and_leaves_no_temp() {
        let dir = std::env::temp_dir().join(format!("cynote-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sync_state.json");
        write_atomic(&path, "{\"a\":1}").unwrap();
        write_atomic(&path, "{\"a\":2}").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"a\":2}");
        assert!(!dir.join("sync_state.json.tmp").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
