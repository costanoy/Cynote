import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function safeFileName(title: string): string {
  const trimmed = title.trim() || "Nova nota";
  return trimmed.replace(/[\\/:*?"<>|]/g, "-");
}

function txtContents(title: string, body: string): string {
  return title.trim() ? `${title}\n\n${body}` : body;
}

/** Notepad-style "Save As": always prompts. Returns the chosen path, or null if the user cancelled. */
export async function saveNoteAsTxt(title: string, body: string): Promise<string | null> {
  if (!isTauri()) return null;
  const path = await save({
    defaultPath: `${safeFileName(title)}.txt`,
    filters: [{ name: "Texto", extensions: ["txt"] }],
  });
  if (!path) return null;
  await invoke("export_note_txt", { path, contents: txtContents(title, body) });
  return path;
}

/** Notepad-style "Save": silently overwrites a path a previous Save/Save As already established. */
export async function writeTxtFile(path: string, title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("export_note_txt", { path, contents: txtContents(title, body) });
}
