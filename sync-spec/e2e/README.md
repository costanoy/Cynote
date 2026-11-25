# Sync v2 end-to-end check

Proves that the two sync engines (the desktop TypeScript engine and the Flutter
`SyncController`) interoperate on one sync code, against the Firebase Realtime
Database **emulator running the repo's rules** (`firebase/database.rules.json`).
Nothing here talks to the real Firebase project.

Device A is the desktop engine (`desktop/src/sync/engine.ts` with an in-memory
tab list and sync state, applying changes through the real `applyToTabs`).
Device B is a real `SyncController` inside `flutter test`
(`mobile/test/e2e_emulator_test.dart`), remote-controlled by the Node script,
which makes every assertion. A counting proxy sits in front of the emulator so
both engines' requests are counted the same way.

## Run

1. Start the emulator (needs Node and a JDK; `firebase-tools` 13.x runs on JDK 17,
   newer ones want JDK 21). From the repo root, in its own terminal:

   ```
   set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
   cd firebase
   npx -y firebase-tools@13.35.1 emulators:start --only database --project cynote-f5f04
   ```

   (It writes `*-debug.log` files into `firebase/`; they are git-ignored there.)

2. Run the harness (Node 22.18+ or 23.6+ (so Node 26 here) strips the types itself; `register.mjs` only lets
   it resolve the desktop sources' extensionless imports):

   ```
   cd sync-spec/e2e
   node --import ./register.mjs run.mts
   ```

   It starts `flutter test test/e2e_emulator_test.dart` in `mobile/` by itself
   (about 10 seconds), uses a fresh random code, and deletes that code's data at
   the end. Exit code 0 means every check passed.

Options (environment variables):

| variable | default | meaning |
|---|---|---|
| `CYNOTE_E2E_EMULATOR` | `http://127.0.0.1:9000` | database base URL |
| `CYNOTE_E2E_NS` | `cynote-f5f04-default-rtdb` | the `ns` query value (see below) |
| `CYNOTE_E2E_MOBILE_DIR` | `../../mobile` | where to run `flutter test` |
| `FLUTTER` | `flutter` | the flutter command |

`--verbose` echoes the `flutter test` output.

The Dart test is skipped when `CYNOTE_E2E_EMULATOR` is not set, so a plain
`flutter test` in `mobile/` stays green (71 pass, 1 skipped).

### The namespace matters

The emulator loads the rules only into its default database, named
`<project>-default-rtdb`, so the harness must use `ns=cynote-f5f04-default-rtdb`.
With `ns=cynote-f5f04` the emulator silently creates a second, rules-free database
and every write is accepted, which would make the rules check meaningless. The
preflight step refuses to continue unless a write under the code `abc` is rejected.

## Scenario

1. A creates two notes and syncs; B joins the code and syncs: B has both.
2. B edits one note and creates a third; A syncs: A sees the edit and the new note.
3. A deletes a note; B syncs: gone on B, remembered in B's `deleted`, tombstone in the cloud.
4. Both edit the same note without syncing; A syncs, B syncs, A syncs: exactly one
   "(conflito)" copy on A, on B and in the cloud, the newer edit is the main note.
   4b repeats it with the desktop edit being the newer one.
5. Nothing changed: a cycle makes only the stamp request (A and B, counted at the proxy).
   5b (extra): B deletes a note while A edits it, the edit wins everywhere.
6. The rules reject malformed writes (missing fields, extra field, wrong types, too
   long, bad note id, bad stamp, unknown child, codes like `abc`, lowercase or short
   codes, a PATCH mixing good and bad notes) and accept the engines' writes.
   The desktop engine reports a refused code as `denied`.
