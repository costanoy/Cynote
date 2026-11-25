# Cynote sync v2

One way to sync, through the internet, with no account: devices that share a **sync code** share one notebook in Firebase Realtime Database. There is no local-network sync anymore (no mDNS, no pairing, no listening port).

## Why v2

v1 had two mechanisms (LAN pairing and a per-device cloud slot), swallowed every error, never propagated deletions, and its database rules had expired: since some point in 2026 every request returned `Permission denied`, silently. v2 keeps the same code and database, and shows the real state.

## The code

`XXXXX-XXXXX-XXXXX-XXXXX`, 20 uppercase hex digits (80 bits from a CSPRNG). It is both the address and the only secret. Input is lenient: lowercase, spaces or missing dashes are fine (`normalizeSyncCode`). Codes made by v1 stay valid.

## Data in the cloud

```
/sync/{CODE}/v2/stamp            server timestamp of the last write (number)
/sync/{CODE}/v2/notes/{noteId}   { t, b, u, d, p?, x? }
```

| field | meaning |
|---|---|
| `t` | title |
| `b` | body (`\n` line breaks) |
| `u` | when the edit was made (ms, the editing device's clock) |
| `d` | device id that wrote this version |
| `p` | hash of the version the edit started from (empty when unknown) |
| `x` | `true` when the note was deleted (then `t` and `b` are empty) |

Only title and body travel. Drawings, favorites and file links stay on the computer that has them.

Note ids must match `^[A-Za-z0-9_~-]{1,100}$` (Firebase keys); other ids are not synced. v1 slots (`/sync/{CODE}/{deviceId}`) are read once for migration and never written by v2.

## Hash

`noteHash(title, body, deleted)` = FNV-1a 32-bit over the UTF-16 code units of `title + "\0" + body + "\0" + ("1" or "0")`, as 8 lowercase hex digits. All tombstones share one hash.

## Local sync state (per device, one JSON file)

```
{ "version": 2, "base": { id: { "h": hash, "m": wroteIt } }, "deleted": { id: deletedAtMs },
  "ignored": [ids], "lastStamp": number|null, "v1Imported": bool }
```

- `base`: the version this device and the cloud last agreed on. `m` is true when this device wrote it.
- `deleted`: notes deleted here since v2 (tombstones to announce).
- `ignored`: ids deleted before v2 (the old local "deleted" lists). They are never imported again and never announced, because v1 deletions were local only and the other device may still want its copy.

Desktop: `%APPDATA%\com.cynote.desktop\sync_state.json`. Phone: `sync_state.json` in the app documents folder. Written atomically (temp file + rename).

## reconcile()

Pure function, identical on both sides: `desktop/src/sync/reconcile.ts` (reference) and `mobile/lib/sync/reconcile.dart`. Both must pass every case in `sync-spec/vectors.json`.

For each note id, with L = this device's version (live note, or a tombstone if in `deleted`), R = the cloud's version, B = base:

1. Only here: upload it (an empty "Nova nota" waits until it has content).
2. Only in the cloud: import it (a tombstone is just remembered).
3. Same text both sides: record the base.
4. Changed only in the cloud: take it (a tombstone deletes the note here).
5. Changed only here: upload it with `p = B.h`.
6. Our own upload was replaced by an edit that never saw it (`B.m` and `R.p != B.h`): treat as both changed.
7. Both changed:
   - an edit beats a deletion;
   - two edits: the later `u` stays (tie: larger hash); the losing text becomes a new note "<título> (conflito)" when it has a non-empty line missing from the winner. Only the device that resolves the conflict makes the copy, so there is never more than one.

Base entries for uploaded notes only count once the upload succeeds.

## One sync cycle

1. No code: off.
2. `GET /sync/{CODE}/v2/stamp.json`. If it equals `lastStamp` and `hasLocalChanges()` is false: done (one tiny request).
3. First cycle on this device with this code: import v1 slots (`GET /sync/{CODE}.json?shallow=true`, then each other device's `notes`), adding notes this device does not have and has not deleted or ignored.
4. `GET /sync/{CODE}/v2/notes.json`, `reconcile()`, apply the result locally. A note the user edited while the request was in flight is left alone and its base is not advanced, so the next cycle sees the conflict.
5. If there is anything to upload: one `PATCH /sync/{CODE}/v2.json` with `"notes/{id}": {...}` entries plus `"stamp": {".sv": "timestamp"}`.
6. Read the stamp again, save the state file.

Errors are shown, never swallowed: no connection, the server refusing access (HTTP 401/403, the database rules), or an unexpected answer.

## When cycles run

- Computer: at start, when the window is shown, every 30 s while it is visible, after each autosave, when the window is hidden (so the last edit leaves before the app sleeps), and when the network comes back. Nothing runs while the window stays hidden.
- Phone: at start, when the app comes to the foreground, every 30 s while open, after each autosave, and when the app goes to the background.

## Database rules

`firebase/database.rules.json`, deployed with `firebase deploy --only database` from the `firebase/` folder (or pasted in the Firebase console, Realtime Database, Rules). They allow reading and writing only under a well-formed code, and validate the shape and size of v2 notes.
