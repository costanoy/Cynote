use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Realtime Database REST endpoint. Not itself a secret - what actually
/// gates access is the per-pairing syncId (see generate_sync_id), which
/// Firebase's rules require knowing before any path under it is readable
/// or writable. See the security rules note shipped alongside this feature.
const DB_URL: &str = "https://cynote-f5f04-default-rtdb.firebaseio.com";
const HTTP_TIMEOUT: Duration = Duration::from_secs(8);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct CloudSyncConfig {
    #[serde(rename = "syncId")]
    sync_id: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("cloud_sync.json"))
}

fn load_config(app: &AppHandle) -> CloudSyncConfig {
    let Ok(path) = config_path(app) else { return CloudSyncConfig::default() };
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, config: &CloudSyncConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// A capability code, not a password meant to be memorized - long enough
/// (20 hex chars, 80 bits) that guessing it is infeasible, grouped for
/// readability on the off chance someone types it by hand instead of
/// copy-pasting. Built from two UUID v4s (already a dependency, backed by
/// the OS CSPRNG) rather than pulling in a `rand` crate just for this.
fn generate_sync_id() -> String {
    let raw = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    raw.chars()
        .take(20)
        .collect::<Vec<char>>()
        .chunks(5)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<String>>()
        .join("-")
        .to_uppercase()
}

#[tauri::command]
pub fn get_cloud_sync_id(app: AppHandle) -> Option<String> {
    load_config(&app).sync_id
}

#[tauri::command]
pub fn generate_cloud_sync_id(app: AppHandle) -> Result<String, String> {
    if let Some(existing) = load_config(&app).sync_id {
        return Ok(existing);
    }
    let id = generate_sync_id();
    save_config(&app, &CloudSyncConfig { sync_id: Some(id.clone()) })?;
    Ok(id)
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

fn checked_sync_id(sync_id: &str) -> Result<String, String> {
    normalize_sync_id(sync_id).ok_or_else(|| "Código de pareamento inválido".to_string())
}

#[tauri::command]
pub fn set_cloud_sync_id(app: AppHandle, sync_id: String) -> Result<(), String> {
    let code = checked_sync_id(&sync_id)?;
    save_config(&app, &CloudSyncConfig { sync_id: Some(code) })
}

#[tauri::command]
pub fn clear_cloud_sync_id(app: AppHandle) -> Result<(), String> {
    save_config(&app, &CloudSyncConfig { sync_id: None })
}

/// Publishes this device's own notes under its slot in the shared pairing
/// path. `notes_json` is passed through opaque (a JSON array) - same "dumb
/// pipe" approach as the LAN sync's /cynote/notes endpoint - so this side
/// never needs to know or assume anything about the note shape either
/// platform sends.
#[tauri::command]
pub async fn push_cloud_notes(
    sync_id: String,
    device_id: String,
    device_name: String,
    notes_json: String,
) -> Result<(), String> {
    let sync_id = checked_sync_id(&sync_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let notes: Value = serde_json::from_str(&notes_json).map_err(|e| e.to_string())?;
        let body = serde_json::json!({
            "deviceName": device_name,
            "notes": notes,
            "updatedAt": now_ms(),
        });
        let url = format!("{DB_URL}/sync/{sync_id}/{device_id}.json");
        ureq::put(&url)
            .timeout(HTTP_TIMEOUT)
            .set("Content-Type", "application/json")
            .send_string(&body.to_string())
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct CloudPeer {
    #[serde(rename = "deviceId")]
    device_id: String,
    #[serde(rename = "deviceName")]
    device_name: String,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
    notes: Value,
}

#[derive(Serialize)]
pub struct CloudChanges {
    /// Every other device currently in the pairing.
    devices: Vec<String>,
    /// Full notes, only for devices that pushed since the `known` timestamps.
    changed: Vec<CloudPeer>,
}

fn get_json(url: &str) -> Result<Value, String> {
    let text = ureq::get(url)
        .timeout(HTTP_TIMEOUT)
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}

/// What changed under this pairing since the caller last looked. Downloading
/// every device's notes on every cycle (every 25 s, all day) would eat the
/// database's free monthly download quota as notes - and especially drawings -
/// grow; instead this lists the devices and reads each one's tiny `updatedAt`,
/// and fetches full notes only for devices whose timestamp moved.
#[tauri::command]
pub async fn fetch_cloud_changes(
    sync_id: String,
    my_device_id: String,
    known: HashMap<String, u64>,
) -> Result<CloudChanges, String> {
    let sync_id = checked_sync_id(&sync_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let listing = get_json(&format!("{DB_URL}/sync/{sync_id}.json?shallow=true"))?;
        let devices: Vec<String> = match listing {
            Value::Object(map) => map.keys().filter(|id| **id != my_device_id).cloned().collect(),
            _ => Vec::new(),
        };

        let mut changed = Vec::new();
        for device_id in &devices {
            let stamp = get_json(&format!("{DB_URL}/sync/{sync_id}/{device_id}/updatedAt.json"))?.as_u64();
            if stamp.is_some() && stamp == known.get(device_id).copied() {
                continue;
            }
            let entry = get_json(&format!("{DB_URL}/sync/{sync_id}/{device_id}.json"))?;
            let device_name = entry
                .get("deviceName")
                .and_then(|v| v.as_str())
                .unwrap_or("Dispositivo")
                .to_string();
            let updated_at = entry.get("updatedAt").and_then(|v| v.as_u64()).or(stamp).unwrap_or(0);
            let notes = entry.get("notes").cloned().unwrap_or(Value::Array(vec![]));
            changed.push(CloudPeer { device_id: device_id.clone(), device_name, updated_at, notes });
        }
        Ok(CloudChanges { devices, changed })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::normalize_sync_id;

    #[test]
    fn accepts_only_well_formed_codes() {
        assert_eq!(normalize_sync_id(" 4f2a9-c81d0-77b3e-0a1c5 "), Some("4F2A9-C81D0-77B3E-0A1C5".to_string()));
        assert_eq!(normalize_sync_id("4F2A9-C81D0-77B3E"), None);
        assert_eq!(normalize_sync_id("4F2A9-C81D0-77B3E-0A1CZ"), None);
        assert_eq!(normalize_sync_id("../../x"), None);
        assert_eq!(normalize_sync_id("4F2A9-C81D0-77B3E-0A1C5/../y"), None);
    }
}
