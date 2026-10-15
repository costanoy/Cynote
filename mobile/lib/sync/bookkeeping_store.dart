import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'merge.dart';

/// One bookkeeping shared by LAN and internet sync: both reconcile against the
/// same peers, so separate copies would disagree about what was last agreed
/// and turn ordinary edits into conflicts.
class BookkeepingStore {
  Bookkeeping value = {};

  /// What the app noted down before 0.1.20, kept only until the first
  /// internet sync after updating has used it (see seedUpgradeBookkeeping).
  Bookkeeping? legacy;
  Future<void>? _loading;

  Future<void> load() => _loading ??= _load();

  bool get upgradePending => legacy != null;

  Future<Directory> _dir() => getApplicationDocumentsDirectory();

  Bookkeeping _read(String text) => bookkeepingFromJson(jsonDecode(text) as Map<String, dynamic>);

  Future<void> _load() async {
    try {
      final dir = await _dir();
      final main = File('${dir.path}/sync_bookkeeping.json');
      final legacyCloud = File('${dir.path}/cloud_sync_bookkeeping.json');
      final legacyFile = File('${dir.path}/sync_bookkeeping_v1.json');
      // Only versions before 0.1.20 wrote cloud_sync_bookkeeping.json. What
      // they noted (where they made "(do X)" copies) isn't the last agreed
      // state, so it's set aside for the upgrade instead.
      if (await legacyCloud.exists()) {
        final old = <String, Map<String, HashPair>>{};
        for (final file in [main, legacyCloud]) {
          if (!await file.exists()) continue;
          _read(await file.readAsString()).forEach((peer, notes) => (old[peer] ??= {}).addAll(notes));
        }
        await legacyFile.writeAsString(jsonEncode(bookkeepingToJson(old)));
        if (await main.exists()) await main.delete();
        await legacyCloud.delete();
      }
      if (await main.exists()) value = _read(await main.readAsString());
      if (await legacyFile.exists()) legacy = _read(await legacyFile.readAsString());
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

  Future<void> finishUpgrade() async {
    legacy = null;
    await save();
    try {
      final dir = await _dir();
      final file = File('${dir.path}/sync_bookkeeping_v1.json');
      if (await file.exists()) await file.delete();
    } catch (_) {
      // best-effort
    }
  }
}
