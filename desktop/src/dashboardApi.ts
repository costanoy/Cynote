import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface ScannedNote {
  fullPath: string;
  rootLabel: string;
  relativeDirs: string[];
  fileName: string;
}

export async function scanTxtNotes(): Promise<ScannedNote[]> {
  if (!isTauri()) return [];
  return invoke<ScannedNote[]>("scan_txt_notes");
}

/** Brings the main window to front and hands it this note to open as a tab. */
export async function openNoteInMain(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_note_in_main", { path });
}

/** Raw file text - the frontend (cynoteFormat.ts) splits title/body/metadata from it. */
export async function readNoteFileRaw(path: string): Promise<string> {
  return invoke<string>("read_txt_file", { path });
}

/** A file path passed on the command line at launch (Explorer "Open with" /
 * double-click via the .cyte file association), if there was one. Only
 * returns it once - call this exactly once, on startup. */
export async function takeStartupFile(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("take_startup_file");
}

/** Fired by open_note_in_main (Rust) at the "main" window when a note is picked in the Dashboard. */
export function onOpenNoteFile(callback: (path: string) => void): () => void {
  if (!isTauri()) return () => {};
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  listen<string>("open-note-file", (event) => callback(event.payload)).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
