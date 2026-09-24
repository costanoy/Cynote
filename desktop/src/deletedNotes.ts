const KEY = "cynote-deleted-note-ids";
const MAX_ENTRIES = 5000;

/** Ids of notes closed on this device, so sync never re-imports them from a
 * peer that still has its own copy. */
export function loadDeletedNoteIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids].slice(-MAX_ENTRIES)));
  } catch {
    // best-effort
  }
}

export function markNotesDeleted(ids: string[]): void {
  if (ids.length === 0) return;
  const all = loadDeletedNoteIds();
  ids.forEach((id) => {
    all.delete(id);
    all.add(id);
  });
  save(all);
}

/** A closed note came back on purpose (its .cyte file was reopened). */
export function forgetDeletedNote(id: string): void {
  const all = loadDeletedNoteIds();
  if (all.delete(id)) save(all);
}
