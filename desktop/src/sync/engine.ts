// One Cynote sync cycle (SYNC.md, "One sync cycle"). Transport-agnostic: it
// talks to the cloud through `SyncHttp` and to the app through the callbacks
// in `CycleEnv`, so it runs the same in the app, in vitest against a fake and
// in node against the Firebase emulator.

import {
  NOTE_ID_RE,
  hasLocalChanges,
  isBlankNote,
  noteHash,
  reconcile,
  validRemote,
  type Base,
  type LocalNote,
} from "./reconcile";
import { SyncError, type SyncHttp } from "./http";
import { trimDeleted, type SyncState } from "./state";

export type CloudSyncPhase = "off" | "syncing" | "synced" | "offline" | "denied" | "error";

export type CloudSyncStatus = {
  phase: CloudSyncPhase;
  lastSyncAt?: number;
  /** Short detail, only for `error`. */
  message?: string;
};

/** Thrown by a cycle that noticed (through `isCancelled`) it no longer matters. */
export class CycleCancelled extends Error {
  constructor() {
    super("cycle cancelled");
    this.name = "CycleCancelled";
  }
}

export function statusFromError(e: unknown, lastSyncAt?: number): CloudSyncStatus {
  if (e instanceof SyncError) {
    if (e.kind === "offline") return { phase: "offline", lastSyncAt };
    if (e.kind === "denied") return { phase: "denied", lastSyncAt };
    return { phase: "error", lastSyncAt, message: e.message };
  }
  if (e instanceof TypeError) return { phase: "offline", lastSyncAt };
  const detail = e instanceof Error && e.message ? e.message : "erro inesperado";
  return { phase: "error", lastSyncAt, message: detail.slice(0, 120) };
}

/** A note to create or replace on this device. `writer` is the device that wrote that version. */
export type ApplyUpsert = LocalNote & { writer: string };

/** What reconcile decided for this device's own notes, to be applied in one synchronous step. */
export type ApplyPlan = {
  upserts: ApplyUpsert[];
  removals: { id: string; deletedAt: number }[];
  /** For every note this device had when reconcile ran: noteHash(title, body, false).
   * A note whose text is no longer that has been edited since and must be left alone. */
  seen: Record<string, string>;
  /** Called (possibly later, from a render) for an id whose change did not land after all. */
  lateSkip: (id: string) => void;
};

export type CycleEnv = {
  http: SyncHttp;
  code: string;
  deviceId: string;
  /** Mutated in place. */
  state: SyncState;
  /** This device's notes right now. */
  readLocal: () => LocalNote[];
  /** Applies the plan to the app's notes, synchronously. Returns the ids it skipped. */
  apply: (plan: ApplyPlan) => string[];
  saveState: (state: SyncState) => void | Promise<void>;
  /** True when the code changed meanwhile: the cycle stops without touching anything more. */
  isCancelled?: () => boolean;
  /** Skip the "stamp unchanged" shortcut and read everything. */
  force?: boolean;
  now?: () => number;
  newId?: () => string;
};

export type CycleResult = {
  /** True when the stamp was unchanged and nothing was local: only one tiny request was made. */
  shortCircuit: boolean;
  applied: number;
  pushed: number;
};

type V1Note = { id: string; title: string; body: string; u: number; writer: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function defaultNewId(): string {
  return "n" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

/** Reads the notes other devices left in v1 slots (`/sync/CODE/{device}`). */
async function fetchV1Notes(http: SyncHttp, code: string, me: string, now: () => number): Promise<V1Note[]> {
  const listing = await http.getJson(`/sync/${code}.json?shallow=true`);
  if (!isPlainObject(listing)) return [];
  const found = new Map<string, V1Note>();
  for (const device of Object.keys(listing)) {
    if (device === "v2" || device === me || !NOTE_ID_RE.test(device)) continue;
    const raw = await http.getJson(`/sync/${code}/${device}/notes.json`);
    const list = Array.isArray(raw) ? raw : isPlainObject(raw) ? Object.values(raw) : [];
    for (const item of list) {
      if (!isPlainObject(item)) continue;
      const { id, title, body, updatedAt, forkedFrom } = item;
      if (typeof id !== "string" || !NOTE_ID_RE.test(id)) continue;
      if (typeof title !== "string" || typeof body !== "string") continue;
      // A copy this device itself made in older versions: importing it back would duplicate it.
      if (isPlainObject(forkedFrom) && forkedFrom.deviceId === me) continue;
      const u = typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : now();
      const prev = found.get(id);
      if (!prev || u > prev.u) found.set(id, { id, title, body, u, writer: device });
    }
  }
  return [...found.values()];
}

export async function runCycle(env: CycleEnv): Promise<CycleResult> {
  const { http, code, state } = env;
  const me = env.deviceId;
  const now = env.now ?? Date.now;
  const newId = env.newId ?? defaultNewId;
  const root = `/sync/${code}`;
  const cancelled = () => {
    if (env.isCancelled?.()) throw new CycleCancelled();
  };

  // 2. The stamp: one tiny request tells whether anything changed in the cloud.
  const stampRaw = await http.getJson(`${root}/v2/stamp.json`);
  cancelled();
  const stamp = typeof stampRaw === "number" && Number.isFinite(stampRaw) ? stampRaw : null;
  if (
    !env.force &&
    state.v1Imported &&
    stamp === state.lastStamp &&
    !hasLocalChanges(env.readLocal(), state.deleted, state.base)
  ) {
    return { shortCircuit: true, applied: 0, pushed: 0 };
  }

  // 3. First cycle with this code: bring in what the v1 slots hold.
  const v1 = state.v1Imported ? [] : await fetchV1Notes(http, code, me, now);
  cancelled();

  // 4. Read the notebook, then reconcile and apply in one synchronous step.
  const remoteRaw = await http.getJson(`${root}/v2/notes.json`);
  cancelled();
  const remote = isPlainObject(remoteRaw) ? remoteRaw : {};

  const localNotes = env.readLocal();
  const localIds = new Set(localNotes.map((n) => n.id));
  const ignored = new Set(state.ignored);
  const imported = v1.filter(
    (n) =>
      !localIds.has(n.id) &&
      !has(remote, n.id) &&
      !ignored.has(n.id) &&
      !has(state.deleted, n.id) &&
      !isBlankNote(n),
  );

  const out = reconcile({
    me,
    now: now(),
    local: [...localNotes, ...imported.map(({ id, title, body, u }) => ({ id, title, body, u }))],
    deleted: state.deleted,
    ignored: state.ignored,
    remote,
    base: state.base,
    newId,
  });

  const importedWriter = new Map(imported.map((n) => [n.id, n.writer]));
  const writerOf = (id: string) => importedWriter.get(id) ?? validRemote(remote[id])?.d ?? me;
  const upserts: ApplyUpsert[] = [
    ...out.upserts.map((n) => ({ ...n, writer: writerOf(n.id) })),
    ...imported.map(({ id, title, body, u, writer }) => ({ id, title, body, u, writer })),
  ];
  const seen: Record<string, string> = {};
  for (const n of localNotes) seen[n.id] = noteHash(n.title, n.body, false);

  const prevBase: Base = state.base;
  const prevDeleted = { ...state.deleted };
  const upsertIds = new Set(upserts.map((u) => u.id));
  const undeleted = new Set(out.undeletes);
  const removedIds = new Set(out.removals.map((r) => r.id));

  // Takes one id back to how it was before this cycle touched it.
  const revert = (id: string) => {
    const before = prevBase[id];
    if (before) state.base[id] = before;
    else delete state.base[id];
    // Only the deleted marks this cycle itself changed: the user may have
    // closed that very note since.
    if (removedIds.has(id) || undeleted.has(id)) {
      if (has(prevDeleted, id)) state.deleted[id] = prevDeleted[id];
      else delete state.deleted[id];
    }
  };

  const skipped = new Set(
    env.apply({
      upserts,
      removals: out.removals,
      seen,
      lateSkip: (id) => {
        revert(id);
        void env.saveState(state);
      },
    }),
  );

  // The new base. A pushed note only counts once the push worked; a note that
  // was skipped keeps what it had, so the next cycle sees the difference again.
  const pushIds = Object.keys(out.push);
  const base: Base = { ...out.base };
  state.base = base;
  for (const id of pushIds) {
    if (prevBase[id]) base[id] = prevBase[id];
    else delete base[id];
  }
  for (const id of skipped) {
    if (prevBase[id]) base[id] = prevBase[id];
    else delete base[id];
  }
  for (const r of out.removals) if (!skipped.has(r.id)) state.deleted[r.id] = r.deletedAt;
  for (const id of undeleted) if (!skipped.has(id)) delete state.deleted[id];
  trimDeleted(state);
  state.v1Imported = true;
  await env.saveState(state);
  cancelled();

  // 5. One PATCH for everything this device has to say.
  let lastStamp = stamp;
  if (pushIds.length > 0) {
    const body: Record<string, unknown> = {};
    for (const id of pushIds) body[`notes/${id}`] = out.push[id];
    body.stamp = { ".sv": "timestamp" };
    await http.patchJson(`${root}/v2.json`, body);
    cancelled();
    for (const id of pushIds) if (!skipped.has(id)) state.base[id] = out.base[id];

    // 6. The stamp our own write left. If it cannot be read now, the stamp from
    // before stays and the next cycle simply reads everything once more.
    try {
      const after = await http.getJson(`${root}/v2/stamp.json`);
      if (typeof after === "number" && Number.isFinite(after)) lastStamp = after;
    } catch {
      // keep `stamp`
    }
    cancelled();
  }

  state.lastStamp = lastStamp;
  await env.saveState(state);

  return {
    shortCircuit: false,
    applied: [...upsertIds, ...removedIds].filter((id) => !skipped.has(id)).length,
    pushed: pushIds.length,
  };
}
