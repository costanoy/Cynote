import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/sync/reconcile.dart';

Map<String, dynamic> _vectors() =>
    jsonDecode(File('../sync-spec/vectors.json').readAsStringSync()) as Map<String, dynamic>;

Base _baseFrom(Map<String, dynamic> json) => {
  for (final e in json.entries) e.key: BaseEntry(e.value['h'] as String, e.value['m'] as bool),
};

void main() {
  final vectors = _vectors();

  group('hash', () {
    test('tombstone hash matches the spec', () {
      expect(tombstoneHash, vectors['tombstoneHash']);
    });

    for (final ex in (vectors['hashExamples'] as List).cast<Map<String, dynamic>>()) {
      test('hash of "${ex['title']}" / "${ex['body']}"', () {
        expect(noteHash(ex['title'] as String, ex['body'] as String, ex['deleted'] as bool), ex['hash']);
      });
    }
  });

  group('shared vectors', () {
    for (final c in (vectors['cases'] as List).cast<Map<String, dynamic>>()) {
      test(c['name'] as String, () {
        final input = c['input'] as Map<String, dynamic>;
        var counter = 0;
        final out = reconcile(
          me: input['me'] as String,
          now: input['now'] as int,
          local: [
            for (final n in (input['local'] as List).cast<Map<String, dynamic>>())
              LocalNote(
                id: n['id'] as String,
                title: n['title'] as String,
                body: n['body'] as String,
                u: n['u'] as int,
              ),
          ],
          deleted: {
            for (final e in (input['deleted'] as Map<String, dynamic>).entries) e.key: (e.value as num).toInt(),
          },
          ignored: (input['ignored'] as List).cast<String>(),
          remote: Map<String, Object?>.from(input['remote'] as Map),
          base: _baseFrom(input['base'] as Map<String, dynamic>),
          newId: () => 'c${++counter}',
        );

        final expected = c['expected'] as Map<String, dynamic>;
        expect(
          [
            for (final n in out.upserts) {'id': n.id, 'title': n.title, 'body': n.body, 'u': n.u},
          ],
          expected['upserts'],
          reason: 'upserts',
        );
        expect(
          [
            for (final r in out.removals) {'id': r.id, 'deletedAt': r.deletedAt},
          ],
          expected['removals'],
          reason: 'removals',
        );
        expect(out.undeletes, expected['undeletes'], reason: 'undeletes');
        expect({for (final e in out.push.entries) e.key: e.value.toJson()}, expected['push'], reason: 'push');
        expect({for (final e in out.base.entries) e.key: e.value.toJson()}, expected['base'], reason: 'base');
      });
    }
  });

  group('hasLocalChanges', () {
    final h = noteHash('A', 'b', false);
    LocalNote n(String title, String body) => LocalNote(id: 'n1', title: title, body: body, u: 1);

    test('false when everything matches the base', () {
      expect(hasLocalChanges([n('A', 'b')], {}, {'n1': BaseEntry(h, true)}), isFalse);
    });

    test('true for an edit, a new note and a pending deletion', () {
      expect(hasLocalChanges([n('A', 'c')], {}, {'n1': BaseEntry(h, true)}), isTrue);
      expect(hasLocalChanges([n('A', 'b')], {}, {}), isTrue);
      expect(hasLocalChanges([], {'n1': 5}, {'n1': BaseEntry(h, true)}), isTrue);
    });

    test('false for a blank new note and an already announced deletion', () {
      expect(hasLocalChanges([n('Nova nota', '')], {}, {}), isFalse);
      expect(hasLocalChanges([], {'n1': 5}, {'n1': BaseEntry(tombstoneHash, true)}), isFalse);
    });
  });

  group('sync code', () {
    test('is lenient on input', () {
      expect(normalizeSyncCode(' 4f2a9-c81d0-77b3e-0a1c5 '), '4F2A9-C81D0-77B3E-0A1C5');
      expect(normalizeSyncCode('4f2a9c81d077b3e0a1c5'), '4F2A9-C81D0-77B3E-0A1C5');
      expect(normalizeSyncCode('4F2A9 C81D0 77B3E 0A1C5'), '4F2A9-C81D0-77B3E-0A1C5');
    });

    test('rejects what is not 20 hex digits', () {
      for (final bad in ['', '4F2A9-C81D0-77B3E', '4F2A9-C81D0-77B3E-0A1C5-0', '../../x']) {
        expect(normalizeSyncCode(bad), isNull, reason: bad);
      }
    });

    test('generated codes are well-formed and different each time', () {
      final a = generateSyncCode();
      expect(RegExp(r'^[0-9A-F]{5}(-[0-9A-F]{5}){3}$').hasMatch(a), isTrue);
      expect(normalizeSyncCode(a), a);
      expect(a, isNot(generateSyncCode()));
      expect(generateSyncCode(Random(1)), generateSyncCode(Random(1)));
    });
  });
}
