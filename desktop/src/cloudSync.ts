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

/** True once the database has the notes - false means try again next cycle. */
export async function pushCloudNotes(syncId: string, deviceId: string, deviceName: string, notesJson: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("push_cloud_notes", { syncId, deviceId, deviceName, notesJson });
    return true;
  } catch {
    return false;
  }
}

export interface CloudPeer {
  deviceId: string;
  deviceName: string;
  updatedAt: number;
  notes: unknown[];
}

export interface CloudChanges {
  /** Every other device currently in the pairing. */
  devices: string[];
  /** Full notes, only for devices that pushed since the `known` timestamps. */
  changed: CloudPeer[];
}

/** Null when the database couldn't be reached. */
export async function fetchCloudChanges(
  syncId: string,
  myDeviceId: string,
  known: Record<string, number>
): Promise<CloudChanges | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<CloudChanges>("fetch_cloud_changes", { syncId, myDeviceId, known });
  } catch {
    return null;
  }
}
