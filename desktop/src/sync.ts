import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PeerInfo } from "./types";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function listDiscoveredDevices(): Promise<PeerInfo[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<PeerInfo[]>("list_discovered_devices");
  } catch {
    return [];
  }
}

export async function listTrustedDevices(): Promise<PeerInfo[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<PeerInfo[]>("list_trusted_devices");
  } catch {
    return [];
  }
}

export async function listReachableTrustedDevices(): Promise<PeerInfo[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<PeerInfo[]>("list_reachable_trusted_devices");
  } catch {
    return [];
  }
}

interface PeerNotesResponse {
  deviceId: string;
  deviceName: string;
  notes: unknown[];
}

export async function fetchPeerNotes(peer: PeerInfo): Promise<PeerNotesResponse | null> {
  if (!isTauri()) return null;
  try {
    const json = await invoke<string>("fetch_peer_notes", { deviceId: peer.deviceId });
    return JSON.parse(json) as PeerNotesResponse;
  } catch {
    return null;
  }
}

export async function requestPairing(deviceId: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("request_pairing", { deviceId });
  } catch {
    return false;
  }
}

/** Local sync only listens on the network with a device paired, or while
 * Settings is open so a new one can find this computer and pair. */
export async function setLanPairingOpen(open: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("set_lan_pairing_open", { open });
  } catch {
    // best-effort
  }
}

/** Unpairs every device paired on the local network. */
export async function forgetTrustedDevices(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("forget_trusted_devices");
  } catch {
    // best-effort
  }
}

export async function respondToPairing(deviceId: string, accept: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("respond_to_pairing", { deviceId, accept });
  } catch {
    // best-effort
  }
}

export function onPairingRequest(callback: (peer: PeerInfo) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  listen<PeerInfo>("pairing-request", (event) => callback(event.payload)).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
