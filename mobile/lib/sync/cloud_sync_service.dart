import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../device_identity.dart';
import '../models/note.dart';
import 'merge.dart';

/// Realtime Database REST endpoint. Not itself a secret - what actually
/// gates access is the per-pairing syncId (see generateSyncId), the same
/// scheme used by the desktop side (see desktop/src-tauri/src/cloud_sync.rs).
const _dbUrl = 'https://cynote-f5f04-default-rtdb.firebaseio.com';
const _cloudSyncInterval = Duration(seconds: 25);

/// Internet-based sync via a shared Firebase pairing code - an additional
/// path alongside [SyncService]'s LAN/mDNS sync, for networks (like
/// AP-isolated public/work WiFi) where local device-to-device traffic never
/// reaches the peer at all.
class CloudSyncService extends ChangeNotifier {
  final DeviceIdentity own;
  CloudSyncService(this.own);

  String? syncId;
  Timer? _timer;
  Bookkeeping _bookkeeping = {};

  /// Supplies this device's current notes for pushing and for merging.
  List<Note> Function() notesProvider = () => [];

  /// Called with the reconciled note list after a sync cycle changes something.
  void Function(List<Note> notes)? onNotesMerged;

  Future<void> start() async {
    try {
      await _loadSyncId();
      await _loadBookkeeping();
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
    await _saveSyncId();
    _restartTimer();
    notifyListeners();
    return grouped;
  }

  /// Joins an existing pairing by entering the code shown on another device.
  Future<void> setSyncId(String id) async {
    final trimmed = id.trim();
    if (trimmed.isEmpty) return;
    syncId = trimmed;
    await _saveSyncId();
    _restartTimer();
    notifyListeners();
    runSyncCycle();
  }

  Future<void> clearSyncId() async {
    syncId = null;
    _timer?.cancel();
    _timer = null;
    await _saveSyncId();
    notifyListeners();
  }

  void _restartTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(_cloudSyncInterval, (_) => runSyncCycle());
  }

  Future<void> _pushNotes() async {
    final client = HttpClient();
    try {
      final body = jsonEncode({
        'deviceName': own.deviceName,
        'notes': notesProvider().map((n) => n.toJson()).toList(),
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      });
      final req = await client.putUrl(Uri.parse('$_dbUrl/sync/$syncId/${own.deviceId}.json'));
      req.headers.contentType = ContentType.json;
      req.write(body);
      await req.close();
    } catch (_) {
      // best-effort - retried next cycle
    } finally {
      client.close(force: true);
    }
  }

  Future<Map<String, dynamic>> _fetchPeersRaw() async {
    final client = HttpClient();
    try {
      final req = await client.getUrl(Uri.parse('$_dbUrl/sync/$syncId.json'));
      final res = await req.close();
      final text = await utf8.decoder.bind(res).join();
      final decoded = jsonDecode(text);
      return decoded is Map<String, dynamic> ? decoded : {};
    } catch (_) {
      return {};
    } finally {
      client.close(force: true);
    }
  }

  Future<void> runSyncCycle() async {
    if (syncId == null) return;

    await _pushNotes();
    final peersRaw = await _fetchPeersRaw();

    var currentNotes = notesProvider();
    var book = _bookkeeping;
    var anyChange = false;

    for (final entry in peersRaw.entries) {
      final peerId = entry.key;
      if (peerId == own.deviceId) continue;
      final data = entry.value;
      if (data is! Map<String, dynamic>) continue;
      final peerName = data['deviceName'] as String? ?? 'Dispositivo';
      final notesJson = data['notes'];
      if (notesJson is! List) continue;
      final peerNotes = notesJson.map((n) => Note.fromJson(n as Map<String, dynamic>)).toList();

      final result = mergeFromPeer(
        myNotes: currentNotes,
        peerNotes: peerNotes,
        peerId: peerId,
        peerName: peerName,
        myDeviceId: own.deviceId,
        bookkeeping: book,
      );
      currentNotes = result.notes;
      book = result.bookkeeping;
      if (result.changed) anyChange = true;
    }

    _bookkeeping = book;
    await _saveBookkeeping();
    if (anyChange) onNotesMerged?.call(currentNotes);
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
        syncId = decoded['syncId'] as String?;
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

  Future<File> _bookkeepingFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/cloud_sync_bookkeeping.json');
  }

  Future<void> _loadBookkeeping() async {
    try {
      final file = await _bookkeepingFile();
      if (await file.exists()) {
        final decoded = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
        _bookkeeping = bookkeepingFromJson(decoded);
      }
    } catch (_) {
      // fresh install, no bookkeeping yet
    }
  }

  Future<void> _saveBookkeeping() async {
    try {
      final file = await _bookkeepingFile();
      await file.writeAsString(jsonEncode(bookkeepingToJson(_bookkeeping)));
    } catch (_) {
      // best-effort
    }
  }
}
