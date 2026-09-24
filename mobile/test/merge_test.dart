import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/note.dart';
import 'package:mobile/sync/merge.dart';

const deviceA = 'device-a';
const deviceB = 'device-b';

Note note(String id, String title, String body, {int updatedAt = 0, ForkedFrom? forkedFrom}) => Note(
      id: id,
      title: title,
      time: 'Agora',
      body: body,
      updatedAt: updatedAt,
      originDeviceId: deviceA,
      forkedFrom: forkedFrom,
    );

/// One device's view: its notes plus its bookkeeping about the other device.
class Device {
  final String id;
  List<Note> notes;
  Bookkeeping book = {};
  Device(this.id, this.notes);

  void pull(Device from) {
    final r = mergeFromPeer(myNotes: notes, peerNotes: from.notes, peerId: from.id, myDeviceId: id, bookkeeping: book);
    notes = r.notes;
    book = r.bookkeeping;
  }

  void edit(String noteId, String body, int at) {
    notes = [
      for (final n in notes)
        n.id == noteId ? Note(id: n.id, title: n.title, time: n.time, body: body, updatedAt: at) : n,
    ];
  }

  Note get n1 => notes.firstWhere((n) => n.id == 'n1');
  List<Note> get copies => notes.where((n) => n.id != 'n1').toList();
}

MergeResult merge(List<Note> mine, List<Note> peer, [Bookkeeping? book]) =>
    mergeFromPeer(myNotes: mine, peerNotes: peer, peerId: deviceB, myDeviceId: deviceA, bookkeeping: book ?? {});

void main() {
  group('mergeFromPeer', () {
    test('imports a note that only exists on the peer', () {
      final result = merge([], [note('n1', 'Peer note', 'body')]);
      expect(result.changed, isTrue);
      expect(result.notes.map((n) => n.id), contains('n1'));
    });

    test('does not import a note that is a fork of our own content echoed back', () {
      final echoed = note('n2', 'Original (do Celular)', 'body', forkedFrom: const ForkedFrom(deviceId: deviceA, noteId: 'n1'));
      final result = merge([note('n1', 'Original', 'body')], [echoed]);
      expect(result.changed, isFalse);
      expect(result.notes, hasLength(1));
    });

    test('does nothing when the same id has identical content on both sides', () {
      final result = merge([note('n1', 'Same', 'x')], [note('n1', 'Same', 'x')]);
      expect(result.changed, isFalse);
    });

    test('never lets a stale peer copy replace a newer local note, and does not copy it either', () {
      final result = merge([note('n1', 'Projetos', 'current', updatedAt: 2000)], [note('n1', 'Projetos', 'old', updatedAt: 1000)]);
      expect(result.notes, hasLength(1));
      expect(result.notes.single.body, 'current');
    });

    test('does not create a new copy on every local edit while the peer copy stays the same', () {
      final a = Device(deviceA, [note('n1', 'Projetos', 'v1', updatedAt: 2000)]);
      final b = Device(deviceB, [note('n1', 'Projetos', 'old', updatedAt: 1000)]);
      for (var i = 2; i <= 8; i++) {
        a.edit('n1', 'v$i', 2000 + i);
        a.pull(b);
      }
      expect(a.notes, hasLength(1));
      expect(a.n1.body, 'v8');
    });

    test('takes the peer version when only the peer changed since the two last agreed', () {
      final a = Device(deviceA, [note('n1', 'T', 'P0', updatedAt: 1)]);
      final b = Device(deviceB, [note('n1', 'T', 'P0', updatedAt: 1)]);
      a.pull(b);
      b.edit('n1', 'P1', 5);
      a.pull(b);
      expect(a.n1.body, 'P1');
      expect(a.n1.updatedAt, 5);
      expect(a.copies, isEmpty);
    });

    test('resolves a real conflict the same way on both devices, keeping the losing text as one copy', () {
      for (final bFirst in [false, true]) {
        final a = Device(deviceA, [note('n1', 'T', 'P0', updatedAt: 1)]);
        final b = Device(deviceB, [note('n1', 'T', 'P0', updatedAt: 1)]);
        a.pull(b);
        b.pull(a);
        a.edit('n1', 'edited on A', 10);
        b.edit('n1', 'edited on B', 12);

        if (bFirst) b.pull(a);
        a.pull(b);
        b.pull(a);
        a.pull(b);

        for (final d in [a, b]) {
          expect(d.n1.body, 'edited on B');
          expect(d.copies, hasLength(1));
          expect(d.copies.single.body, 'edited on A');
          expect(d.copies.single.title, 'T (conflito)');
        }
      }
    });

    test('goes back to plain fast-forwarding once a conflict has been resolved', () {
      final a = Device(deviceA, [note('n1', 'T', 'P0', updatedAt: 1)]);
      final b = Device(deviceB, [note('n1', 'T', 'P0', updatedAt: 1)]);
      a.pull(b);
      b.pull(a);
      a.edit('n1', 'A', 10);
      b.edit('n1', 'B', 12);
      a.pull(b);
      b.pull(a);

      b.edit('n1', 'B again', 20);
      a.pull(b);
      expect(a.n1.body, 'B again');
      expect(a.copies, hasLength(1));
    });

    test('carries bookkeeping forward per-peer without clobbering other peers', () {
      final afterB = merge([note('n1', 'Local', 'b')], [note('n1', 'B', 'b B')]);
      expect(afterB.bookkeeping.keys, [deviceB]);
      final afterC = mergeFromPeer(
        myNotes: afterB.notes,
        peerNotes: [note('n1', 'C', 'b C')],
        peerId: 'device-c',
        myDeviceId: deviceA,
        bookkeeping: afterB.bookkeeping,
      );
      expect(afterC.bookkeeping.keys.toSet(), {deviceB, 'device-c'});
    });
  });

  group('dropDuplicateCopies', () {
    test('collapses identical sync copies but keeps originals', () {
      Note fork(String id, String body) => note(id, 'Ideias (do VINICIUS)', body,
          forkedFrom: const ForkedFrom(deviceId: deviceB, noteId: 'n1'));
      final kept = dropDuplicateCopies([
        note('n1', 'Ideias', 'mine'),
        fork('f1', 'theirs'),
        fork('f2', 'theirs'),
        fork('f3', 'different'),
      ]);
      expect(kept.map((n) => n.id), ['n1', 'f1', 'f3']);
    });
  });
}
