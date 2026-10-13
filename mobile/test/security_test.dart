import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/sync/cloud_sync_service.dart';
import 'package:mobile/sync/merge.dart';
import 'package:mobile/sync/sync_service.dart';

void main() {
  group('pairing code format', () {
    test('accepts the four groups of five, in any case, trimmed', () {
      expect(normalizeSyncId(' 4f2a9-c81d0-77b3e-0a1c5 '), '4F2A9-C81D0-77B3E-0A1C5');
    });

    test('rejects anything that could become another database path', () {
      for (final bad in ['', '4F2A9-C81D0-77B3E', '4F2A9-C81D0-77B3E-0A1CZ', '../../x', '4F2A9-C81D0-77B3E-0A1C5/../y']) {
        expect(normalizeSyncId(bad), isNull, reason: bad);
      }
    });
  });

  group('notes arriving through sync', () {
    test('malformed entries are skipped instead of breaking the whole sync', () {
      final notes = notesFromJsonList([
        null,
        42,
        {'id': 7, 'title': 't', 'body': 'b'},
        {'id': 'n2', 'title': 't'},
        {'id': '', 'title': 't', 'body': 'b'},
        {'id': 'ok', 'title': 'Real', 'body': 'note', 'updatedAt': 1.7e12},
      ]);
      expect(notes.map((n) => n.id), ['ok']);
      expect(notes.single.updatedAt, 1700000000000);
    });

    test('a non-list is just no notes', () {
      expect(notesFromJsonList({'not': 'a list'}), isEmpty);
    });
  });

  group('local network pairing secrets', () {
    test('are long, random and well-formed', () {
      final a = newPairingSecret();
      expect(a.length, 64);
      expect(isValidPairingSecret(a), isTrue);
      expect(a, isNot(newPairingSecret()));
      expect(isValidPairingSecret('short'), isFalse);
      expect(isValidPairingSecret('z' * 64), isFalse);
    });

    test('compare only equal when identical', () {
      final a = newPairingSecret();
      expect(sameSecret(a, '$a'), isTrue);
      expect(sameSecret(a, newPairingSecret()), isFalse);
      expect(sameSecret(a, a.substring(0, 63)), isFalse);
    });
  });
}
