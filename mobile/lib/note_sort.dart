import 'models/note.dart';

/// How the note list is ordered.
enum NoteSort {
  /// Last edited first.
  recent('Mais recentes'),

  /// Last edited at the bottom.
  oldest('Mais antigas'),
  title('Título (A a Z)');

  final String label;
  const NoteSort(this.label);

  static NoteSort fromName(String? name) =>
      NoteSort.values.firstWhere((s) => s.name == name, orElse: () => NoteSort.recent);
}

const _plain = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
  'ç': 'c',
};

/// Accents and case don't change where a title goes ("Água" next to "agenda"),
/// and untitled notes go last.
String _titleKey(Note n) {
  final title = n.title.trim().toLowerCase();
  if (title.isEmpty) return '\u{FFFF}';
  return title.replaceAllMapped(RegExp('[${_plain.keys.join()}]'), (m) => _plain[m[0]]!);
}

/// [notes] in the order [sort] asks for, as a new list. Notes that tie (same
/// edit time, same title) keep a fixed order, so nothing shuffles around
/// between rebuilds.
List<Note> sortNotes(List<Note> notes, NoteSort sort) {
  int byId(Note a, Note b) => a.id.compareTo(b.id);
  int newestFirst(Note a, Note b) {
    final c = b.updatedAt.compareTo(a.updatedAt);
    return c != 0 ? c : byId(a, b);
  }

  final sorted = List<Note>.of(notes);
  switch (sort) {
    case NoteSort.recent:
      sorted.sort(newestFirst);
    case NoteSort.oldest:
      sorted.sort((a, b) {
        final c = a.updatedAt.compareTo(b.updatedAt);
        return c != 0 ? c : byId(a, b);
      });
    case NoteSort.title:
      sorted.sort((a, b) {
        final c = _titleKey(a).compareTo(_titleKey(b));
        return c != 0 ? c : newestFirst(a, b);
      });
  }
  return sorted;
}

const _months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const _weekdays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/// When a note was last edited, the way a list shows it: "agora", "há 5 min",
/// "14:32" (today), "ontem", "qua" (this week), "12 out", "12 out 2025".
String editedLabel(int updatedAt, DateTime now) {
  if (updatedAt <= 0) return '';
  final when = DateTime.fromMillisecondsSinceEpoch(updatedAt);
  final elapsed = now.difference(when);
  // A little ahead is just another device's clock running fast.
  if (elapsed.inMinutes < 1 && elapsed > const Duration(minutes: -5)) return 'agora';
  if (!elapsed.isNegative && elapsed.inMinutes < 60) return 'há ${elapsed.inMinutes} min';
  // Calendar days, counted in UTC so a daylight saving change doesn't shift them.
  final days = DateTime.utc(now.year, now.month, now.day).difference(DateTime.utc(when.year, when.month, when.day)).inDays;
  String two(int v) => v.toString().padLeft(2, '0');
  if (days == 0) return '${two(when.hour)}:${two(when.minute)}';
  if (days == 1) return 'ontem';
  if (days > 1 && days < 7) return _weekdays[when.weekday - 1];
  final date = '${when.day} ${_months[when.month - 1]}';
  return when.year == now.year ? date : '$date ${when.year}';
}
