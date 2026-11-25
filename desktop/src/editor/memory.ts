import type { EditorState } from "@codemirror/state";

/*
 * Switching tabs remounts the editor (App keys it by note id). What a note
 * keeps between visits - its whole EditorState, so undo history and every
 * cursor, plus the scroll position - lives here, the way it does per file in
 * Notepad and VS Code.
 */

export interface NoteMemory {
  state: EditorState;
  scrollTop: number;
}

const memory = new Map<string, NoteMemory>();

export function recallNote(id: string): NoteMemory | undefined {
  return memory.get(id);
}

export function rememberNote(id: string, entry: NoteMemory) {
  memory.set(id, entry);
}

/** Drops what is kept for a note (when it is deleted). */
export function forgetNote(id: string) {
  memory.delete(id);
}
