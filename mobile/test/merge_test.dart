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

  group('fewer copies', () {
    test('notes deleted here are never brought back', () {
      final r = merge([], [note('n1', 'Apagada', 'texto'), note('n2', 'Outra', 'texto 2')]);
      expect(r.notes.map((n) => n.id), containsAll(['n1', 'n2']));
      final again = mergeFromPeer(
        myNotes: [],
        peerNotes: [note('n1', 'Apagada', 'texto'), note('n2', 'Outra', 'texto 2')],
        peerId: deviceB,
        myDeviceId: deviceA,
        bookkeeping: {},
        deletedIds: {'n1'},
      );
      expect(again.notes.map((n) => n.id), ['n2']);
    });

    test('empty untitled notes are not imported, titled ones are', () {
      final r = merge([], [note('b1', 'Nova nota', ''), note('b2', ' ', ' '), note('t1', 'Compras', '')]);
      expect(r.notes.map((n) => n.id), ['t1']);
    });

    test('no conflict copy when the losing text is entirely inside the winner', () {
      final r = merge([note('n1', 'Lista', 'pão\nleite', updatedAt: 1)], [note('n1', 'Lista', 'pão\nleite\novos', updatedAt: 9)]);
      expect(r.notes, hasLength(1));
      expect(r.notes.single.body, 'pão\nleite\novos');
    });

    test('a copy is still kept when the losing text has a line of its own', () {
      final r = merge([note('n1', 'Lista', 'pão\nmanteiga', updatedAt: 1)], [note('n1', 'Lista', 'pão\nleite', updatedAt: 9)]);
      expect(r.notes, hasLength(2));
      expect(r.notes.last.body, 'pão\nmanteiga');
    });

    test('tidyNotes drops exact duplicate copies and empty notes from other devices only', () {
      final fork = const ForkedFrom(deviceId: deviceB, noteId: 'n1');
      Note blank(String id, String origin) => Note(id: id, title: 'Nova nota', time: '', body: '', originDeviceId: origin);
      final tidy = tidyNotes([
        note('n1', 'Ideias', 'a'),
        note('f1', 'Ideias (do PC)', 'b', forkedFrom: fork),
        note('f2', 'Ideias (do PC)', 'b', forkedFrom: fork),
        note('f3', 'Ideias (do PC)', 'c', forkedFrom: fork),
        blank('mine', deviceA),
        blank('theirs', deviceB),
      ], deviceA);
      expect(tidy.map((n) => n.id), ['n1', 'f1', 'f3', 'mine']);
    });
  });

  group('first sync after updating from a version before 0.1.20', () {
    Bookkeeping seed(List<Note> uploaded, List<Note> peer, {Bookkeeping legacy = const {}, Bookkeeping current = const {}}) =>
        seedUpgradeBookkeeping(current, legacy: legacy, lastUploaded: uploaded, peers: {deviceB: peer});

    test('a note only the peer edited since the last upload is updated, with no copy', () {
      final old = note('n1', 'Cronologia', 'Duelel\nPublicar 14/10', updatedAt: 1);
      final peer = [note('n1', 'Cronologia', 'Duelel v\nPublicar 16/10', updatedAt: 9)];
      final r = merge([old], peer, seed([old], peer));
      expect(r.notes, hasLength(1));
      expect(r.notes.single.body, 'Duelel v\nPublicar 16/10');
    });

    test('an edit made here after the last upload is kept', () {
      final peer = [note('n1', 'T', 'a', updatedAt: 1)];
      final r = merge([note('n1', 'T', 'a\nfeito no celular', updatedAt: 5)], peer, seed(peer, peer));
      expect(r.changed, isFalse);
      expect(r.notes.single.body, 'a\nfeito no celular');
    });

    test('both sides edited since the last upload is still a conflict, with the older text kept', () {
      final uploaded = [note('n1', 'T', 'a', updatedAt: 1)];
      final peer = [note('n1', 'T', 'a\nno PC', updatedAt: 9)];
      final r = merge([note('n1', 'T', 'a\nno celular', updatedAt: 5)], peer, seed(uploaded, peer));
      expect(r.notes.map((n) => n.body), ['a\nno PC', 'a\nno celular']);
    });

    test('a note the old version already saw differ is settled as a conflict', () {
      final mine = note('n1', 'T', 'meu texto', updatedAt: 1);
      final peer = [note('n1', 'T', 'outro texto', updatedAt: 9)];
      final legacy = {deviceB: {'n1': const HashPair('T meu texto', 'T outro texto')}};
      final book = seed([mine], peer, legacy: legacy);
      expect(book[deviceB], isEmpty);
      expect(merge([mine], peer, book).notes, hasLength(2));
    });

    test('notes missing from the last upload, or already recorded, are left alone', () {
      final peer = [note('n1', 'T', 'b'), note('n2', 'U', 'c')];
      final current = {deviceB: {'n2': const HashPair('U x', 'U y')}};
      final book = seed([note('n2', 'U', 'c')], peer, current: current);
      expect(book[deviceB]!.keys, ['n2']);
      expect(book[deviceB]!['n2']!.local, 'U x');
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
