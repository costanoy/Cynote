import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/note.dart';
import 'package:mobile/sync/merge.dart';

const deviceA = 'device-a';
const deviceB = 'device-b';

Note note(String id, String title, String body, {String originDeviceId = deviceA}) => Note(
      id: id,
      title: title,
      time: 'Agora',
      body: body,
      originDeviceId: originDeviceId,
    );

void main() {
  group('mergeFromPeer', () {
    test('imports a note that only exists on the peer', () {
      final result = mergeFromPeer(
        myNotes: [],
        peerNotes: [note('n1', 'Peer note', 'body')],
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: {},
      );
      expect(result.changed, isTrue);
      expect(result.notes.map((n) => n.id), contains('n1'));
    });

    test('does not import a note that is a fork of our own content echoed back', () {
      final mine = [note('n1', 'Original', 'body')];
      final echoedFork = Note(
        id: 'n2',
        title: 'Original (do Computador)',
        time: 'Agora',
        body: 'body',
        forkedFrom: const ForkedFrom(deviceId: deviceA, noteId: 'n1'),
      );
      final result = mergeFromPeer(
        myNotes: mine,
        peerNotes: [echoedFork],
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: {},
      );
      expect(result.changed, isFalse);
      expect(result.notes, hasLength(1));
    });

    test('does nothing when the same id has identical content on both sides', () {
      final mine = [note('n1', 'Same', 'content')];
      final peer = [note('n1', 'Same', 'content')];
      final result = mergeFromPeer(
        myNotes: mine,
        peerNotes: peer,
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: {},
      );
      expect(result.changed, isFalse);
      expect(result.notes, hasLength(1));
    });

    test("forks a note that diverged on both sides, labeling it with the peer's name", () {
      final mine = [note('n1', 'Local title', 'local body')];
      final peer = [note('n1', 'Remote title', 'remote body')];
      final result = mergeFromPeer(
        myNotes: mine,
        peerNotes: peer,
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: {},
      );
      expect(result.changed, isTrue);
      expect(result.notes, hasLength(2));
      final fork = result.notes.firstWhere((n) => n.id != 'n1');
      expect(fork.title, 'Remote title (do Notebook)');
      expect(fork.body, 'remote body');
      expect(fork.forkedFrom?.deviceId, deviceB);
      expect(fork.forkedFrom?.noteId, 'n1');
    });

    test('does not re-fork the same acknowledged divergence on a repeat sync cycle', () {
      final mine = [note('n1', 'Local title', 'local body')];
      final peer = [note('n1', 'Remote title', 'remote body')];
      final first = mergeFromPeer(
        myNotes: mine,
        peerNotes: peer,
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: {},
      );
      expect(first.notes, hasLength(2));

      final second = mergeFromPeer(
        myNotes: mine,
        peerNotes: peer,
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: first.bookkeeping,
      );
      expect(second.changed, isFalse);
      expect(second.notes, hasLength(1));
    });

    test('forks again if the local side changes again after a previously acknowledged divergence', () {
      final mine = [note('n1', 'Local title', 'local body')];
      final peer = [note('n1', 'Remote title', 'remote body')];
      final first = mergeFromPeer(
        myNotes: mine,
        peerNotes: peer,
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: {},
      );

      final mineEditedAgain = [note('n1', 'Local title v2', 'local body v2')];
      final second = mergeFromPeer(
        myNotes: mineEditedAgain,
        peerNotes: peer,
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: first.bookkeeping,
      );
      expect(second.changed, isTrue);
      expect(second.notes, hasLength(2));
    });

    test('carries bookkeeping forward per-peer without clobbering other peers', () {
      final mine = [note('n1', 'Local', 'body')];
      final peerB = [note('n1', 'Remote B', 'body B')];
      final afterB = mergeFromPeer(
        myNotes: mine,
        peerNotes: peerB,
        peerId: deviceB,
        peerName: 'Notebook',
        myDeviceId: deviceA,
        bookkeeping: {},
      );
      expect(afterB.bookkeeping.keys, [deviceB]);

      final peerC = [note('n1', 'Remote C', 'body C')];
      final afterC = mergeFromPeer(
        myNotes: afterB.notes,
        peerNotes: peerC,
        peerId: 'device-c',
        peerName: 'Celular',
        myDeviceId: deviceA,
        bookkeeping: afterB.bookkeeping,
      );
      expect(afterC.bookkeeping.keys.toSet(), {deviceB, 'device-c'});
    });
  });
}
