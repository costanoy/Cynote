import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Ids of notes deleted on this phone, so sync never brings them back from a
/// device that still has its own copy (the desktop does the same when a tab
/// is closed). Shared by LAN and internet sync.
class DeletedNotesStore {
  static const _maxEntries = 5000;

  final Set<String> ids = {};
  Future<void>? _loading;

  Future<void> load() => _loading ??= _load();

  Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/deleted_notes.json');
  }

  Future<void> _load() async {
    try {
      final file = await _file();
      if (await file.exists()) {
        final decoded = jsonDecode(await file.readAsString());
        if (decoded is List) ids.addAll(decoded.whereType<String>());
      }
    } catch (_) {
      // fresh install, or unreadable - start empty
    }
  }

  Future<void> addAll(Iterable<String> deleted) async {
    for (final id in deleted) {
      ids
        ..remove(id)
        ..add(id);
    }
    while (ids.length > _maxEntries) {
      ids.remove(ids.first);
    }
    try {
      final file = await _file();
      await file.writeAsString(jsonEncode(ids.toList()));
    } catch (_) {
      // best-effort
    }
  }
}
