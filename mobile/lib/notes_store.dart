import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'models/note.dart';

Future<File> _notesFile() async {
  final dir = await getApplicationDocumentsDirectory();
  return File('${dir.path}/notes.json');
}

Future<List<Note>?> loadNotes() async {
  try {
    final file = await _notesFile();
    if (!await file.exists()) return null;
    final contents = await file.readAsString();
    final decoded = jsonDecode(contents);
    if (decoded is! List) return null;
    return decoded.map((e) => Note.fromJson(e as Map<String, dynamic>)).toList();
  } catch (_) {
    return null;
  }
}

Future<void> saveNotes(List<Note> notes) async {
  try {
    final file = await _notesFile();
    await file.writeAsString(jsonEncode(notes.map((n) => n.toJson()).toList()));
  } catch (_) {
    // best-effort background autosave; nothing to surface to the user
  }
}
