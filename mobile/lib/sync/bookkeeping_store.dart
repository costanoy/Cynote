import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'merge.dart';

/// One bookkeeping shared by LAN and internet sync: both reconcile against the
/// same peers, so separate copies would disagree about what was last agreed
/// and turn ordinary edits into conflicts.
class BookkeepingStore {
  Bookkeeping value = {};
  Future<void>? _loading;

  Future<void> load() => _loading ??= _load();

  Future<Directory> _dir() => getApplicationDocumentsDirectory();

  Future<void> _load() async {
    try {
      final dir = await _dir();
      final main = File('${dir.path}/sync_bookkeeping.json');
      if (await main.exists()) {
        value = bookkeepingFromJson(jsonDecode(await main.readAsString()) as Map<String, dynamic>);
      }
      // Internet sync briefly kept its own file - it's the more recent record
      // for any peer it covers, so fold it in once and drop it.
      final legacyCloud = File('${dir.path}/cloud_sync_bookkeeping.json');
      if (await legacyCloud.exists()) {
        value.addAll(bookkeepingFromJson(jsonDecode(await legacyCloud.readAsString()) as Map<String, dynamic>));
        await save();
        await legacyCloud.delete();
      }
    } catch (_) {
      // fresh install, or unreadable - start empty
    }
  }

  Future<void> save() async {
    try {
      final dir = await _dir();
      await File('${dir.path}/sync_bookkeeping.json').writeAsString(jsonEncode(bookkeepingToJson(value)));
    } catch (_) {
      // best-effort
    }
  }
}
