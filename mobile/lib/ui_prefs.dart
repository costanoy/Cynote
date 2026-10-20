import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'note_sort.dart';

// How the person likes the app laid out - small, and only a convenience: if
// it can't be read, the defaults are fine.

Future<File> _prefsFile() async {
  final dir = await getApplicationDocumentsDirectory();
  return File('${dir.path}/ui_prefs.json');
}

Future<Map<String, dynamic>> _read() async {
  try {
    final file = await _prefsFile();
    if (!await file.exists()) return {};
    final decoded = jsonDecode(await file.readAsString());
    return decoded is Map<String, dynamic> ? decoded : {};
  } catch (_) {
    return {};
  }
}

Future<NoteSort> loadNoteSort() async {
  final saved = (await _read())['noteSort'];
  return NoteSort.fromName(saved is String ? saved : null);
}

Future<void> saveNoteSort(NoteSort sort) async {
  try {
    final prefs = await _read();
    prefs['noteSort'] = sort.name;
    await (await _prefsFile()).writeAsString(jsonEncode(prefs));
  } catch (_) {
    // best-effort
  }
}
