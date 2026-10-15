import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../device_identity.dart';
import '../models/note.dart';
import 'bookkeeping_store.dart';
import 'deleted_notes_store.dart';
import 'merge.dart';

/// Realtime Database REST endpoint. Not itself a secret - what actually
/// gates access is the per-pairing syncId (see generateSyncId), the same
/// scheme used by the desktop side (see desktop/src-tauri/src/cloud_sync.rs).
const _dbUrl = 'https://cynote-f5f04-default-rtdb.firebaseio.com';
const _cloudSyncInterval = Duration(seconds: 25);
const _httpTimeout = Duration(seconds: 10);

/// Codes look like `4F2A9-C81D0-77B3E-0A1C5`. Accepting only that shape keeps
/// a mistyped (or crafted) code from turning into some other database path,
/// and matches what the database rules allow.
String? normalizeSyncId(String raw) {
  final code = raw.trim().toUpperCase();
  return RegExp(r'^[0-9A-F]{5}(-[0-9A-F]{5}){3}$').hasMatch(code) ? code : null;
}

class _CachedPeer {
  final int updatedAt;
  final List<Note> notes;
  const _CachedPeer(this.updatedAt, this.notes);
}

/// Internet-based sync via a shared Firebase pairing code - an additional
/// path alongside [SyncService]'s LAN/mDNS sync, for networks (like
/// AP-isolated public/work WiFi) where local device-to-device traffic never
/// reaches the peer at all.
///
/// Only what changed crosses the network: this device's notes are uploaded
/// when they differ from the last upload, and another device's notes are
/// downloaded when its timestamp moves - downloading everything every cycle
/// would eat the database's free monthly quota as notes grow.
class CloudSyncService extends ChangeNotifier {
  final DeviceIdentity own;
  final BookkeepingStore bookkeeping;
  final DeletedNotesStore deleted;
  CloudSyncService(this.own, this.bookkeeping, this.deleted);

  String? syncId;
  Timer? _timer;
  bool _cycleRunning = false;
  String _lastPushed = '';
  final Map<String, _CachedPeer> _peers = {};

  /// Supplies this device's current notes for pushing and for merging.
  List<Note> Function() notesProvider = () => [];

  /// Called with the reconciled note list after a sync cycle changes something.
  void Function(List<Note> notes)? onNotesMerged;

  Future<void> start() async {
    try {
      await _loadSyncId();
      await bookkeeping.load();
      await deleted.load();
      if (syncId != null) {
        _restartTimer();
        runSyncCycle();
      }
    } catch (_) {
      // cloud sync unavailable in this environment; app continues without it
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _resetCaches() {
    _lastPushed = '';
    _peers.clear();
  }

  /// Creates a new code for this device to show and share, if one doesn't
  /// exist yet - mirrors the grouping/format of the desktop side's
  /// generate_sync_id so a code looks the same regardless of which device
  /// created it.
  Future<String> generateSyncId() async {
    if (syncId != null) return syncId!;
    const uuid = Uuid();
    final raw = (uuid.v4().replaceAll('-', '') + uuid.v4().replaceAll('-', '')).substring(0, 20);
    final grouped = [for (var i = 0; i < 20; i += 5) raw.substring(i, i + 5)].join('-').toUpperCase();
    syncId = grouped;
    _resetCaches();
    await _saveSyncId();
    _restartTimer();
    notifyListeners();
    return grouped;
  }

  /// Joins an existing pairing by entering the code shown on another device.
  /// False if the code isn't in the expected format.
  Future<bool> setSyncId(String id) async {
    final code = normalizeSyncId(id);
    if (code == null) return false;
    syncId = code;
    _resetCaches();
    await _saveSyncId();
    _restartTimer();
    notifyListeners();
    runSyncCycle();
    return true;
  }

  Future<void> clearSyncId() async {
    syncId = null;
    _resetCaches();
    _timer?.cancel();
    _timer = null;
    await _saveSyncId();
    notifyListeners();
  }

  void _restartTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(_cloudSyncInterval, (_) => runSyncCycle());
  }

  HttpClient _client() => HttpClient()..connectionTimeout = _httpTimeout;

  Future<Object?> _getJson(String url) async {
    final client = _client();
    try {
      final req = await client.getUrl(Uri.parse(url));
      final res = await req.close().timeout(_httpTimeout);
      final text = await utf8.decoder.bind(res).join().timeout(_httpTimeout);
      if (res.statusCode != HttpStatus.ok) throw HttpException('HTTP ${res.statusCode}');
      return jsonDecode(text);
    } finally {
      client.close(force: true);
    }
  }

  /// True once the database has the notes.
  Future<bool> _pushNotes(String code, String notesJson) async {
    final client = _client();
    try {
      final body = '{"deviceName":${jsonEncode(own.deviceName)},"notes":$notesJson,'
          '"updatedAt":${DateTime.now().millisecondsSinceEpoch}}';
      final req = await client.putUrl(Uri.parse('$_dbUrl/sync/$code/${own.deviceId}.json'));
      req.headers.contentType = ContentType.json;
      req.write(body);
      final res = await req.close().timeout(_httpTimeout);
      await res.drain<void>().timeout(_httpTimeout);
      return res.statusCode == HttpStatus.ok;
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }

  /// Refreshes the cache with whatever changed; false if the database couldn't be reached.
  Future<bool> _fetchChanges(String code) async {
    try {
      final listing = await _getJson('$_dbUrl/sync/$code.json?shallow=true');
      final devices = listing is Map ? listing.keys.whereType<String>().where((id) => id != own.deviceId).toList() : <String>[];
      _peers.removeWhere((id, _) => !devices.contains(id));
      for (final id in devices) {
        final stamp = await _getJson('$_dbUrl/sync/$code/$id/updatedAt.json');
        final updatedAt = stamp is num ? stamp.toInt() : null;
        if (updatedAt != null && _peers[id]?.updatedAt == updatedAt) continue;
        final entry = await _getJson('$_dbUrl/sync/$code/$id.json');
        if (entry is! Map) continue;
        final entryStamp = entry['updatedAt'];
        _peers[id] = _CachedPeer(
          entryStamp is num ? entryStamp.toInt() : (updatedAt ?? 0),
          notesFromJsonList(entry['notes']),
        );
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /// The first sync after updating from a version before 0.1.20 - see
  /// seedUpgradeBookkeeping. Runs before this version's first upload replaces
  /// the old one's. False if the database couldn't be reached.
  Future<bool> _seedAfterUpgrade(String code) async {
    final legacy = bookkeeping.legacy;
    if (legacy == null) return true;
    try {
      final uploaded = await _getJson('$_dbUrl/sync/$code/${own.deviceId}/notes.json');
      if (!await _fetchChanges(code)) return false;
      bookkeeping.value = seedUpgradeBookkeeping(
        bookkeeping.value,
        legacy: legacy,
        lastUploaded: notesFromJsonList(uploaded),
        peers: {for (final e in _peers.entries) e.key: e.value.notes},
      );
      await bookkeeping.finishUpgrade();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> runSyncCycle() async {
    final code = syncId;
    if (code == null || _cycleRunning) return;
    _cycleRunning = true;
    try {
      if (!await _seedAfterUpgrade(code)) return;
      final notesJson = jsonEncode(notesProvider().map((n) => n.toJson()).toList());
      if (notesJson != _lastPushed && await _pushNotes(code, notesJson)) {
        _lastPushed = notesJson;
      }
      if (!await _fetchChanges(code) || _peers.isEmpty) return;

      // No awaits from here until the result is handed back, so the merge
      // can't interleave with an edit or with the LAN sync's own merge.
      var currentNotes = notesProvider();
      var book = bookkeeping.value;
      var anyChange = false;
      _peers.forEach((peerId, peer) {
        final result = mergeFromPeer(
          myNotes: currentNotes,
          peerNotes: peer.notes,
          peerId: peerId,
          myDeviceId: own.deviceId,
          bookkeeping: book,
          deletedIds: deleted.ids,
        );
        currentNotes = result.notes;
        book = result.bookkeeping;
        if (result.changed) anyChange = true;
      });
      bookkeeping.value = book;
      if (anyChange) onNotesMerged?.call(currentNotes);
      await bookkeeping.save();
    } finally {
      _cycleRunning = false;
    }
  }

  Future<File> _configFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/cloud_sync.json');
  }

  Future<void> _loadSyncId() async {
    try {
      final file = await _configFile();
      if (await file.exists()) {
        final decoded = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
        final saved = decoded['syncId'];
        syncId = saved is String ? normalizeSyncId(saved) : null;
      }
    } catch (_) {
      // fresh install, no cloud sync configured yet
    }
  }

  Future<void> _saveSyncId() async {
    try {
      final file = await _configFile();
      await file.writeAsString(jsonEncode({'syncId': syncId}));
    } catch (_) {
      // best-effort
    }
  }
}
