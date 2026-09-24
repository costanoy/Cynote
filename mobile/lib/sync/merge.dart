import 'dart:math';

import '../models/note.dart';

class HashPair {
  final String local;
  final String remote;
  const HashPair(this.local, this.remote);

  Map<String, dynamic> toJson() => {'local': local, 'remote': remote};
  factory HashPair.fromJson(Map<String, dynamic> json) =>
      HashPair(json['local'] as String, json['remote'] as String);
}

/// bookkeeping[peerId][noteId] = (local, remote) content as of the last reconcile.
typedef Bookkeeping = Map<String, Map<String, HashPair>>;

Bookkeeping bookkeepingFromJson(Map<String, dynamic> json) => json.map(
      (peerId, notes) => MapEntry(
        peerId,
        (notes as Map<String, dynamic>).map(
          (noteId, pair) => MapEntry(noteId, HashPair.fromJson(pair as Map<String, dynamic>)),
        ),
      ),
    );

Map<String, dynamic> bookkeepingToJson(Bookkeeping b) => b.map(
      (peerId, notes) => MapEntry(peerId, notes.map((noteId, pair) => MapEntry(noteId, pair.toJson()))),
    );

String _snapshot(String title, String body) => '$title $body';

final _random = Random();

Note _conflictCopy(Note local, String myDeviceId) => Note(
      id: 'n${DateTime.now().millisecondsSinceEpoch}-${_random.nextInt(1 << 30).toRadixString(36)}',
      title: '${local.title} (conflito)',
      time: 'Agora',
      body: local.body,
      originDeviceId: myDeviceId,
      forkedFrom: ForkedFrom(deviceId: myDeviceId, noteId: local.id),
    );

class MergeResult {
  final List<Note> notes;
  final Bookkeeping bookkeeping;
  final bool changed;
  const MergeResult({required this.notes, required this.bookkeeping, required this.changed});
}

/// Reconciles this device's notes with a single peer's notes - the same rules
/// as the desktop's merge.ts, so both devices always settle a conflict the
/// same way.
///
/// The bookkeeping pair recorded for each note says what both sides looked
/// like the last time they were reconciled (local == remote means they
/// agreed). So: if the peer hasn't changed since then there's nothing to do
/// here; if the two agreed and only the peer changed, take the peer's
/// version; anything else is a genuine conflict, where the most recently
/// edited version keeps the note's id and the losing side keeps its text as
/// a separate "(conflito)" copy - nothing is ever silently discarded.
MergeResult mergeFromPeer({
  required List<Note> myNotes,
  required List<Note> peerNotes,
  required String peerId,
  required String myDeviceId,
  required Bookkeeping bookkeeping,
}) {
  final indexById = {for (var i = 0; i < myNotes.length; i++) myNotes[i].id: i};
  final peerBook = Map<String, HashPair>.of(bookkeeping[peerId] ?? {});
  final notes = List<Note>.of(myNotes);
  final additions = <Note>[];
  var changed = false;

  bool bodyExistsElsewhere(String id, String body) =>
      notes.any((n) => n.id != id && n.body == body) || additions.any((n) => n.id != id && n.body == body);

  for (final remote in peerNotes) {
    final id = remote.id;
    final remoteSnap = _snapshot(remote.title, remote.body);
    final i = indexById[id];

    if (i == null) {
      // Copies this device already made of the peer's own content in older
      // versions ("(do X)") - importing them back would just duplicate it.
      if (remote.forkedFrom?.deviceId == myDeviceId) continue;
      additions.add(remote);
      peerBook[id] = HashPair(remoteSnap, remoteSnap);
      changed = true;
      continue;
    }

    final local = notes[i];
    final localSnap = _snapshot(local.title, local.body);
    if (localSnap == remoteSnap) {
      peerBook[id] = HashPair(localSnap, remoteSnap);
      continue;
    }

    final prev = peerBook[id];
    if (prev != null && prev.remote == remoteSnap) continue;

    void takeRemote() {
      notes[i] = Note(
        id: local.id,
        title: remote.title,
        time: local.time,
        body: remote.body,
        updatedAt: remote.updatedAt,
        originDeviceId: local.originDeviceId,
        forkedFrom: local.forkedFrom,
      );
      peerBook[id] = HashPair(remoteSnap, remoteSnap);
      changed = true;
    }

    if (prev != null && prev.local == prev.remote && prev.local == localSnap) {
      takeRemote();
      continue;
    }

    final remoteWins = remote.updatedAt > local.updatedAt ||
        (remote.updatedAt == local.updatedAt && remoteSnap.compareTo(localSnap) > 0);
    if (remoteWins) {
      if (local.body.trim().isNotEmpty && !bodyExistsElsewhere(id, local.body)) {
        additions.add(_conflictCopy(local, myDeviceId));
      }
      takeRemote();
    } else {
      peerBook[id] = HashPair(localSnap, remoteSnap);
    }
  }

  final newBookkeeping = Map<String, Map<String, HashPair>>.of(bookkeeping);
  newBookkeeping[peerId] = peerBook;

  return MergeResult(
    notes: changed ? [...notes, ...additions] : myNotes,
    bookkeeping: newBookkeeping,
    changed: changed,
  );
}

/// Older versions of the merge re-forked a note on every save while it
/// differed from the peer's copy, leaving piles of identical "(do X)" copies
/// behind. Drops copies that exactly duplicate (same title and text) one
/// already kept - no content is lost, since an identical copy remains.
List<Note> dropDuplicateCopies(List<Note> notes) {
  final seen = <String>{};
  return notes.where((n) {
    if (n.forkedFrom == null) return true;
    final key = '${n.title.length}:${n.title}${n.body}';
    return seen.add(key);
  }).toList();
}
