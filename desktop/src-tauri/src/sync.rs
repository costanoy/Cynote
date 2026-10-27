use crate::identity::DeviceIdentity;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::net::{SocketAddr, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Method, Response, Server};

const SERVICE_TYPE: &str = "_cynote._tcp.local.";
// A peer that's gone dark (phone locked/asleep, left the network...) should
// fail fast instead of tying up whatever thread made the call - ureq has no
// default timeout at all, and these commands run synchronously on the same
// thread that services the webview's IPC, so an unbounded hang here used to
// freeze the whole window (Windows would eventually report it as "not
// responding").
const HTTP_TIMEOUT: Duration = Duration::from_secs(5);

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

/// A paired device, and the secret both sides agreed on when pairing. Every
/// request for notes - in either direction - has to present that secret;
/// without it, anyone on the same network could ask for (and get) them.
#[derive(Clone, Serialize, Deserialize)]
pub struct TrustedPeer {
    pub name: String,
    pub secret: String,
}

pub struct SyncStateInner {
    pub own: DeviceIdentity,
    pub my_port: u16,
    pub discovered: HashMap<String, PeerInfo>,
    pub trusted: HashMap<String, TrustedPeer>,
    /// Pairing requests waiting on the user, with the secret each one proposed.
    pub incoming: HashMap<String, (PeerInfo, PairStatus, String)>,
    /// Settings is open, where a new device gets paired.
    pairing_open: bool,
    lan: Option<LanService>,
}

/// What runs while local sync is on: the listener paired devices fetch notes
/// from (and new ones send pairing requests to), and the mDNS daemon that
/// announces it and finds the other devices.
struct LanService {
    server: Arc<Server>,
    mdns: ServiceDaemon,
    fullname: String,
}

pub type SyncState = Arc<Mutex<SyncStateInner>>;

fn trusted_file_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("trusted_devices.json"))
}

/// Devices paired by older versions were stored as just a name, with no
/// secret to check them against - they're dropped, and need pairing again.
fn load_trusted(app: &AppHandle) -> HashMap<String, TrustedPeer> {
    let raw: HashMap<String, serde_json::Value> = trusted_file_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    raw.into_iter()
        .filter_map(|(id, v)| serde_json::from_value::<TrustedPeer>(v).ok().map(|t| (id, t)))
        .filter(|(_, t)| is_valid_secret(&t.secret))
        .collect()
}

fn save_trusted(app: &AppHandle, trusted: &HashMap<String, TrustedPeer>) {
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

fn new_secret() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

fn is_valid_secret(secret: &str) -> bool {
    (32..=128).contains(&secret.len()) && secret.chars().all(|c| c.is_ascii_hexdigit())
}

/// Compares in constant time, so response timing can't reveal how much of a
/// guessed secret was right.
fn same_secret(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn bearer_token(request: &tiny_http::Request) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .and_then(|h| h.value.as_str().strip_prefix("Bearer ").map(|t| t.trim().to_string()))
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
            let authorized = bearer_token(&request).is_some_and(|token| {
                state.lock().unwrap().trusted.values().any(|t| same_secret(&t.secret, &token))
            });
            if !authorized {
                json_response(401, "{\"error\":\"not paired\"}")
            } else {
                let own = state.lock().unwrap().own.clone();
                let notes: serde_json::Value = crate::notes_file_path(app)
                    .ok()
                    .and_then(|p| fs::read_to_string(p).ok())
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_else(|| serde_json::json!([]));
                let body = serde_json::json!({
                    "deviceId": own.device_id,
                    "deviceName": own.device_name,
                    "notes": notes,
                });
                json_response(200, &body.to_string())
            }
        }
        (Method::Post, "/cynote/pair-request") => {
            // A pairing request is a few hundred bytes - don't let anyone on
            // the network make this read an unbounded body into memory.
            let mut body = String::new();
            let _ = request.as_reader().take(16 * 1024).read_to_string(&mut body);
            let remote_addr = request
                .remote_addr()
                .map(|a| a.ip().to_string())
                .unwrap_or_default();

            let fields = serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|peer| {
                let device_id: String = peer["deviceId"].as_str()?.chars().take(64).collect();
                let secret = peer["secret"].as_str()?.to_string();
                if device_id.is_empty() || !is_valid_secret(&secret) {
                    return None;
                }
                let device_name: String = peer["deviceName"].as_str().unwrap_or("Dispositivo").chars().take(80).collect();
                let port = peer["port"].as_u64().unwrap_or(0) as u16;
                Some((device_id, device_name, port, secret))
            });

            match fields {
                Some((device_id, device_name, port, secret)) => {
                    let info = PeerInfo {
                        device_id: device_id.clone(),
                        device_name,
                        address: remote_addr,
                        port,
                    };
                    let is_new = {
                        let mut s = state.lock().unwrap();
                        // While a request is waiting on the user, another one
                        // claiming to be the same device can't swap in its own secret.
                        let pending = matches!(s.incoming.get(&device_id), Some((_, PairStatus::Pending, _)));
                        if !pending {
                            s.incoming.insert(device_id, (info.clone(), PairStatus::Pending, secret));
                        }
                        !pending
                    };
                    if is_new {
                        let _ = app.emit("pairing-request", &info);
                        crate::flash_tray_icon(app);
                    }
                    json_response(200, "{\"status\":\"pending\"}")
                }
                // Also what older versions get: they don't send a pairing secret.
                None => json_response(400, "{\"error\":\"invalid body\"}"),
            }
        }
        (Method::Get, "/cynote/pair-status") => {
            let q = parse_query(&url);
            let device_id = q.get("deviceId").cloned().unwrap_or_default();
            let s = state.lock().unwrap();
            let status = s
                .incoming
                .get(&device_id)
                .map(|(_, st, _)| match st {
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
        own,
        my_port: 0,
        discovered: HashMap::new(),
        trusted,
        incoming: HashMap::new(),
        pairing_open: false,
        lan: None,
    }));
    app.manage(state.clone());
    update_lan(&app, &state);
}

/// Local sync only listens on the network while it's in use: with a paired
/// device, while Settings is open to pair a new one, or while a pairing
/// request waits on an answer. Otherwise nothing listens at all - before,
/// the listener stayed open on every network the computer joined, for as
/// long as Cynote ran, even with nothing ever paired.
fn lan_needed(s: &SyncStateInner) -> bool {
    s.pairing_open
        || !s.trusted.is_empty()
        || s.incoming.values().any(|(_, status, _)| *status == PairStatus::Pending)
}

/// Starts or stops local sync to match lan_needed.
fn update_lan(app: &AppHandle, state: &SyncState) {
    let mut s = state.lock().unwrap();
    if lan_needed(&s) {
        if s.lan.is_none() {
            start_lan(app, state, &mut s);
        }
    } else if let Some(lan) = s.lan.take() {
        stop_lan(lan);
        s.my_port = 0;
        s.discovered.clear();
    }
}

fn start_lan(app: &AppHandle, state: &SyncState, s: &mut SyncStateInner) {
    let server = match Server::http("0.0.0.0:0") {
        Ok(server) => Arc::new(server),
        Err(_) => return,
    };
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);

    // HTTP request-handling loop, until stop_lan unblocks it
    {
        let app = app.clone();
        let state = state.clone();
        let server = server.clone();
        std::thread::spawn(move || {
            for request in server.incoming_requests() {
                handle_request(&app, &state, request);
            }
            close_server(server, port);
        });
    }

    // mDNS advertise + browse
    let mdns = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(_) => {
            server.unblock();
            return;
        }
    };

    let mut props = HashMap::new();
    props.insert("deviceId".to_string(), s.own.device_id.clone());
    props.insert("deviceName".to_string(), s.own.device_name.clone());
    let instance_name = s.own.device_id.clone();
    let host_name = format!("{}.local.", s.own.device_id);

    let mut fullname = String::new();
    if let Ok(service_info) = ServiceInfo::new(SERVICE_TYPE, &instance_name, &host_name, "", port, props)
        .map(|info| info.enable_addr_auto())
    {
        fullname = service_info.get_fullname().to_string();
        let _ = mdns.register(service_info);
    }

    if let Ok(receiver) = mdns.browse(SERVICE_TYPE) {
        let my_device_id = s.own.device_id.clone();
        let state = state.clone();
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
                    if s.lan.is_some() {
                        s.discovered.insert(device_id, peer);
                    }
                }
            }
        });
    }

    s.my_port = port;
    s.lan = Some(LanService { server, mdns, fullname });
}

/// Turns local sync off: the announcement is withdrawn and the listener
/// closes as soon as its loop notices (see close_server).
fn stop_lan(lan: LanService) {
    if !lan.fullname.is_empty() {
        let _ = lan.mdns.unregister(&lan.fullname);
    }
    let _ = lan.mdns.shutdown();
    lan.server.unblock();
}

/// Closes a stopped listener for good. tiny_http wakes its accept thread by
/// connecting to the address it listens on, which Windows refuses for
/// 0.0.0.0 - the port would stay open until something else connected.
/// Connecting over loopback instead wakes it right away.
fn close_server(mut server: Arc<Server>, port: u16) {
    // stop_lan lets go of its handle right after unblocking the loop. (If the
    // loop ended on its own, the listener is already closed - give up.)
    for _ in 0..50 {
        match Arc::try_unwrap(server) {
            Ok(owned) => {
                drop(owned);
                let loopback = SocketAddr::from(([127, 0, 0, 1], port));
                let _ = TcpStream::connect_timeout(&loopback, Duration::from_secs(1));
                return;
            }
            Err(shared) => {
                server = shared;
                std::thread::sleep(Duration::from_millis(20));
            }
        }
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
        .map(|(id, peer)| PeerInfo {
            device_id: id.clone(),
            device_name: peer.name.clone(),
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
pub async fn fetch_peer_notes(state: tauri::State<'_, SyncState>, device_id: String) -> Result<String, String> {
    let (peer, secret) = {
        let s = state.lock().unwrap();
        let peer = s.discovered.get(&device_id).cloned().ok_or("device not reachable")?;
        let secret = s.trusted.get(&device_id).map(|t| t.secret.clone()).ok_or("device not paired")?;
        (peer, secret)
    };
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("http://{}:{}/cynote/notes", peer.address, peer.port);
        let resp = ureq::get(&url)
            .timeout(HTTP_TIMEOUT)
            .set("Authorization", &format!("Bearer {}", secret))
            .call()
            .map_err(|e| e.to_string())?;
        resp.into_string().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn request_pairing(
    app: AppHandle,
    state: tauri::State<'_, SyncState>,
    device_id: String,
) -> Result<bool, String> {
    let sync_state: SyncState = state.inner().clone();
    let (peer, own, my_port) = {
        let s = sync_state.lock().unwrap();
        let peer = s.discovered.get(&device_id).cloned().ok_or("device not found")?;
        (peer, s.own.clone(), s.my_port)
    };
    let peer_id = peer.device_id.clone();
    let peer_name = peer.device_name.clone();
    // Proposed by whoever starts the pairing; both sides keep it once accepted.
    let secret = new_secret();
    let secret_for_request = secret.clone();

    let accepted = tauri::async_runtime::spawn_blocking(move || -> Result<bool, String> {
        let url = format!("http://{}:{}/cynote/pair-request", peer.address, peer.port);
        let body = serde_json::json!({
            "deviceId": own.device_id,
            "deviceName": own.device_name,
            "port": my_port,
            "secret": secret_for_request,
        })
        .to_string();
        ureq::post(&url)
            .timeout(HTTP_TIMEOUT)
            .set("Content-Type", "application/json")
            .send_string(&body)
            .map_err(|e| e.to_string())?;

        let status_url = format!(
            "http://{}:{}/cynote/pair-status?deviceId={}",
            peer.address, peer.port, own.device_id
        );
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            if let Ok(resp) = ureq::get(&status_url).timeout(HTTP_TIMEOUT).call() {
                if let Ok(text) = resp.into_string() {
                    if text.contains("accepted") {
                        return Ok(true);
                    }
                    if text.contains("declined") {
                        return Ok(false);
                    }
                }
            }
        }
        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())??;

    if accepted {
        {
            let mut s = sync_state.lock().unwrap();
            s.trusted.insert(peer_id, TrustedPeer { name: peer_name, secret });
            save_trusted(&app, &s.trusted);
        }
        // Paired now, so local sync stays on even after Settings closes.
        update_lan(&app, &sync_state);
    }
    Ok(accepted)
}

/// Settings opened or closed: while it's open, local sync runs so a new
/// device can find this one and pair (see lan_needed).
#[tauri::command]
pub fn set_lan_pairing_open(app: AppHandle, state: tauri::State<SyncState>, open: bool) {
    state.lock().unwrap().pairing_open = open;
    update_lan(&app, state.inner());
}

/// Unpairs every device paired on the local network - with none left, local
/// sync stops listening once Settings closes.
#[tauri::command]
pub fn forget_trusted_devices(app: AppHandle, state: tauri::State<SyncState>) {
    {
        let mut s = state.lock().unwrap();
        s.trusted.clear();
        save_trusted(&app, &s.trusted);
    }
    update_lan(&app, state.inner());
}

#[tauri::command]
pub fn list_pairing_requests(state: tauri::State<SyncState>) -> Vec<PeerInfo> {
    let s = state.lock().unwrap();
    s.incoming
        .values()
        .filter(|(_, status, _)| *status == PairStatus::Pending)
        .map(|(info, _, _)| info.clone())
        .collect()
}

#[tauri::command]
pub fn respond_to_pairing(
    app: AppHandle,
    state: tauri::State<SyncState>,
    device_id: String,
    accept: bool,
) -> Result<(), String> {
    {
        let mut s = state.lock().unwrap();
        let accepted_info = if accept {
            s.incoming.get(&device_id).map(|(info, _, secret)| (info.clone(), secret.clone()))
        } else {
            None
        };
        if let Some((_, status, _)) = s.incoming.get_mut(&device_id) {
            *status = if accept {
                PairStatus::Accepted
            } else {
                PairStatus::Declined
            };
        }
        if let Some((info, secret)) = accepted_info {
            s.trusted.insert(info.device_id, TrustedPeer { name: info.device_name, secret });
            save_trusted(&app, &s.trusted);
        }
    }
    // A declined request was the last thing keeping local sync on, if
    // Settings has closed meanwhile and nothing is paired.
    update_lan(&app, state.inner());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_valid_secret, new_secret, same_secret};

    #[test]
    fn pairing_secrets() {
        let s = new_secret();
        assert_eq!(s.len(), 64);
        assert!(is_valid_secret(&s));
        assert_ne!(s, new_secret());
        assert!(same_secret(&s, &s.clone()));
        assert!(!same_secret(&s, &new_secret()));
        assert!(!same_secret(&s, &s[..63]));
        assert!(!is_valid_secret("short"));
        assert!(!is_valid_secret(&"z".repeat(64)));
    }
}
