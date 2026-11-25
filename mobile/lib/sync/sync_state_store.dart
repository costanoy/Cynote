import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'reconcile.dart';

/// What this device remembers between sync cycles (see "Local sync state" in
/// SYNC.md). Mutable on purpose: the controller edits it in place and saves.
class SyncData {
  /// The version this device and the cloud last agreed on, per note id.
  Base base;

  /// Notes deleted here since sync v2: id -> deletedAt (ms).
  Map<String, int> deleted;

  /// Ids deleted before sync v2 (or while sync was off): never imported
  /// again, never announced.
  Set<String> ignored;

  /// The cloud stamp seen at the end of the last successful cycle.
  int? lastStamp;

  /// Whether the old per-device (v1) slots were read for this code already.
  bool v1Imported;

  SyncData({Base? base, Map<String, int>? deleted, Set<String>? ignored, this.lastStamp, this.v1Imported = false})
    : base = base ?? {},
      deleted = deleted ?? {},
      ignored = ignored ?? {};

  static const _maxDeleted = 5000;
  static const _maxIgnored = 5000;

  /// Keeps the lists from growing forever: drops the oldest entries.
  void trim() {
    if (deleted.length > _maxDeleted) {
      final ids = deleted.keys.toList()..sort((a, b) => deleted[a]!.compareTo(deleted[b]!));
      for (final id in ids.take(ids.length - _maxDeleted)) {
        deleted.remove(id);
      }
    }
    while (ignored.length > _maxIgnored) {
      ignored.remove(ignored.first);
    }
  }

  Map<String, dynamic> toJson() => {
    'version': 2,
    'base': {for (final e in base.entries) e.key: e.value.toJson()},
    'deleted': deleted,
    'ignored': ignored.toList()..sort(),
    'lastStamp': lastStamp,
    'v1Imported': v1Imported,
  };

  factory SyncData.fromJson(Map<String, dynamic> json) {
    final base = <String, BaseEntry>{};
    final rawBase = json['base'];
    if (rawBase is Map) {
      rawBase.forEach((id, v) {
        if (id is String && v is Map && v['h'] is String) base[id] = BaseEntry(v['h'] as String, v['m'] == true);
      });
    }
    final deleted = <String, int>{};
    final rawDeleted = json['deleted'];
    if (rawDeleted is Map) {
      rawDeleted.forEach((id, v) {
        if (id is String && v is num) deleted[id] = v.toInt();
      });
    }
    final rawIgnored = json['ignored'];
    final stamp = json['lastStamp'];
    return SyncData(
      base: base,
      deleted: deleted,
      ignored: rawIgnored is List ? rawIgnored.whereType<String>().toSet() : <String>{},
      lastStamp: stamp is num ? stamp.toInt() : null,
      v1Imported: json['v1Imported'] == true,
    );
  }
}

/// `sync_state.json` (the state) and `cloud_sync.json` (the sync code, kept
/// from earlier versions) in the app documents folder. Both are written
/// atomically: a temp file first, then a rename over the real one.
///
/// The files the old LAN/cloud sync used (sync_bookkeeping*.json,
/// cloud_sync_bookkeeping.json) are not read any more and left on disk.
class SyncStateStore {
  final Future<Directory> Function() _dir;
  Future<void> _writes = Future.value();

  SyncStateStore({Future<Directory> Function()? directory}) : _dir = directory ?? getApplicationDocumentsDirectory;

  Future<File> _file(String name) async => File('${(await _dir()).path}/$name');

  /// The saved state. On the first run after updating from v1 there is no
  /// state file yet: ids in deleted_notes.json become `ignored`, and the new
  /// file is written so this migration happens once.
  Future<SyncData> load() async {
    try {
      final file = await _file('sync_state.json');
      if (await file.exists()) {
        final decoded = jsonDecode(await file.readAsString());
        if (decoded is Map<String, dynamic> && decoded['version'] == 2) return SyncData.fromJson(decoded);
      }
    } catch (_) {
      // unreadable: start over below
    }
    final data = SyncData();
    try {
      final old = await _file('deleted_notes.json');
      if (await old.exists()) {
        final decoded = jsonDecode(await old.readAsString());
        if (decoded is List) data.ignored.addAll(decoded.whereType<String>());
      }
    } catch (_) {
      // nothing to migrate
    }
    await save(data);
    return data;
  }

  Future<void> save(SyncData data) {
    data.trim();
    return _write('sync_state.json', jsonEncode(data.toJson()));
  }

  Future<String?> loadCode() async {
    try {
      final file = await _file('cloud_sync.json');
      if (!await file.exists()) return null;
      final decoded = jsonDecode(await file.readAsString());
      final saved = decoded is Map ? decoded['syncId'] : null;
      return saved is String ? normalizeSyncCode(saved) : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveCode(String? code) => _write('cloud_sync.json', jsonEncode({'syncId': code}));

  /// Writes are queued so two saves never use the temp file at the same time.
  Future<void> _write(String name, String contents) {
    final next = _writes.then((_) async {
      try {
        final file = await _file(name);
        final tmp = File('${file.path}.tmp');
        await tmp.writeAsString(contents, flush: true);
        await tmp.rename(file.path);
      } catch (_) {
        // best-effort: the next cycle saves again
      }
    });
    _writes = next;
    return next;
  }
}
