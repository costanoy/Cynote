import '../models/note.dart';

/// The first versions re-forked a note on every save while it differed from the
/// other device's copy, leaving piles of identical "(do X)" copies behind (they
/// carry `forkedFrom`). Drops copies that exactly duplicate (same title and
/// text) one already kept: no text is lost, since an identical copy remains.
/// Conflict copies made by sync v2 have no `forkedFrom` and are never touched.
List<Note> dropDuplicateCopies(List<Note> notes) {
  final seen = <String>{};
  return notes.where((n) {
    if (n.forkedFrom == null) return true;
    final key = '${n.title.length}:${n.title}${n.body}';
    return seen.add(key);
  }).toList();
}
