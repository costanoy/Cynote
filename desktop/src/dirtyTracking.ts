import type { NoteSketch, TabData } from "./types";

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
export const EMPTY_SNAPSHOT: SavedSnapshot = { title: "Nova nota", body: "", sketchesKey: "" };

// Drawings never change in place (an edit makes a new object), and this runs
// for every tab on every render - so each one is serialized only once.
const sketchKeys = new WeakMap<NoteSketch, string>();

function sketchKey(s: NoteSketch): string {
  let key = sketchKeys.get(s);
  if (key === undefined) {
    // The anchor just follows the text around; the edit that moved it is
    // what makes the note unsaved.
    const { anchor: _anchor, ...rest } = s;
    key = JSON.stringify(rest);
    sketchKeys.set(s, key);
  }
  return key;
}

export function snapshotOf(tab: TabData): SavedSnapshot {
  return { title: tab.title, body: tab.body, sketchesKey: (tab.sketches ?? []).map(sketchKey).join("\n") };
}

export function isDirty(tab: TabData, snapshot: SavedSnapshot | undefined): boolean {
  const snap = snapshot ?? EMPTY_SNAPSHOT;
  const current = snapshotOf(tab);
  return current.title !== snap.title || current.body !== snap.body || current.sketchesKey !== snap.sketchesKey;
}

/** Whether the tab has anything worth protecting - an empty untitled note isn't.
 * Guards against a missing `sketches` array (e.g. a note synced in from the
 * mobile app, which has no concept of sketches and omits the field entirely)
 * instead of throwing - this used to crash every render once such a note
 * existed anywhere in `tabs`, and since the window is transparent, that
 * crash made the whole app appear to vanish rather than show an error. */
export function tabHasContent(tab: TabData): boolean {
  return tab.body.trim() !== "" || (tab.sketches?.length ?? 0) > 0;
}
