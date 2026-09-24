import type { TabData } from "./types";

/** A note's content on each side the last time it was reconciled with a given peer. */
interface HashPair {
  local: string;
  remote: string;
}

/** bookkeeping[peerId][noteId] = (local, remote) content as of the last reconcile. */
export type Bookkeeping = Record<string, Record<string, HashPair>>;

function snapshot(title: string, body: string): string {
  return title + " " + body;
}

/** The mobile app's own Note model has no concept of favorite/sketches (desktop-only
 * features), so its JSON simply omits those fields - importing one verbatim as a
 * TabData left `sketches` undefined, which crashed the very next render the moment
 * anything called `tab.sketches.length` (dirtyCount, tabHasContent...), and since
 * this window is transparent, an uncaught render error meant the whole app just
 * vanished instead of showing an error screen. Backfill sane defaults for whatever
 * a peer's note is missing, the same way notesStore.migrate() already does for
 * notes.json written by an older desktop version. A file link is a path on the
 * peer's own disk, so it never comes along. */
function normalizeRemoteTab(remote: TabData): TabData {
  return {
    ...remote,
    favorite: remote.favorite ?? false,
    sketches: remote.sketches ?? [],
    updatedAt: remote.updatedAt ?? 0,
    filePath: undefined,
  };
}

function conflictCopy(local: TabData, myDeviceId: string): TabData {
  return {
    id: "n" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    title: `${local.title} (conflito)`,
    body: local.body,
    favorite: false,
    sketches: [],
    updatedAt: Date.now(),
    originDeviceId: myDeviceId,
    forkedFrom: { deviceId: myDeviceId, noteId: local.id },
    titleIsCustom: true,
  };
}

export interface MergeResult {
  tabs: TabData[];
  bookkeeping: Bookkeeping;
  changed: boolean;
}

/**
 * Reconciles this device's notes with a single peer's notes.
 *
 * The bookkeeping pair recorded for each note is what makes this a real merge
 * instead of a blind comparison: it says what both sides looked like the last
 * time they were reconciled (local === remote there means they agreed). So:
 *  - the peer hasn't changed since then: nothing to do here - any edits made
 *    on this side reach the peer through the peer's own merge;
 *  - the two agreed and only the peer changed: take the peer's version;
 *  - anything else is a genuine conflict: the most recently edited version
 *    (updatedAt, which both devices see identically, so they pick the same
 *    winner) keeps the note's own id, and the side that loses keeps its text
 *    as a separate "(conflito)" copy - nothing is ever silently discarded.
 * Notes closed on this device (deletedIds) are never pulled back in from a
 * peer that still has them.
 */
export function mergeFromPeer(
  myTabs: TabData[],
  peerTabs: TabData[],
  peerId: string,
  myDeviceId: string,
  bookkeeping: Bookkeeping,
  deletedIds: ReadonlySet<string> = new Set()
): MergeResult {
  const indexById = new Map(myTabs.map((t, i) => [t.id, i]));
  const peerBook = { ...(bookkeeping[peerId] ?? {}) };
  const tabs = myTabs.slice();
  const additions: TabData[] = [];
  let changed = false;

  const bodyExistsElsewhere = (id: string, body: string) =>
    [...tabs, ...additions].some((t) => t.id !== id && t.body === body);

  for (const remote of peerTabs) {
    const id = remote.id;
    const remoteSnap = snapshot(remote.title, remote.body);
    const i = indexById.get(id);

    if (i === undefined) {
      // Copies this device already made of the peer's own content in older
      // versions ("(do X)") - importing them back would just duplicate it.
      if (remote.forkedFrom?.deviceId === myDeviceId) continue;
      if (deletedIds.has(id)) continue;
      additions.push(normalizeRemoteTab(remote));
      peerBook[id] = { local: remoteSnap, remote: remoteSnap };
      changed = true;
      continue;
    }

    const local = tabs[i];
    const localSnap = snapshot(local.title, local.body);
    if (localSnap === remoteSnap) {
      peerBook[id] = { local: localSnap, remote: remoteSnap };
      continue;
    }

    const prev = peerBook[id];
    if (prev && prev.remote === remoteSnap) continue;

    const takeRemote = () => {
      tabs[i] = { ...local, title: remote.title, body: remote.body, updatedAt: remote.updatedAt ?? 0 };
      peerBook[id] = { local: remoteSnap, remote: remoteSnap };
      changed = true;
    };

    if (prev && prev.local === prev.remote && prev.local === localSnap) {
      takeRemote();
      continue;
    }

    const localTime = local.updatedAt ?? 0;
    const remoteTime = remote.updatedAt ?? 0;
    const remoteWins = remoteTime > localTime || (remoteTime === localTime && remoteSnap > localSnap);
    if (remoteWins) {
      if (local.body.trim() !== "" && !bodyExistsElsewhere(id, local.body)) {
        additions.push(conflictCopy(local, myDeviceId));
      }
      takeRemote();
    } else {
      peerBook[id] = { local: localSnap, remote: remoteSnap };
    }
  }

  return {
    tabs: changed ? [...tabs, ...additions] : myTabs,
    bookkeeping: { ...bookkeeping, [peerId]: peerBook },
    changed,
  };
}

/**
 * Older versions of the merge re-forked a note on every autosave while it
 * differed from the peer's copy, leaving dozens of identical "(do X)" copies
 * behind. Drops copies that are exact duplicates (same title and text) of one
 * already kept - no content is lost, since an identical copy remains.
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
