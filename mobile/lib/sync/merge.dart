import '../models/note.dart';

class HashPair {
  final String local;
  final String remote;
  const HashPair(this.local, this.remote);

  Map<String, dynamic> toJson() => {'local': local, 'remote': remote};
  factory HashPair.fromJson(Map<String, dynamic> json) =>
      HashPair(json['local'] as String, json['remote'] as String);
}

/// bookkeeping[peerId][noteId] = last-seen (local, remote) content snapshot pair.
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

class MergeResult {
  final List<Note> notes;
  final Bookkeeping bookkeeping;
  final bool changed;
  const MergeResult({required this.notes, required this.bookkeeping, required this.changed});
}

/// Reconciles this device's notes with a single peer's notes.
///
/// Conflicts are never silently overwritten: if the same note id diverges on
/// both sides, the peer's version is added as a new, clearly-labeled note
/// instead. A per-peer "last seen" snapshot prevents re-forking the same
/// divergence on every sync cycle, and a `forkedFrom` provenance check
/// prevents importing a fork of our own content echoed back through the peer.
MergeResult mergeFromPeer({
  required List<Note> myNotes,
  required List<Note> peerNotes,
  required String peerId,
  required String peerName,
  required String myDeviceId,
  required Bookkeeping bookkeeping,
}) {
  final myMap = {for (final n in myNotes) n.id: n};
  final peerMap = {for (final n in peerNotes) n.id: n};
  final peerBook = Map<String, HashPair>.of(bookkeeping[peerId] ?? {});

  final additions = <Note>[];
  var changed = false;

  for (final entry in peerMap.entries) {
    final id = entry.key;
    final remote = entry.value;
    final local = myMap[id];

    if (local == null) {
      if (remote.forkedFrom?.deviceId == myDeviceId) continue; // echo of our own content
      additions.add(remote);
      changed = true;
      continue;
    }

    if (local.title == remote.title && local.body == remote.body) {
      continue; // already in sync
    }

    final localSnap = _snapshot(local.title, local.body);
    final remoteSnap = _snapshot(remote.title, remote.body);
    final prev = peerBook[id];
    if (prev != null && prev.local == localSnap && prev.remote == remoteSnap) {
      continue; // divergence already acknowledged, don't re-fork
    }

    additions.add(
      Note(
        id: 'n${DateTime.now().millisecondsSinceEpoch}-${id.hashCode}',
        title: '${remote.title} (do $peerName)',
        time: 'Agora',
        body: remote.body,
        originDeviceId: remote.originDeviceId,
        forkedFrom: ForkedFrom(deviceId: peerId, noteId: id),
      ),
    );
    peerBook[id] = HashPair(localSnap, remoteSnap);
    changed = true;
  }

  final newBookkeeping = Map<String, Map<String, HashPair>>.of(bookkeeping);
  newBookkeeping[peerId] = peerBook;

  return MergeResult(
    notes: changed ? [...myNotes, ...additions] : myNotes,
    bookkeeping: newBookkeeping,
    changed: changed,
  );
}
