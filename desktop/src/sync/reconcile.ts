// Reference implementation of Cynote sync v2 reconciliation (see SYNC.md).
// The Dart port in mobile/lib/sync/reconcile.dart must give the same output
// for every case in sync-spec/vectors.json.

export type LocalNote = { id: string; title: string; body: string; u: number };

/** One note as stored in the cloud under /sync/{code}/v2/notes/{id}. */
export type RemoteNote = {
  t: string; // title
  b: string; // body
  u: number; // updatedAt (ms) of the edit
  d: string; // device that wrote it
  p?: string; // hash of the version this edit was based on
  x?: boolean; // true: deleted (tombstone)
};

/** The version both sides last agreed on, per note id. `m`: this device wrote it. */
export type Base = Record<string, { h: string; m: boolean }>;

export type ReconcileInput = {
  me: string;
  now: number;
  local: LocalNote[];
  /** Notes deleted on this device since sync v2: id -> deletedAt (ms). */
  deleted: Record<string, number>;
  /** Ids deleted before sync v2: never imported again, never announced. */
  ignored: string[];
  remote: Record<string, unknown>;
  base: Base;
  newId: () => string;
};

export type ReconcileOutput = {
  /** Notes to create or replace on this device (conflict copies included). */
  upserts: LocalNote[];
  /** Notes deleted on another device: remove here and remember as deleted. */
  removals: { id: string; deletedAt: number }[];
  /** Ids to drop from the local deleted list (another device kept editing them). */
  undeletes: string[];
  /** Notes to write to the cloud. */
  push: Record<string, RemoteNote>;
  /** The complete new base. Entries for ids in `push` are only valid once the push succeeds. */
  base: Base;
};

export const NOTE_ID_RE = /^[A-Za-z0-9_~-]{1,100}$/;

/** FNV-1a, 32 bits, over UTF-16 code units; 8 lowercase hex digits. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function noteHash(title: string, body: string, deleted: boolean): string {
  return fnv1a(title + "\u0000" + body + "\u0000" + (deleted ? "1" : "0"));
}

export const TOMBSTONE_HASH = noteHash("", "", true);

export function isBlankNote(n: { title: string; body: string }): boolean {
  const t = n.title.trim();
  return n.body.trim() === "" && (t === "" || t === "Nova nota");
}

export function validRemote(v: unknown): RemoteNote | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.t !== "string" || typeof r.b !== "string" || typeof r.d !== "string") return null;
  if (typeof r.u !== "number" || !Number.isFinite(r.u)) return null;
  if (r.p !== undefined && typeof r.p !== "string") return null;
  if (r.x !== undefined && typeof r.x !== "boolean") return null;
  const out: RemoteNote = { t: r.t, b: r.b, u: r.u, d: r.d };
  if (typeof r.p === "string") out.p = r.p;
  if (r.x === true) out.x = true;
  return out;
}

function hasUniqueLines(loser: string, winner: string): boolean {
  if (loser.trim() === "") return false;
  const kept = new Set(winner.split("\n").map((l) => l.trim()));
  return loser.split("\n").some((l) => l.trim() !== "" && !kept.has(l.trim()));
}

export function conflictTitle(title: string): string {
  return (title.trim() || "Sem título") + " (conflito)";
}

type Side = { title: string; body: string; u: number; deleted: boolean };

export function reconcile(input: ReconcileInput): ReconcileOutput {
  const { me, now } = input;
  const out: ReconcileOutput = { upserts: [], removals: [], undeletes: [], push: {}, base: {} };
  const ignored = new Set(input.ignored);

  const local = new Map<string, LocalNote>();
  for (const n of input.local) if (NOTE_ID_RE.test(n.id)) local.set(n.id, n);

  const remote = new Map<string, RemoteNote>();
  for (const [id, v] of Object.entries(input.remote ?? {})) {
    const r = validRemote(v);
    if (r && NOTE_ID_RE.test(id)) remote.set(id, r);
  }

  const ids = new Set<string>([...local.keys(), ...remote.keys()]);
  for (const id of Object.keys(input.deleted)) {
    if (NOTE_ID_RE.test(id) && (remote.has(id) || input.base[id])) ids.add(id);
  }

  const toRemote = (s: Side, p: string): RemoteNote =>
    s.deleted ? { t: "", b: "", u: s.u, d: me, p, x: true } : { t: s.title, b: s.body, u: s.u, d: me, p };

  const addCopy = (title: string, body: string) => {
    const id = input.newId();
    const copy: LocalNote = { id, title: conflictTitle(title), body, u: now };
    out.upserts.push(copy);
    out.push[id] = toRemote({ ...copy, deleted: false }, "");
    out.base[id] = { h: noteHash(copy.title, copy.body, false), m: true };
  };

  for (const id of [...ids].sort()) {
    if (ignored.has(id) && !local.has(id)) continue;

    const live = local.get(id);
    const deletedAt = input.deleted[id];
    const L: Side | null = live
      ? { title: live.title, body: live.body, u: live.u, deleted: false }
      : deletedAt !== undefined
        ? { title: "", body: "", u: deletedAt, deleted: true }
        : null;
    const R = remote.get(id) ?? null;
    const B = input.base[id];

    if (!R) {
      if (!L || L.deleted) continue;
      if (!B && isBlankNote(L)) continue;
      out.push[id] = toRemote(L, B?.h ?? "");
      out.base[id] = { h: noteHash(L.title, L.body, false), m: true };
      continue;
    }

    const hR = noteHash(R.t, R.b, R.x === true);
    const fromRemote = (): LocalNote => ({ id, title: R.t, body: R.b, u: R.u });

    if (!L) {
      out.base[id] = { h: hR, m: false };
      if (!R.x) out.upserts.push(fromRemote());
      continue;
    }

    const hL = noteHash(L.title, L.body, L.deleted);
    if (hL === hR) {
      out.base[id] = { h: hR, m: B?.h === hR ? B.m : false };
      continue;
    }

    const localChanged = !B || hL !== B.h;
    const remoteChanged = !B || hR !== B.h;
    const clobbered = !!B && B.m && hR !== B.h && (R.p ?? "") !== B.h;

    if (!localChanged && !clobbered) {
      // Only the other device changed it.
      out.base[id] = { h: hR, m: false };
      if (R.x) out.removals.push({ id, deletedAt: R.u });
      else {
        out.upserts.push(fromRemote());
        if (L.deleted) out.undeletes.push(id);
      }
      continue;
    }

    if (localChanged && !remoteChanged) {
      out.push[id] = toRemote(L, B!.h);
      out.base[id] = { h: hL, m: true };
      continue;
    }

    // Both changed since they last agreed. An edit always beats a deletion.
    if (L.deleted && !R.x) {
      out.base[id] = { h: hR, m: false };
      out.upserts.push(fromRemote());
      out.undeletes.push(id);
      continue;
    }
    if (!L.deleted && R.x) {
      out.push[id] = toRemote(L, hR);
      out.base[id] = { h: hL, m: true };
      continue;
    }

    // Both edited: the later edit stays, the other text survives as a copy.
    const localWins = L.u > R.u || (L.u === R.u && hL > hR);
    if (localWins) {
      out.push[id] = toRemote(L, hR);
      out.base[id] = { h: hL, m: true };
      if (hasUniqueLines(R.b, L.body)) addCopy(R.t, R.b);
    } else {
      out.base[id] = { h: hR, m: false };
      out.upserts.push(fromRemote());
      if (hasUniqueLines(L.body, R.b)) addCopy(L.title, L.body);
    }
  }

  return out;
}

/** True when this device has something the cloud has not seen yet. */
export function hasLocalChanges(
  local: LocalNote[],
  deleted: Record<string, number>,
  base: Base,
): boolean {
  for (const n of local) {
    if (!NOTE_ID_RE.test(n.id)) continue;
    const b = base[n.id];
    if (!b) {
      if (!isBlankNote(n)) return true;
    } else if (b.h !== noteHash(n.title, n.body, false)) return true;
  }
  for (const id of Object.keys(deleted)) {
    const b = base[id];
    if (b && b.h !== TOMBSTONE_HASH) return true;
  }
  return false;
}

/** Codes look like 4F2A9-C81D0-77B3E-0A1C5: 20 hex digits in groups of five. */
export function normalizeSyncCode(input: string): string | null {
  const hex = input.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (hex.length !== 20) return null;
  return hex.match(/.{5}/g)!.join("-");
}

export function generateSyncCode(random: (n: number) => Uint8Array): string {
  const bytes = random(10);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return normalizeSyncCode(hex)!;
}
