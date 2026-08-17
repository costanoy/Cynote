import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { serializeCynoteNote } from "./cynoteFormat";
import type { TabData } from "./types";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function safeFileName(title: string): string {
  const trimmed = title.trim() || "Nova nota";
  return trimmed.replace(/[\\/:*?"<>|]/g, "-");
}

/** Notepad-style "Save As": always prompts. Returns the chosen path, or null if the user cancelled. */
export async function saveNoteAsCynote(tab: TabData): Promise<string | null> {
  if (!isTauri()) return null;
  const path = await save({
    defaultPath: `${safeFileName(tab.title)}.cyte`,
    filters: [{ name: "Nota Cynote", extensions: ["cyte"] }],
  });
  if (!path) return null;
  await invoke("export_note_txt", { path, contents: serializeCynoteNote(tab) });
  return path;
}

/** Notepad-style "Save": silently overwrites a path a previous Save/Save As already established. */
export async function writeCynoteFile(path: string, tab: TabData): Promise<void> {
  if (!isTauri()) return;
  await invoke("export_note_txt", { path, contents: serializeCynoteNote(tab) });
}
