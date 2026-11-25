import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/note.dart';
import 'package:mobile/sync/cloud_sync.dart';
import 'package:mobile/sync/reconcile.dart';
import 'package:mobile/sync/sync_state_store.dart';

const code = '4F2A9-C81D0-77B3E-0A1C5';
const ns = 'ns=cynote-f5f04';

/// A stand-in for the Realtime Database REST API: just enough of it for sync v2.
class FakeServer {
  late final HttpServer _server;
  final Map<String, Object?> notes = {};
  final Map<String, Object?> v1Slots = {};
  int? stamp;
  int _clock = 1000;

  /// "METHOD path?query" of every request, in order.
  final List<String> log = [];
  final List<Map<String, dynamic>> patches = [];

  /// When set, every request gets this status.
  int? forceStatus;

  /// When set, PATCH requests get this status.
  int? patchStatus;

  /// When set, the first stamp read after a PATCH went through fails.
  bool failStampReadsAfterPatch = false;

  String get baseUrl => 'http://127.0.0.1:${_server.port}';

  Future<void> start() async {
    _server = await HttpServer.bind('127.0.0.1', 0);
    _server.listen(_handle);
  }

  Future<void> close() => _server.close(force: true);

  /// Another device writes a note.
  void otherDeviceWrites(String id, Map<String, Object?> note) {
    notes[id] = note;
    stamp = (_clock += 1000);
  }

  Future<void> _handle(HttpRequest req) async {
    final body = await utf8.decoder.bind(req).join();
    log.add('${req.method} ${req.uri.path}?${req.uri.query}');
    Object? answer;
    var status = forceStatus ?? 200;
    final path = req.uri.path;
    if (status == 200) {
      if (req.method == 'PATCH') {
        if (patchStatus != null) {
          status = patchStatus!;
        } else {
          final update = jsonDecode(body) as Map<String, dynamic>;
          patches.add(update);
          update.forEach((key, value) {
            if (key == 'stamp') {
              stamp = (_clock += 1000);
            } else if (key.startsWith('notes/')) {
              notes[key.substring('notes/'.length)] = value;
            }
          });
          answer = update;
        }
      } else if (path == '/sync/$code/v2/stamp.json') {
        if (failStampReadsAfterPatch && patches.isNotEmpty) {
          failStampReadsAfterPatch = false;
          status = 500;
        } else {
          answer = stamp;
        }
      } else if (path == '/sync/$code/v2/notes.json') {
        answer = notes.isEmpty ? null : notes;
      } else if (path == '/sync/$code.json') {
        answer = {'v2': true, for (final k in v1Slots.keys) k: true};
      } else {
        final m = RegExp(r'^/sync/' + code + r'/([^/]+)/notes\.json$').firstMatch(path);
        answer = m == null ? null : v1Slots[m.group(1)];
      }
    }
    req.response.statusCode = status;
    req.response.headers.contentType = ContentType.json;
    req.response.write(jsonEncode(answer));
    await req.response.close();
  }
}

Map<String, Object?> remoteNote(String t, String b, {int u = 100, String d = 'B', String? p, bool x = false}) => {
  't': t,
  'b': b,
  'u': u,
  'd': d,
  if (p != null) 'p': p,
  if (x) 'x': true,
};

void main() {
  late FakeServer server;
  late Directory dir;
  late SyncStateStore store;
  late List<Note> notes;
  late List<SyncController> controllers;
  var idCounter = 0;

  Note note(String id, String title, String body, {int updatedAt = 100}) =>
      Note(id: id, title: title, time: 'Agora', body: body, updatedAt: updatedAt, originDeviceId: 'A');

  SyncController makeController({String? baseUrl, SyncStateStore? withStore}) {
    final c = SyncController(
      deviceId: 'A',
      store: withStore ?? store,
      notesProvider: () => notes,
      onApply: (upserts, removedIds) {
        final incoming = {for (final n in upserts) n.id: n};
        notes = [
          ...incoming.values.where((n) => !notes.any((e) => e.id == n.id)),
          for (final n in notes)
            if (!removedIds.contains(n.id)) incoming[n.id] ?? n,
        ];
      },
      baseUrl: baseUrl ?? server.baseUrl,
      extraQuery: ns,
      requestTimeout: const Duration(seconds: 3),
      now: () => 5000,
      newId: () => 'copy${++idCounter}',
    );
    controllers.add(c);
    return c;
  }

  /// Joins [code] and waits until the syncs it started are over.
  Future<SyncController> joined({List<Note>? withNotes}) async {
    if (withNotes != null) notes = withNotes;
    final c = makeController();
    await c.start();
    expect(await c.joinCode(code), isTrue);
    await c.syncNow();
    return c;
  }

  setUp(() async {
    server = FakeServer();
    await server.start();
    dir = await Directory.systemTemp.createTemp('cynote_sync_test');
    store = SyncStateStore(directory: () async => dir);
    notes = [];
    controllers = [];
    idCounter = 0;
  });

  tearDown(() async {
    for (final c in controllers) {
      c.dispose();
    }
    await server.close();
    await dir.delete(recursive: true);
  });

  test('a new note goes up in one PATCH with the server timestamp', () async {
    final c = await joined(withNotes: [note('n1', 'Compras', 'pão\nleite')]);

    expect(c.status.phase, SyncPhase.synced);
    expect(server.patches, hasLength(1));
    expect(server.patches.single.keys.toSet(), {'notes/n1', 'stamp'});
    expect(server.patches.single['stamp'], {'.sv': 'timestamp'});
    expect(server.patches.single['notes/n1'], {'t': 'Compras', 'b': 'pão\nleite', 'u': 100, 'd': 'A', 'p': ''});
    expect(server.log, contains('PATCH /sync/$code/v2.json?$ns'));
    expect(server.log, contains('GET /sync/$code/v2/stamp.json?$ns'));
    expect(server.log, contains('GET /sync/$code.json?shallow=true&$ns'));
    expect(c.data.lastStamp, server.stamp);
  });

  test('stops after one tiny request when nothing changed', () async {
    final c = await joined(withNotes: [note('n1', 'Compras', 'pão')]);
    server.log.clear();

    await c.syncNow();
    expect(server.log, ['GET /sync/$code/v2/stamp.json?$ns']);
    expect(c.status.phase, SyncPhase.synced);

    // Another device writes: the stamp moves, so the notes are read again and imported.
    server.otherDeviceWrites('n2', remoteNote('Ideias', 'rever sync'));
    server.log.clear();
    await c.syncNow();
    expect(server.log, ['GET /sync/$code/v2/stamp.json?$ns', 'GET /sync/$code/v2/notes.json?$ns']);
    expect(notes.map((n) => n.id).toSet(), {'n1', 'n2'});
    final imported = notes.firstWhere((n) => n.id == 'n2');
    expect(imported.title, 'Ideias');
    expect(imported.originDeviceId, 'B');

    // And again nothing to do.
    server.log.clear();
    await c.syncNow();
    expect(server.log, hasLength(1));
  });

  test('a local edit is uploaded even when the stamp has not moved', () async {
    final c = await joined(withNotes: [note('n1', 'Compras', 'pão')]);
    notes = [note('n1', 'Compras', 'pão\nleite', updatedAt: 200)];
    server.patches.clear();
    server.log.clear();

    await c.syncNow();
    expect(server.patches, hasLength(1));
    expect(server.patches.single['notes/n1'], containsPair('b', 'pão\nleite'));
    expect(server.patches.single['notes/n1'], containsPair('p', noteHash('Compras', 'pão', false)));
  });

  test('deleting a note announces a tombstone, and another device deleting removes it here', () async {
    final c = await joined(withNotes: [note('n1', 'Compras', 'pão'), note('n2', 'Ideias', 'x')]);
    server.patches.clear();

    notes = [note('n2', 'Ideias', 'x')];
    c.noteDeleted('n1');
    await c.syncNow();
    expect(server.patches, hasLength(1));
    expect(server.patches.single['notes/n1'], containsPair('x', true));
    expect(server.patches.single['notes/n1'], containsPair('t', ''));

    // The other device deletes n2.
    server.otherDeviceWrites('n2', remoteNote('', '', u: 900, x: true, p: noteHash('Ideias', 'x', false)));
    await c.syncNow();
    expect(notes, isEmpty);
  });

  group('errors are shown, never swallowed', () {
    test('403 and 401 mean the rules refuse access', () async {
      for (final status in [403, 401]) {
        server.forceStatus = status;
        notes = [note('n1', 'Compras', 'pão')];
        final c = makeController();
        await c.start();
        await c.joinCode(code);
        await c.syncNow();
        expect(c.status.phase, SyncPhase.denied, reason: 'HTTP $status');
        c.dispose();
      }
    });

    test('an unreachable server is offline', () async {
      final closed = await HttpServer.bind('127.0.0.1', 0);
      final url = 'http://127.0.0.1:${closed.port}';
      await closed.close(force: true);

      final c = makeController(baseUrl: url);
      await c.start();
      await c.joinCode(code);
      await c.syncNow();
      expect(c.status.phase, SyncPhase.offline);
    });

    test('a server that never answers is offline after the timeout', () async {
      final silent = await HttpServer.bind('127.0.0.1', 0);
      silent.listen((_) {});
      final c = SyncController(
        deviceId: 'A',
        store: store,
        notesProvider: () => notes,
        onApply: (_, __) {},
        baseUrl: 'http://127.0.0.1:${silent.port}',
        requestTimeout: const Duration(milliseconds: 300),
      );
      controllers.add(c);
      await c.start();
      await c.joinCode(code);
      await c.syncNow();
      expect(c.status.phase, SyncPhase.offline);
      await silent.close(force: true);
    });

    test('anything else is an error with a short detail, and the next try recovers', () async {
      server.forceStatus = 500;
      final c = await joined(withNotes: [note('n1', 'Compras', 'pão')]);
      expect(c.status.phase, SyncPhase.error);
      expect(c.status.message, 'HTTP 500');

      server.forceStatus = null;
      await c.syncNow();
      expect(c.status.phase, SyncPhase.synced);
      expect(c.status.lastSync, isNotNull);
    });
  });

  group('the old per-device slots (v1)', () {
    List<Object?> v1Notes() => [
      {'id': 'n7', 'title': 'Do celular antigo', 'time': 'x', 'body': 'texto', 'updatedAt': 50, 'originDeviceId': 'B'},
      {'id': 'n8', 'title': 'Apagada aqui', 'time': 'x', 'body': 'texto', 'updatedAt': 50, 'originDeviceId': 'B'},
      {'id': 'n9', 'title': 'Nova nota', 'time': 'x', 'body': '', 'updatedAt': 50, 'originDeviceId': 'B'},
      {'id': 'bad id!', 'title': 'Id ruim', 'time': 'x', 'body': 'texto', 'updatedAt': 50},
      {'title': 'sem id'},
      'lixo',
    ];

    test('are imported once, skipping what was deleted, blank or malformed', () async {
      server.v1Slots['B'] = v1Notes();
      server.v1Slots['A'] = [
        {'id': 'own', 'title': 'Meu slot', 'time': 'x', 'body': 'texto', 'updatedAt': 1},
      ];
      await store.save(SyncData(ignored: {'n8'}));

      final c = await joined(withNotes: [note('n1', 'Compras', 'pão')]);
      expect(notes.map((n) => n.id).toSet(), {'n1', 'n7'});
      expect(notes.firstWhere((n) => n.id == 'n7').originDeviceId, 'B');
      // The imported note went up to v2 as well.
      expect(server.patches.single.keys.toSet(), {'notes/n1', 'notes/n7', 'stamp'});
      expect(server.log.where((l) => l.contains('shallow=true')), hasLength(1));
      expect(server.log.where((l) => l.contains('/B/notes.json')), hasLength(1));
      expect(server.log.where((l) => l.contains('/A/notes.json')), isEmpty);
      expect(c.data.v1Imported, isTrue);

      // A later full cycle does not read the slots again.
      server.otherDeviceWrites('n2', remoteNote('Ideias', 'x'));
      server.log.clear();
      await c.syncNow();
      expect(server.log.where((l) => l.contains('shallow=true')), isEmpty);
      expect(server.log.where((l) => l.contains('/B/notes.json')), isEmpty);
    });

    test('are read when the slot holds an object instead of an array', () async {
      server.v1Slots['B'] = {
        '0': {'id': 'n7', 'title': 'Do celular antigo', 'time': 'x', 'body': 'texto', 'updatedAt': 50},
        '2': {'id': 'n8', 'title': 'Outra', 'time': 'x', 'body': 'texto', 'updatedAt': 50},
      };
      await joined(withNotes: []);
      expect(notes.map((n) => n.id).toSet(), {'n7', 'n8'});
    });

    test('are not imported over a note the cloud already has', () async {
      server.v1Slots['B'] = v1Notes();
      server.otherDeviceWrites('n7', remoteNote('Versão nova', 'texto novo', u: 900));
      await joined(withNotes: []);
      // One n7 only, from v2, with no conflict copy made from the old slot.
      expect(notes.map((n) => n.id).toSet(), {'n7', 'n8'});
      expect(notes, hasLength(2));
      expect(notes.firstWhere((n) => n.id == 'n7').title, 'Versão nova');
    });

    test('are not read again after a restart', () async {
      server.v1Slots['B'] = v1Notes();
      final c = await joined(withNotes: []);
      expect(notes.map((n) => n.id), contains('n7'));
      c.dispose();

      // New run of the app: same files, a note deleted meanwhile must not come back.
      notes = [];
      server.log.clear();
      final again = makeController();
      await again.start();
      await again.syncNow();
      expect(server.log.where((l) => l.contains('shallow=true')), isEmpty);
      expect(again.data.v1Imported, isTrue);
    });
  });

  group('the stamp after a push', () {
    test('failing to read it does not turn a successful push into an error', () async {
      final c = makeController();
      await c.start();
      notes = [note('n1', 'Compras', 'pão')];
      server.failStampReadsAfterPatch = true;
      expect(await c.joinCode(code), isTrue);
      await c.syncNow();
      expect(server.patches, hasLength(1));
      expect(c.status.phase, SyncPhase.synced);
      expect(c.data.base['n1']?.m, isTrue);
    });
  });

  group('the base', () {
    test('is committed only after the push succeeded', () async {
      server.patchStatus = 500;
      final c = await joined(withNotes: [note('n1', 'Compras', 'pão')]);

      expect(c.status.phase, SyncPhase.error);
      expect(c.data.base.containsKey('n1'), isFalse);
      expect(
        hasLocalChanges([LocalNote(id: 'n1', title: 'Compras', body: 'pão', u: 100)], c.data.deleted, c.data.base),
        isTrue,
      );
      final saved = jsonDecode(File('${dir.path}/sync_state.json').readAsStringSync()) as Map<String, dynamic>;
      expect((saved['base'] as Map).containsKey('n1'), isFalse);
      expect(server.notes, isEmpty);

      // The server recovers: the note goes up now, and only then is it in the base.
      server.patchStatus = null;
      await c.syncNow();
      expect(c.status.phase, SyncPhase.synced);
      expect(server.notes.keys, ['n1']);
      expect(c.data.base['n1'], BaseEntry(noteHash('Compras', 'pão', false), true));
      final after = jsonDecode(File('${dir.path}/sync_state.json').readAsStringSync()) as Map<String, dynamic>;
      expect((after['base'] as Map)['n1'], {'h': noteHash('Compras', 'pão', false), 'm': true});
      expect(after['lastStamp'], server.stamp);
    });

    test('takes remote notes at once, even when a push fails in the same cycle', () async {
      server.otherDeviceWrites('n2', remoteNote('Ideias', 'rever sync'));
      server.patchStatus = 500;
      final c = await joined(withNotes: [note('n1', 'Compras', 'pão')]);

      expect(c.status.phase, SyncPhase.error);
      expect(notes.map((n) => n.id).toSet(), {'n1', 'n2'});
      expect(c.data.base.keys, ['n2']);
    });
  });

  group('conflicts', () {
    test('the later edit stays and the other text survives as a copy', () async {
      final c = await joined(withNotes: [note('n1', 'Compras', 'pão', updatedAt: 100)]);

      // Both sides edit what they last agreed on; the other device edited later.
      notes = [note('n1', 'Compras', 'pão\nleite', updatedAt: 200)];
      server.otherDeviceWrites('n1', remoteNote('Compras', 'pão\novos', u: 300, p: noteHash('Compras', 'pão', false)));
      await c.syncNow();

      final winner = notes.firstWhere((n) => n.id == 'n1');
      expect(winner.body, 'pão\novos');
      final copy = notes.firstWhere((n) => n.id == 'copy1');
      expect(copy.title, 'Compras (conflito)');
      expect(copy.body, 'pão\nleite');
      expect(server.notes.keys.toSet(), {'n1', 'copy1'});
    });
  });

  group('codes and lifecycle', () {
    test('an invalid code is refused and changes nothing', () async {
      final c = makeController();
      await c.start();
      expect(await c.joinCode('4F2A9-C81D0'), isFalse);
      expect(c.code, isNull);
      expect(c.status.phase, SyncPhase.off);
      expect(server.log, isEmpty);
    });

    test('createCode makes a valid code that survives a restart; leave forgets it', () async {
      notes = [note('n1', 'Compras', 'pão')];
      final c = makeController();
      await c.start();
      final made = await c.createCode();
      expect(normalizeSyncCode(made), made);
      expect(c.code, made);
      await c.syncNow();

      final restarted = makeController();
      await restarted.start();
      expect(restarted.code, made);
      await restarted.syncNow();

      await restarted.leave();
      expect(restarted.code, isNull);
      expect(restarted.status.phase, SyncPhase.off);
      final third = makeController();
      await third.start();
      expect(third.code, isNull);
    });

    test('with sync off nothing is requested', () async {
      final c = makeController();
      await c.start();
      await c.syncNow();
      c.notesSaved();
      c.onAppLifecycle(AppLifecycleState.resumed);
      expect(server.log, isEmpty);
    });

    test('going to the background syncs once more', () async {
      final c = await joined(withNotes: [note('n1', 'Compras', 'pão')]);
      notes = [note('n1', 'Compras', 'pão\nleite', updatedAt: 200)];
      server.patches.clear();

      c.onAppLifecycle(AppLifecycleState.paused);
      await c.syncNow();
      expect(server.patches, hasLength(1));
    });

    test('deleting with sync off is remembered as ignored, not announced', () async {
      final c = makeController();
      await c.start();
      c.noteDeleted('n1');
      expect(c.data.ignored, contains('n1'));
      expect(c.data.deleted, isEmpty);

      // Joining later does not bring the deleted note back from the old slots.
      server.v1Slots['B'] = [
        {'id': 'n1', 'title': 'Apagada', 'time': 'x', 'body': 'texto', 'updatedAt': 50, 'originDeviceId': 'B'},
      ];
      await c.joinCode(code);
      await c.syncNow();
      expect(notes, isEmpty);
    });
  });

  group('state file', () {
    test('ids of deleted_notes.json become ignored, once, and the code is kept', () async {
      File('${dir.path}/deleted_notes.json').writeAsStringSync(jsonEncode(['n1', 'n2']));
      File('${dir.path}/cloud_sync.json').writeAsStringSync(jsonEncode({'syncId': code}));

      final data = await store.load();
      expect(data.ignored, {'n1', 'n2'});
      expect(data.v1Imported, isFalse);
      expect(await store.loadCode(), code);

      // Written once: later changes to the old file no longer matter.
      File('${dir.path}/deleted_notes.json').writeAsStringSync(jsonEncode(['n3']));
      expect((await store.load()).ignored, {'n1', 'n2'});
    });

    test('round trips, and is written atomically', () async {
      final data = SyncData(
        base: {'n1': const BaseEntry('abcd1234', true)},
        deleted: {'n2': 77},
        ignored: {'n3'},
        lastStamp: 1234,
        v1Imported: true,
      );
      await store.save(data);
      final json = jsonDecode(File('${dir.path}/sync_state.json').readAsStringSync()) as Map<String, dynamic>;
      expect(json['version'], 2);
      expect(json['base'], {
        'n1': {'h': 'abcd1234', 'm': true},
      });
      expect(json['deleted'], {'n2': 77});
      expect(json['ignored'], ['n3']);
      expect(json['lastStamp'], 1234);
      expect(json['v1Imported'], true);
      expect(File('${dir.path}/sync_state.json.tmp').existsSync(), isFalse);

      final back = await store.load();
      expect(back.base['n1'], const BaseEntry('abcd1234', true));
      expect(back.deleted, {'n2': 77});
      expect(back.ignored, {'n3'});
      expect(back.lastStamp, 1234);
      expect(back.v1Imported, isTrue);
    });

    test('an unreadable file starts over instead of failing', () async {
      File('${dir.path}/sync_state.json').writeAsStringSync('{ nope');
      final data = await store.load();
      expect(data.base, isEmpty);
    });
  });
}
