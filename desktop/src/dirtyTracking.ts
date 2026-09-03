import type { TabData } from "./types";

/**
 * Tracks, per tab, whether its title/body/sketches differ from the last time
 * this device actually wrote them to a real file (or from how they were
 * loaded at launch, which counts as "saved" since it's already durably on
 * disk in notes.json). This is what powers the unsaved-changes dot on tabs
 * and the confirm-before-closing/quitting prompts.
 */

export interface SavedSnapshot {
  title: string;
  body: string;
  sketchesKey: string;
}

// A tab with no snapshot yet (never saved to a file) is compared against a
// blank note - so a fresh "Nova nota" tab isn't flagged dirty until it
// actually has something in it worth losing.
export const EMPTY_SNAPSHOT: SavedSnapshot = { title: "Nova nota", body: "", sketchesKey: "[]" };

export function snapshotOf(tab: TabData): SavedSnapshot {
  return { title: tab.title, body: tab.body, sketchesKey: JSON.stringify(tab.sketches) };
}

export function isDirty(tab: TabData, snapshot: SavedSnapshot | undefined): boolean {
  const snap = snapshot ?? EMPTY_SNAPSHOT;
  const current = snapshotOf(tab);
  return current.title !== snap.title || current.body !== snap.body || current.sketchesKey !== snap.sketchesKey;
}

/** Whether the tab has anything worth protecting - an empty untitled note isn't. */
export function tabHasContent(tab: TabData): boolean {
  return tab.body.trim() !== "" || tab.sketches.length > 0;
}
