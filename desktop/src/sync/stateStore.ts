// Reads and writes the sync state and the sync code through the Rust side.

import { invoke } from "@tauri-apps/api/core";
import { addIgnored, emptyState, parseState, serializeState, type SyncState } from "./state";

const LEGACY_DELETED_KEY = "cynote-deleted-note-ids";
const LEGACY_BOOKKEEPING_KEY = "cynote-sync-bookkeeping";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Reads what older versions kept in localStorage into the state: the ids of
 * notes closed before v2 become `ignored`. Returns whether there was anything
 * to carry over; the old keys are removed by `dropLegacyKeys`, only after the
 * state holding their content has been saved. */
function readLegacy(state: SyncState): boolean {
  let found = false;
  try {
    const raw = localStorage.getItem(LEGACY_DELETED_KEY);
    if (raw !== null) {
      try {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) addIgnored(state, ids.filter((x): x is string => typeof x === "string"));
      } catch {
        // unreadable list: nothing to carry over
      }
      found = true;
    }
    if (localStorage.getItem(LEGACY_BOOKKEEPING_KEY) !== null) found = true;
  } catch {
    // localStorage unavailable
  }
  return found;
}

function dropLegacyKeys() {
  try {
    localStorage.removeItem(LEGACY_DELETED_KEY);
    localStorage.removeItem(LEGACY_BOOKKEEPING_KEY);
  } catch {
    // localStorage unavailable
  }
}

/** Loads the state (empty when there is none or it is damaged) and carries
 * over the old localStorage lists once. */
export async function loadSyncState(): Promise<SyncState> {
  let state = emptyState();
  if (isTauri()) {
    try {
      const text = await invoke<string | null>("load_sync_state");
      if (text) state = parseState(JSON.parse(text));
    } catch {
      state = emptyState();
    }
  }
  if (readLegacy(state)) {
    try {
      await saveSyncState(state);
      dropLegacyKeys();
    } catch {
      // Not saved: the old keys stay and are read again next launch.
    }
  }
  return state;
}

export async function saveSyncState(state: SyncState): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_sync_state", { json: serializeState(state) });
}

/** The shared code, or null when sync is off. */
export async function loadSyncCode(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return (await invoke<string | null>("get_cloud_sync_id")) ?? null;
  } catch {
    return null;
  }
}

export async function storeSyncCode(code: string): Promise<void> {
  if (!isTauri()) throw new Error("fora do app");
  await invoke("set_cloud_sync_id", { syncId: code });
}

export async function clearSyncCode(): Promise<void> {
  if (!isTauri()) return;
  await invoke("clear_cloud_sync_id");
}
