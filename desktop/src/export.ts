import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function safeFileName(title: string): string {
  const trimmed = title.trim() || "Nova nota";
  return trimmed.replace(/[\\/:*?"<>|]/g, "-");
}

/** Returns true if the note was actually written, false if the user cancelled the dialog. */
export async function exportNoteAsTxt(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false;
  const path = await save({
    defaultPath: `${safeFileName(title)}.txt`,
    filters: [{ name: "Texto", extensions: ["txt"] }],
  });
  if (!path) return false;
  const contents = title.trim() ? `${title}\n\n${body}` : body;
  await invoke("export_note_txt", { path, contents });
  return true;
}
