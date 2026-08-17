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
