// The phone side of the sync v2 interoperability check (see
// sync-spec/e2e/README.md). It is NOT a self-contained test: it plays device B,
// a real SyncController with an in-memory note list, and is driven over a tiny
// JSON/HTTP protocol by sync-spec/e2e/run.mts, which plays device A (the desktop
// engine) and makes every assertion.
//
// Skipped unless CYNOTE_E2E_EMULATOR is set, so a normal `flutter test` stays
// green. Variables:
//   CYNOTE_E2E_EMULATOR      base URL of the database (or of a proxy in front of it)
//   CYNOTE_E2E_NS            `ns` query value, default cynote-f5f04-default-rtdb
//   CYNOTE_E2E_DEVICE_PORT   port for the control server, default: any free one
//
// Commands (POST /cmd, body {"op": ..., ...}, answer is JSON):
//   start                       load state, like the app does at launch
//   join {code}                 joinCode + wait for the cycles it starts
//   sync                        syncNow(); answers the status
//   put {id,title,body,u}       create or replace a note (an edit; no sync)
//   remove {id}                 delete a note through noteDeleted (that syncs)
//   dump                        notes, sync state and status
//   quit                        stop the server (ends the test)
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/note.dart';
import 'package:mobile/sync/cloud_sync.dart';
import 'package:mobile/sync/sync_state_store.dart';

void main() {
  final emulator = Platform.environment['CYNOTE_E2E_EMULATOR'];
  final ns = Platform.environment['CYNOTE_E2E_NS'] ?? 'cynote-f5f04-default-rtdb';
  final port = int.tryParse(Platform.environment['CYNOTE_E2E_DEVICE_PORT'] ?? '') ?? 0;

  test(
    'phone device for the sync v2 end-to-end run',
    () async {
      const deviceId = 'phone-e2e';
      final dir = await Directory.systemTemp.createTemp('cynote_e2e_phone');
      final notes = <Note>[];

      void apply(List<Note> upserts, List<String> removed) {
        for (final n in upserts) {
          final i = notes.indexWhere((x) => x.id == n.id);
          if (i >= 0) {
            notes[i] = n;
          } else {
            notes.insert(0, n);
          }
        }
        notes.removeWhere((n) => removed.contains(n.id));
      }

      final controller = SyncController(
        deviceId: deviceId,
        store: SyncStateStore(directory: () async => dir),
        notesProvider: () => notes,
        onApply: apply,
        baseUrl: emulator!,
        extraQuery: 'ns=$ns',
        // The harness decides when cycles run.
        interval: const Duration(days: 1),
      );

      Map<String, Object?> status() => {'phase': controller.status.phase.name, 'message': controller.status.message};

      Map<String, Object?> dump() => {
        'deviceId': deviceId,
        'code': controller.code,
        'notes': [
          for (final n in notes) {'id': n.id, 'title': n.title, 'body': n.body, 'u': n.updatedAt},
        ],
        'deleted': controller.data.deleted,
        'ignored': controller.data.ignored.toList(),
        'base': {for (final e in controller.data.base.entries) e.key: e.value.toJson()},
        'lastStamp': controller.data.lastStamp,
        'v1Imported': controller.data.v1Imported,
        'status': status(),
      };

      Future<Object?> handle(Map<String, dynamic> cmd) async {
        switch (cmd['op']) {
          case 'ping':
            return {'ok': true};
          case 'start':
            await controller.start();
            return dump();
          case 'join':
            final ok = await controller.joinCode(cmd['code'] as String);
            // joinCode starts a cycle on its own; syncNow waits for it (and reruns).
            await controller.syncNow();
            return {'joined': ok, ...dump()};
          case 'sync':
            await controller.syncNow();
            return dump();
          case 'put':
            final id = cmd['id'] as String;
            final note = Note(
              id: id,
              title: cmd['title'] as String,
              time: '',
              body: cmd['body'] as String,
              updatedAt: (cmd['u'] as num).toInt(),
              originDeviceId: deviceId,
            );
            final i = notes.indexWhere((x) => x.id == id);
            if (i >= 0) {
              notes[i] = note;
            } else {
              notes.insert(0, note);
            }
            return dump();
          case 'remove':
            final id = cmd['id'] as String;
            notes.removeWhere((n) => n.id == id);
            controller.noteDeleted(id);
            await controller.syncNow();
            return dump();
          case 'dump':
            return dump();
          default:
            throw ArgumentError('unknown op ${cmd['op']}');
        }
      }

      final server = await HttpServer.bind('127.0.0.1', port);
      stdout.writeln('E2E_DEVICE_LISTENING ${server.port}');
      final quit = Completer<void>();
      server.listen((req) async {
        Object? answer;
        var statusCode = 200;
        try {
          final text = await utf8.decoder.bind(req).join();
          final cmd = text.isEmpty ? <String, dynamic>{'op': 'ping'} : jsonDecode(text) as Map<String, dynamic>;
          if (cmd['op'] == 'quit') {
            answer = {'ok': true};
            if (!quit.isCompleted) quit.complete();
          } else {
            answer = await handle(cmd);
          }
        } catch (e, s) {
          statusCode = 500;
          answer = {'error': '$e', 'stack': '$s'};
        }
        req.response
          ..statusCode = statusCode
          ..headers.contentType = ContentType.json
          ..write(jsonEncode(answer));
        await req.response.close();
      });

      await quit.future;
      await server.close(force: true);
      controller.dispose();
      try {
        await dir.delete(recursive: true);
      } catch (_) {}
    },
    skip: emulator == null ? 'set CYNOTE_E2E_EMULATOR to run (see sync-spec/e2e/README.md)' : false,
    timeout: Timeout.none,
  );
}
