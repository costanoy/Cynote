import { invoke } from "@tauri-apps/api/core";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The shared pairing code, if this device has one set up - null means cloud sync is off. */
export async function getCloudSyncId(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string | null>("get_cloud_sync_id");
  } catch {
    return null;
  }
}

/** Creates a new code for this device to show and share, if one doesn't exist yet. */
export async function generateCloudSyncId(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("generate_cloud_sync_id");
  } catch {
    return null;
  }
}

/** Joins an existing pairing by entering the code shown on another device. */
export async function setCloudSyncId(syncId: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("set_cloud_sync_id", { syncId });
    return true;
  } catch {
    return false;
  }
}

export async function clearCloudSyncId(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("clear_cloud_sync_id");
  } catch {
    // best-effort
  }
}

export async function pushCloudNotes(
  syncId: string,
  deviceId: string,
  deviceName: string,
  notes: unknown[]
): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("push_cloud_notes", {
      syncId,
      deviceId,
      deviceName,
      notesJson: JSON.stringify(notes),
    });
  } catch {
    // best-effort - picked up again on the next cycle
  }
}

export interface CloudPeer {
  deviceId: string;
  deviceName: string;
  notes: unknown[];
}

export async function fetchCloudPeers(syncId: string, myDeviceId: string): Promise<CloudPeer[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<CloudPeer[]>("fetch_cloud_peers", { syncId, myDeviceId });
  } catch {
    return [];
  }
}
