use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone)]
pub struct DeviceIdentity {
    #[serde(rename = "deviceId")]
    pub device_id: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
}

fn identity_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("device.json"))
}

fn host_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Computador".to_string())
}

pub fn load_or_create(app: &AppHandle) -> Result<DeviceIdentity, String> {
    let path = identity_file_path(app)?;
    if path.exists() {
        let contents = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if let Ok(identity) = serde_json::from_str::<DeviceIdentity>(&contents) {
            return Ok(identity);
        }
    }

    let identity = DeviceIdentity {
        device_id: Uuid::new_v4().to_string(),
        device_name: host_name(),
    };
    let json = serde_json::to_string(&identity).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(identity)
}

#[tauri::command]
pub fn get_device_identity(app: AppHandle) -> Result<DeviceIdentity, String> {
    load_or_create(&app)
}
