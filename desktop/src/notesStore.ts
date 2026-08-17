import { invoke } from "@tauri-apps/api/core";
import type { NoteSketch, TabData } from "./types";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isNoteSketch(s: unknown): s is NoteSketch {
  return typeof s === "object" && s !== null && typeof (s as NoteSketch).dataUrl === "string";
}

/** Backfills fields added after some notes.json files were already written on disk. */
function migrate(tabs: unknown[], fallbackDeviceId: string): TabData[] {
  return tabs.map((raw) => {
    const t = raw as Partial<TabData> & { txtPath?: string };
    return {
      id: t.id ?? "n" + Date.now(),
      title: t.title ?? "Nova nota",
      body: t.body ?? "",
      favorite: t.favorite ?? false,
      // Older notes.json files stored sketches as bare timestamp numbers -
      // drop those instead of rendering a broken image.
      sketches: Array.isArray(t.sketches) ? t.sketches.filter(isNoteSketch) : [],
      updatedAt: t.updatedAt ?? Date.now(),
      originDeviceId: t.originDeviceId ?? fallbackDeviceId,
      forkedFrom: t.forkedFrom,
      // `filePath` was named `txtPath` before the .cyte format existed.
      filePath: t.filePath ?? t.txtPath,
      titleIsCustom: t.titleIsCustom,
    };
  });
}

export async function loadNotes(fallbackDeviceId: string): Promise<TabData[] | null> {
  if (!isTauri()) return null;
  try {
    const json = await invoke<string | null>("load_notes");
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? migrate(parsed, fallbackDeviceId) : null;
  } catch {
    return null;
  }
}

export async function saveNotes(tabs: TabData[]): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("save_notes", { json: JSON.stringify(tabs) });
  } catch {
    // best-effort; nothing to surface to the user for a background autosave
  }
}
