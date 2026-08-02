use crate::identity::DeviceIdentity;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Method, Response, Server};

const SERVICE_TYPE: &str = "_cynote._tcp.local.";

#[derive(Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    #[serde(rename = "deviceId")]
    pub device_id: String,
    #[serde(rename = "deviceName")]
    pub device_name: String,
    pub address: String,
    pub port: u16,
}

#[derive(Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PairStatus {
    Pending,
    Accepted,
    Declined,
}

pub struct SyncStateInner {
    pub own: DeviceIdentity,
    pub my_port: u16,
    pub discovered: HashMap<String, PeerInfo>,
    pub trusted: HashMap<String, String>,
    pub incoming: HashMap<String, (PeerInfo, PairStatus)>,
}

pub type SyncState = Arc<Mutex<SyncStateInner>>;

fn trusted_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("trusted_devices.json"))
}

fn load_trusted(app: &AppHandle) -> HashMap<String, String> {
    trusted_file_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_trusted(app: &AppHandle, trusted: &HashMap<String, String>) {
    if let Ok(path) = trusted_file_path(app) {
        if let Ok(json) = serde_json::to_string(trusted) {
            let _ = fs::write(path, json);
        }
    }
}

fn json_response(status: u16, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    Response::from_string(body)
        .with_status_code(tiny_http::StatusCode(status))
        .with_header(header)
}

fn parse_query(url: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Some((_, query)) = url.split_once('?') {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                out.insert(k.to_string(), v.to_string());
            }
        }
    }
    out
}

fn handle_request(app: &AppHandle, state: &SyncState, mut request: tiny_http::Request) {
    let method = request.method().clone();
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("").to_string();

    let response = match (&method, path.as_str()) {
        (Method::Get, "/cynote/notes") => {
            let own = state.lock().unwrap().own.clone();
            let notes_json = crate::notes_file_path(app)
                .ok()
                .and_then(|p| fs::read_to_string(p).ok())
                .unwrap_or_else(|| "[]".to_string());
            let body = format!(
                "{{\"deviceId\":{:?},\"deviceName\":{:?},\"notes\":{}}}",
                own.device_id, own.device_name, notes_json
            );
            json_response(200, &body)
        }
        (Method::Post, "/cynote/pair-request") => {
            let mut body = String::new();
            let _ = request.as_reader().read_to_string(&mut body);
            let remote_addr = request
                .remote_addr()
                .map(|a| a.ip().to_string())
                .unwrap_or_default();

            if let Ok(peer) = serde_json::from_str::<serde_json::Value>(&body) {
                let device_id = peer["deviceId"].as_str().unwrap_or_default().to_string();
                let device_name = peer["deviceName"].as_str().unwrap_or("Dispositivo").to_string();
                let port = peer["port"].as_u64().unwrap_or(0) as u16;
                let info = PeerInfo {
                    device_id: device_id.clone(),
                    device_name,
                    address: remote_addr,
                    port,
                };

                {
                    let mut s = state.lock().unwrap();
                    s.incoming.insert(device_id, (info.clone(), PairStatus::Pending));
                }
                let _ = app.emit("pairing-request", &info);
                json_response(200, "{\"status\":\"pending\"}")
            } else {
                json_response(400, "{\"error\":\"invalid body\"}")
            }
        }
        (Method::Get, "/cynote/pair-status") => {
            let q = parse_query(&url);
            let device_id = q.get("deviceId").cloned().unwrap_or_default();
            let s = state.lock().unwrap();
            let status = s
                .incoming
                .get(&device_id)
                .map(|(_, st)| match st {
                    PairStatus::Pending => "pending",
                    PairStatus::Accepted => "accepted",
                    PairStatus::Declined => "declined",
                })
                .unwrap_or("unknown");
            json_response(200, &format!("{{\"status\":\"{}\"}}", status))
        }
        _ => json_response(404, "{\"error\":\"not found\"}"),
    };

    let _ = request.respond(response);
}

pub fn start(app: AppHandle, own: DeviceIdentity) {
    let trusted = load_trusted(&app);
    let state: SyncState = Arc::new(Mutex::new(SyncStateInner {
        own: own.clone(),
        my_port: 0,
        discovered: HashMap::new(),
        trusted,
        incoming: HashMap::new(),
    }));
    app.manage(state.clone());

    let server = match Server::http("0.0.0.0:0") {
        Ok(s) => s,
        Err(_) => return,
    };
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    state.lock().unwrap().my_port = port;

    // HTTP request-handling loop
    {
        let app = app.clone();
        let state = state.clone();
        std::thread::spawn(move || {
            for request in server.incoming_requests() {
                handle_request(&app, &state, request);
            }
        });
    }

    // mDNS advertise + browse
    let mdns = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(_) => return,
    };

    let mut props = HashMap::new();
    props.insert("deviceId".to_string(), own.device_id.clone());
    props.insert("deviceName".to_string(), own.device_name.clone());
    let instance_name = own.device_id.clone();
    let host_name = format!("{}.local.", own.device_id);

    if let Ok(service_info) = ServiceInfo::new(SERVICE_TYPE, &instance_name, &host_name, "", port, props)
        .map(|info| info.enable_addr_auto())
    {
        let _ = mdns.register(service_info);
    }

    if let Ok(receiver) = mdns.browse(SERVICE_TYPE) {
        let my_device_id = own.device_id.clone();
        std::thread::spawn(move || {
            while let Ok(event) = receiver.recv() {
                if let ServiceEvent::ServiceResolved(info) = event {
                    let props = info.get_properties();
                    let device_id = props
                        .get_property_val_str("deviceId")
                        .unwrap_or_default()
                        .to_string();
                    if device_id.is_empty() || device_id == my_device_id {
                        continue;
                    }
                    let device_name = props
                        .get_property_val_str("deviceName")
                        .unwrap_or("Dispositivo")
                        .to_string();
                    let address = info
                        .get_addresses()
                        .iter()
                        .next()
                        .map(|ip| ip.to_string())
                        .unwrap_or_default();
                    if address.is_empty() {
                        continue;
                    }
                    let peer = PeerInfo {
                        device_id: device_id.clone(),
                        device_name,
                        address,
                        port: info.get_port(),
                    };
                    let mut s = state.lock().unwrap();
                    s.discovered.insert(device_id, peer);
                }
            }
        });
    }
}

#[tauri::command]
pub fn list_discovered_devices(state: tauri::State<SyncState>) -> Vec<PeerInfo> {
    let s = state.lock().unwrap();
    s.discovered
        .values()
        .filter(|p| !s.trusted.contains_key(&p.device_id))
        .cloned()
        .collect()
}

#[tauri::command]
pub fn list_trusted_devices(state: tauri::State<SyncState>) -> Vec<PeerInfo> {
    let s = state.lock().unwrap();
    s.trusted
        .iter()
        .map(|(id, name)| PeerInfo {
            device_id: id.clone(),
            device_name: name.clone(),
            address: String::new(),
            port: 0,
        })
        .collect()
}

/// Trusted devices that are also currently visible on the network (i.e. reachable for sync right now).
#[tauri::command]
pub fn list_reachable_trusted_devices(state: tauri::State<SyncState>) -> Vec<PeerInfo> {
    let s = state.lock().unwrap();
    s.discovered
        .values()
        .filter(|p| s.trusted.contains_key(&p.device_id))
        .cloned()
        .collect()
}

#[tauri::command]
pub fn fetch_peer_notes(address: String, port: u16) -> Result<String, String> {
    let url = format!("http://{}:{}/cynote/notes", address, port);
    let resp = ureq::get(&url).call().map_err(|e| e.to_string())?;
    resp.into_string().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn request_pairing(app: AppHandle, state: tauri::State<SyncState>, device_id: String) -> Result<bool, String> {
    let (peer, own, my_port) = {
        let s = state.lock().unwrap();
        let peer = s.discovered.get(&device_id).cloned().ok_or("device not found")?;
        (peer, s.own.clone(), s.my_port)
    };

    let url = format!("http://{}:{}/cynote/pair-request", peer.address, peer.port);
    let body = format!(
        "{{\"deviceId\":{:?},\"deviceName\":{:?},\"port\":{}}}",
        own.device_id, own.device_name, my_port
    );
    ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_string(&body)
        .map_err(|e| e.to_string())?;

    let status_url = format!(
        "http://{}:{}/cynote/pair-status?deviceId={}",
        peer.address, peer.port, own.device_id
    );
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        if let Ok(resp) = ureq::get(&status_url).call() {
            if let Ok(text) = resp.into_string() {
                if text.contains("accepted") {
                    let mut s = state.lock().unwrap();
                    s.trusted.insert(peer.device_id.clone(), peer.device_name.clone());
                    save_trusted(&app, &s.trusted);
                    return Ok(true);
                }
                if text.contains("declined") {
                    return Ok(false);
                }
            }
        }
    }
    Ok(false)
}

#[tauri::command]
pub fn list_pairing_requests(state: tauri::State<SyncState>) -> Vec<PeerInfo> {
    let s = state.lock().unwrap();
    s.incoming
        .values()
        .filter(|(_, status)| *status == PairStatus::Pending)
        .map(|(info, _)| info.clone())
        .collect()
}

#[tauri::command]
pub fn respond_to_pairing(
    app: AppHandle,
    state: tauri::State<SyncState>,
    device_id: String,
    accept: bool,
) -> Result<(), String> {
    let mut s = state.lock().unwrap();
    let accepted_info = if accept {
        s.incoming.get(&device_id).map(|(info, _)| info.clone())
    } else {
        None
    };
    if let Some((_, status)) = s.incoming.get_mut(&device_id) {
        *status = if accept {
            PairStatus::Accepted
        } else {
            PairStatus::Declined
        };
    }
    if let Some(info) = accepted_info {
        s.trusted.insert(info.device_id, info.device_name);
        save_trusted(&app, &s.trusted);
    }
    Ok(())
}
