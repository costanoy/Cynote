import type { TabData } from "../types";

/**
 * Older versions of the merge re-forked a note on every autosave while it
 * differed from the peer's copy, leaving dozens of identical "(do X)" copies
 * behind. Drops copies that are exact duplicates (same title and text) of one
 * already kept - no content is lost, since an identical copy remains. Only
 * touches notes with a `forkedFrom` and no file, which v2 never makes.
 */
export function dropDuplicateCopies(tabs: TabData[]): { tabs: TabData[]; removedIds: string[] } {
  const seen = new Set<string>();
  const removedIds: string[] = [];
  const kept = tabs.filter((t) => {
    if (!t.forkedFrom || t.filePath) return true;
    const key = JSON.stringify([t.title, t.body]);
    if (seen.has(key)) {
      removedIds.push(t.id);
      return false;
    }
    seen.add(key);
    return true;
  });
  return { tabs: kept, removedIds };
}
