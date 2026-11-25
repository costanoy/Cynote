// The per-device sync state (SYNC.md, "Local sync state"). Pure data helpers:
// the file itself is read and written by stateStore.ts.

import { NOTE_ID_RE, type Base } from "./reconcile";

export type SyncState = {
  version: 2;
  /** The version this device and the cloud last agreed on, per note. */
  base: Base;
  /** Notes deleted here since v2: id -> deletedAt (ms). */
  deleted: Record<string, number>;
  /** Ids deleted before v2: never imported again, never announced. */
  ignored: string[];
  /** Stamp seen at the end of the last complete cycle. */
  lastStamp: number | null;
  /** True once the v1 slots of this code were imported. */
  v1Imported: boolean;
};

const MAX_DELETED = 5000;
const MAX_IGNORED = 5000;

export function emptyState(): SyncState {
  return { version: 2, base: {}, deleted: {}, ignored: [], lastStamp: null, v1Imported: false };
}

/** Reads a state file leniently: anything unusable falls back to the default. */
export function parseState(raw: unknown): SyncState {
  const out = emptyState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;

  if (r.base && typeof r.base === "object" && !Array.isArray(r.base)) {
    for (const [id, v] of Object.entries(r.base as Record<string, unknown>)) {
      const e = v as Record<string, unknown> | null;
      if (e && typeof e.h === "string" && typeof e.m === "boolean") out.base[id] = { h: e.h, m: e.m };
    }
  }
  if (r.deleted && typeof r.deleted === "object" && !Array.isArray(r.deleted)) {
    for (const [id, v] of Object.entries(r.deleted as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out.deleted[id] = v;
    }
  }
  if (Array.isArray(r.ignored)) {
    out.ignored = r.ignored.filter((x): x is string => typeof x === "string");
  }
  if (typeof r.lastStamp === "number" && Number.isFinite(r.lastStamp)) out.lastStamp = r.lastStamp;
  out.v1Imported = r.v1Imported === true;
  return out;
}

/** Joining, creating or leaving a code: the old agreement no longer applies.
 * What was deleted or ignored stays true whichever notebook this is. */
export function resetForNewCode(state: SyncState): SyncState {
  return { ...state, base: {}, lastStamp: null, v1Imported: false };
}

export function addIgnored(state: SyncState, ids: Iterable<string>): void {
  const seen = new Set(state.ignored);
  for (const id of ids) {
    if (NOTE_ID_RE.test(id) && !seen.has(id)) {
      seen.add(id);
      state.ignored.push(id);
    }
  }
  if (state.ignored.length > MAX_IGNORED) state.ignored = state.ignored.slice(-MAX_IGNORED);
}

/** Keeps the deleted list from growing forever: drops the oldest entries. */
export function trimDeleted(state: SyncState): void {
  const ids = Object.keys(state.deleted);
  if (ids.length <= MAX_DELETED) return;
  ids.sort((a, b) => state.deleted[a] - state.deleted[b]);
  for (const id of ids.slice(0, ids.length - MAX_DELETED)) delete state.deleted[id];
}

export function serializeState(state: SyncState): string {
  return JSON.stringify(state);
}
