import type { TabData } from "./types";

/** Windows paths are case-insensitive and accept either slash. */
export function normalizePath(path: string): string {
  return path.replace(/\//g, "\\").toLowerCase();
}

export function samePath(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && normalizePath(a) === normalizePath(b);
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Identity for a file that carries an id another open file already uses (a
 * copy made in Explorer, or the file a "Save As" to a new name left behind).
 * Derived from the path rather than random, so reopening that same file
 * always gets the same id - it would otherwise reach sync as a new note each
 * time. Saving the file writes this id into it, making the split permanent.
 */
export function idForDuplicateFile(noteId: string, path: string): string {
  return `${noteId}~${hash(normalizePath(path))}`;
}

export type OpenPlan =
  /** Already open: just switch to it. */
  | { action: "focus"; index: number }
  /** A synced copy of this note with no file attached yet: attach this file to it. */
  | { action: "link"; index: number }
  /** The same note, renamed or moved on disk since it was opened: follow it to the new path. */
  | { action: "relink"; index: number }
  /** Open as a new tab with this id. */
  | { action: "open"; id: string };

/** Decides what opening the note file at `path` (whose footer id is `fileNoteId`) should do. */
export async function planOpen(
  tabs: TabData[],
  path: string,
  fileNoteId: string | null,
  fileExists: (path: string) => Promise<boolean>,
  freshId: () => string
): Promise<OpenPlan> {
  const byPath = tabs.findIndex((t) => samePath(t.filePath, path));
  if (byPath !== -1) return { action: "focus", index: byPath };
  if (!fileNoteId) return { action: "open", id: freshId() };

  const byId = tabs.findIndex((t) => t.id === fileNoteId);
  if (byId === -1) return { action: "open", id: fileNoteId };

  const other = tabs[byId];
  if (!other.filePath) return { action: "link", index: byId };
  if (!(await fileExists(other.filePath))) return { action: "relink", index: byId };

  // Both files exist: they're two documents that happen to share an id.
  const dupId = idForDuplicateFile(fileNoteId, path);
  const byDupId = tabs.findIndex((t) => t.id === dupId);
  return byDupId !== -1 ? { action: "focus", index: byDupId } : { action: "open", id: dupId };
}
