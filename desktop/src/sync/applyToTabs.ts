// Applies what reconcile decided to the open tabs. Pure: the hook hands it the
// tabs and takes the result back.

import type { TabData } from "../types";
import { shiftSketchAnchors } from "../sketches";
import { noteHash, type LocalNote } from "./reconcile";
import type { ApplyPlan } from "./engine";

export type ApplyResult = {
  tabs: TabData[];
  /** Ids left alone because the note changed (or went away) since reconcile saw it. */
  skipped: string[];
  /** Tabs that were closed because the note was deleted on another device. */
  removed: TabData[];
};

export function toLocalNotes(tabs: TabData[]): LocalNote[] {
  return tabs.map((t) => ({ id: t.id, title: t.title, body: t.body, u: t.updatedAt }));
}

const textHash = (t: TabData) => noteHash(t.title, t.body, false);

export function applyToTabs(
  tabs: TabData[],
  plan: Pick<ApplyPlan, "upserts" | "removals" | "seen">,
  makeBlank: () => TabData,
): ApplyResult {
  const next = tabs.slice();
  const index = new Map(next.map((t, i) => [t.id, i]));
  const skipped: string[] = [];
  const removed: TabData[] = [];
  const dropped = new Set<string>();
  const added: TabData[] = [];

  for (const up of plan.upserts) {
    const i = index.get(up.id);
    const seenHash = plan.seen[up.id];
    if (i === undefined) {
      // Reconcile saw a tab for this id, and now there is none: it was closed meanwhile.
      if (seenHash !== undefined) {
        skipped.push(up.id);
        continue;
      }
      added.push({
        id: up.id,
        title: up.title,
        body: up.body,
        favorite: false,
        sketches: [],
        updatedAt: up.u,
        originDeviceId: up.writer,
        titleIsCustom: true,
      });
      continue;
    }
    const tab = next[i];
    // Reconcile saw no tab, and now there is one (reopened meanwhile), or the
    // text moved on since: leave it, the next cycle resolves it.
    if (seenHash === undefined || textHash(tab) !== seenHash) {
      skipped.push(up.id);
      continue;
    }
    next[i] = {
      ...tab,
      title: up.title,
      body: up.body,
      updatedAt: up.u,
      sketches: shiftSketchAnchors(tab.sketches, tab.body, up.body),
    };
  }

  for (const r of plan.removals) {
    const i = index.get(r.id);
    if (i === undefined) continue; // already gone
    const tab = next[i];
    const seenHash = plan.seen[r.id];
    if (seenHash === undefined || textHash(tab) !== seenHash) {
      skipped.push(r.id);
      continue;
    }
    dropped.add(r.id);
    removed.push(tab);
  }

  let result = dropped.size > 0 ? next.filter((t) => !dropped.has(t.id)) : next;
  if (added.length > 0) result = [...result, ...added];
  if (result.length === 0) result = [makeBlank()];
  const changed = dropped.size > 0 || added.length > 0 || next.some((t, i) => t !== tabs[i]);
  return { tabs: changed ? result : tabs, skipped, removed };
}
