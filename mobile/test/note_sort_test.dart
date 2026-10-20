import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/note.dart';
import 'package:mobile/note_sort.dart';

Note note(String id, String title, DateTime edited) =>
    Note(id: id, title: title, time: '', body: '', updatedAt: edited.millisecondsSinceEpoch);

void main() {
  final now = DateTime(2026, 10, 20, 15, 30);

  group('sortNotes', () {
    final notes = [
      note('a', 'Zebra', DateTime(2026, 10, 20, 9)),
      note('b', 'abacate', DateTime(2026, 10, 20, 15)),
      note('c', 'Âmbar', DateTime(2026, 9, 1)),
      note('d', '', DateTime(2026, 10, 19)),
    ];
    List<String> ids(NoteSort sort) => sortNotes(notes, sort).map((n) => n.id).toList();

    test('most recent first: last edited on top', () {
      expect(ids(NoteSort.recent), ['b', 'a', 'd', 'c']);
    });

    test('oldest first', () {
      expect(ids(NoteSort.oldest), ['c', 'd', 'a', 'b']);
    });

    test('by title ignores accents and case, untitled last', () {
      expect(ids(NoteSort.title), ['b', 'c', 'a', 'd']);
    });

    test('ties keep a fixed order and the original list is left alone', () {
      final same = DateTime(2026, 10, 20, 12);
      final tied = [note('y', 'Y', same), note('x', 'X', same)];
      expect(sortNotes(tied, NoteSort.recent).map((n) => n.id), ['x', 'y']);
      expect(tied.map((n) => n.id), ['y', 'x']);
    });

    test('an unknown saved choice falls back to most recent', () {
      expect(NoteSort.fromName('title'), NoteSort.title);
      expect(NoteSort.fromName('whatever'), NoteSort.recent);
      expect(NoteSort.fromName(null), NoteSort.recent);
    });
  });

  group('editedLabel', () {
    String label(DateTime when) => editedLabel(when.millisecondsSinceEpoch, now);

    test('just now and minutes ago', () {
      expect(label(now.subtract(const Duration(seconds: 20))), 'agora');
      expect(label(now.subtract(const Duration(minutes: 5))), 'há 5 min');
      expect(label(now.subtract(const Duration(minutes: 59))), 'há 59 min');
    });

    test('earlier today shows the time', () {
      expect(label(DateTime(2026, 10, 20, 9, 5)), '09:05');
    });

    test('yesterday, this week, this year, other years', () {
      expect(label(DateTime(2026, 10, 19, 23, 50)), 'ontem');
      expect(label(DateTime(2026, 10, 15, 8)), 'qui');
      expect(label(DateTime(2026, 9, 1)), '1 set');
      expect(label(DateTime(2025, 12, 31)), '31 dez 2025');
    });

    test('another device a little ahead still reads as now', () {
      expect(label(now.add(const Duration(minutes: 2))), 'agora');
      expect(label(DateTime(2026, 10, 25)), '25 out');
    });

    test('no edit time, no label', () {
      expect(editedLabel(0, now), '');
    });
  });
}
