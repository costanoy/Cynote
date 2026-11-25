import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:uuid/uuid.dart';

import '../models/note.dart';
import 'reconcile.dart';
import 'sync_state_store.dart';

const defaultSyncBaseUrl = 'https://cynote-f5f04-default-rtdb.firebaseio.com';

enum SyncPhase { off, syncing, synced, offline, denied, error }

class SyncStatus {
  final SyncPhase phase;

  /// When the last cycle finished successfully (this run of the app only).
  final DateTime? lastSync;

  /// A short detail, set for [SyncPhase.error].
  final String? message;

  const SyncStatus(this.phase, {this.lastSync, this.message});

  static const off = SyncStatus(SyncPhase.off);
}

/// Called with the notes to create or replace and the ids to remove. It runs
/// synchronously, right after the notes were read, so it must not wait on
/// anything before updating the app's own list.
typedef ApplySync = void Function(List<Note> upserts, List<String> removedIds);

class _Denied implements Exception {
  const _Denied();
}

class _Aborted implements Exception {
  const _Aborted();
}

/// Cynote sync v2 (see SYNC.md): one notebook per sync code in Firebase
/// Realtime Database, reached over its REST API.
class SyncController extends ChangeNotifier {
  final String deviceId;
  final SyncStateStore store;
  final List<Note> Function() notesProvider;
  final ApplySync onApply;
  final String baseUrl;

  /// Appended to every request, for example `ns=cynote-f5f04-default-rtdb` (the namespace that loads the rules) for the local
  /// emulator.
  final String extraQuery;
  final Duration requestTimeout;
  final Duration interval;
  final int Function() _now;
  final String Function() _newId;

  SyncController({
    required this.deviceId,
    required this.store,
    required this.notesProvider,
    required this.onApply,
    this.baseUrl = defaultSyncBaseUrl,
    this.extraQuery = '',
    this.requestTimeout = const Duration(seconds: 8),
    this.interval = const Duration(seconds: 30),
    int Function()? now,
    String Function()? newId,
  }) : _now = now ?? (() => DateTime.now().millisecondsSinceEpoch),
       _newId = newId ?? (() => const Uuid().v4());

  SyncData _data = SyncData();
  String? _code;
  SyncStatus _status = SyncStatus.off;
  Timer? _timer;
  Future<void>? _ready;
  Future<void>? _inFlight;
  bool _rerun = false;
  bool _disposed = false;
  bool _loaded = false;

  /// Bumped when the code changes, so a cycle for the old code gives up.
  int _epoch = 0;

  SyncStatus get status => _status;
  String? get code => _code;

  /// Exposed for tests and diagnostics.
  SyncData get data => _data;

  /// Loads the saved state and code; with a code, syncs now and keeps syncing.
  Future<void> start() => _ready ??= _start();

  Future<void> _start() async {
    try {
      final loaded = await store.load();
      final code = await store.loadCode();
      // Deletions made while loading must survive it.
      loaded.deleted.addAll(_data.deleted);
      loaded.ignored.addAll(_data.ignored);
      _data = loaded;
      _code = code;
    } catch (_) {
      // unreadable storage: sync stays off for this run
    }
    _loaded = true;
    if (_code != null) {
      _startTimer();
      unawaited(syncNow());
    }
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _epoch++;
    _timer?.cancel();
    _timer = null;
    super.dispose();
  }

  void _setStatus(SyncStatus s) {
    _status = s;
    if (!_disposed) notifyListeners();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => unawaited(syncNow()));
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  /// Wire to the app's lifecycle: coming to the foreground syncs and keeps
  /// syncing every [interval]; going to the background syncs once more (so the
  /// last edit leaves before the app sleeps) and stops the timer.
  void onAppLifecycle(AppLifecycleState state) {
    if (_code == null) return;
    switch (state) {
      case AppLifecycleState.resumed:
        _startTimer();
        unawaited(syncNow());
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        unawaited(syncNow());
        _stopTimer();
      case AppLifecycleState.inactive:
        break;
      case AppLifecycleState.detached:
        _stopTimer();
    }
  }

  /// Call after the notes were saved to disk.
  void notesSaved() {
    if (_code != null) unawaited(syncNow());
  }

  /// The user deleted a note here: announce it, so it goes away everywhere.
  /// With sync off it is only remembered as ignored.
  void noteDeleted(String id) {
    final ready = _ready;
    if (ready != null && !_loaded) {
      // The saved state is still loading: wait, so the load cannot overwrite this.
      ready.then((_) => noteDeleted(id));
      return;
    }
    if (_code == null) {
      _data.ignored.add(id);
    } else {
      _data.deleted[id] = _now();
      _data.ignored.remove(id);
    }
    if (_loaded) unawaited(store.save(_data));
    notesSaved();
  }

  /// A deleted note came back (an undo): stop treating it as deleted.
  void noteRestored(String id) {
    _data.deleted.remove(id);
    _data.ignored.remove(id);
    unawaited(store.save(_data));
    notesSaved();
  }

  /// Makes a new code, starts using it and uploads everything. Returns it.
  Future<String> createCode() async {
    final code = generateSyncCode();
    await _useCode(code);
    return code;
  }

  /// Uses the code from another device. False when it is not a valid code.
  Future<bool> joinCode(String input) async {
    final code = normalizeSyncCode(input);
    if (code == null) return false;
    if (code != _code) await _useCode(code);
    return true;
  }

  /// Stops syncing and forgets the code. The notes stay on this device.
  Future<void> leave() async {
    await _ready;
    _epoch++;
    _code = null;
    _stopTimer();
    _resetState();
    _setStatus(SyncStatus.off);
    await store.saveCode(null);
    await store.save(_data);
  }

  Future<void> _useCode(String code) async {
    await _ready;
    _epoch++;
    _code = code;
    _resetState();
    _setStatus(const SyncStatus(SyncPhase.syncing));
    await store.saveCode(code);
    await store.save(_data);
    _startTimer();
    unawaited(syncNow());
  }

  /// New notebook: forget what was agreed with the old one. Deletions made for
  /// the old one stay as ignored so they are never imported or announced.
  void _resetState() {
    _data.ignored.addAll(_data.deleted.keys);
    _data
      ..base = {}
      ..deleted = {}
      ..lastStamp = null
      ..v1Imported = false;
  }

  /// Runs a cycle now (or right after the one in progress).
  Future<void> syncNow() {
    if (_code == null) return Future.value();
    final running = _inFlight;
    if (running != null) {
      _rerun = true;
      return running;
    }
    return _inFlight = _loop();
  }

  Future<void> _loop() async {
    try {
      do {
        _rerun = false;
        await _runOnce();
      } while (_rerun && _code != null && !_disposed);
    } finally {
      _inFlight = null;
    }
  }

  Future<void> _runOnce() async {
    await _ready;
    final code = _code;
    if (code == null || _disposed) return;
    final epoch = _epoch;
    // Background cycles while everything is fine do not flash "syncing".
    if (_status.phase != SyncPhase.synced) _setStatus(SyncStatus(SyncPhase.syncing, lastSync: _status.lastSync));
    try {
      await _cycle(code, epoch);
      _setStatus(SyncStatus(SyncPhase.synced, lastSync: DateTime.now()));
    } on _Aborted {
      // The code changed under this cycle; whoever changed it sets the status.
    } catch (e) {
      if (epoch != _epoch) return;
      final last = _status.lastSync;
      if (e is _Denied) {
        _setStatus(SyncStatus(SyncPhase.denied, lastSync: last));
      } else if (_isOffline(e)) {
        _setStatus(SyncStatus(SyncPhase.offline, lastSync: last));
      } else {
        _setStatus(SyncStatus(SyncPhase.error, lastSync: last, message: _detail(e)));
      }
    }
  }

  /// No route to the server, a stalled request, or a connection that dropped
  /// mid-answer (the usual mobile network failure). A real answer with a bad
  /// status ("HTTP 500") is an error, not "offline".
  bool _isOffline(Object e) =>
      e is SocketException ||
      e is TimeoutException ||
      e is TlsException ||
      (e is HttpException && !e.message.startsWith('HTTP '));

  String _detail(Object e) {
    var text = e is HttpException
        ? e.message
        : e is FormatException
        ? 'resposta inesperada do servidor'
        : e.toString();
    text = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    return text.length > 80 ? '${text.substring(0, 80)}…' : text;
  }

  // ---------------------------------------------------------------- cycle

  void _check(int epoch) {
    if (epoch != _epoch || _disposed) throw const _Aborted();
  }

  Future<void> _cycle(String code, int epoch) async {
    final data = _data;

    // 2. One tiny request when nothing changed anywhere.
    final stamp = _asInt(await _request(epoch, 'GET', code, 'v2/stamp.json'));
    final firstLook = _toLocal(notesProvider());
    if (data.v1Imported && stamp == data.lastStamp && !hasLocalChanges(firstLook, data.deleted, data.base)) {
      return;
    }

    // 3. First cycle with this code: notes from the old per-device slots.
    final imported = <String, Note>{};
    if (!data.v1Imported) await _readV1Slots(code, epoch, imported);

    // 4. The notebook as it is in the cloud now.
    final remoteJson = await _request(epoch, 'GET', code, 'v2/notes.json');
    if (remoteJson != null && remoteJson is! Map) throw const FormatException('notes');
    final remote = <String, Object?>{...?(remoteJson as Map?)?.cast<String, Object?>()};

    // From here to onApply there is no await: the notes read here are exactly
    // the ones the result is applied to, so an edit cannot slip in between.
    _check(epoch);
    final current = notesProvider();
    final byId = {for (final n in current) n.id: n};
    final skip = {...data.ignored, ...data.deleted.keys};
    final fresh = [
      for (final n in imported.values)
        if (!byId.containsKey(n.id) && !remote.containsKey(n.id) && !skip.contains(n.id)) n,
    ];
    final result = reconcile(
      me: deviceId,
      now: _now(),
      local: _toLocal([...current, ...fresh]),
      deleted: data.deleted,
      ignored: data.ignored.toList(),
      remote: remote,
      base: data.base,
      newId: _newId,
    );

    final upserts = <Note>[...fresh];
    for (final u in result.upserts) {
      final existing = byId[u.id];
      upserts.add(
        existing != null
            ? Note(
                id: u.id,
                title: u.title,
                time: existing.time,
                body: u.body,
                updatedAt: u.u,
                originDeviceId: existing.originDeviceId,
                forkedFrom: existing.forkedFrom,
              )
            : Note(
                id: u.id,
                title: u.title,
                time: 'Agora',
                body: u.body,
                updatedAt: u.u,
                originDeviceId: validRemote(remote[u.id])?.d ?? deviceId,
              ),
      );
    }
    final removedIds = [for (final r in result.removals) r.id];
    if (upserts.isNotEmpty || removedIds.isNotEmpty) onApply(upserts, removedIds);

    for (final r in result.removals) {
      data.deleted[r.id] = r.deletedAt;
    }
    result.undeletes.forEach(data.deleted.remove);
    // What was agreed counts at once, except for what is still to be uploaded.
    final newBase = <String, BaseEntry>{
      for (final e in result.base.entries)
        if (!result.push.containsKey(e.key)) e.key: e.value,
      for (final id in result.push.keys)
        if (data.base.containsKey(id)) id: data.base[id]!,
    };
    data.base = newBase;
    data.v1Imported = true;
    data.lastStamp = stamp;
    await store.save(data);

    // 5. Upload what the cloud has not seen, in one request.
    if (result.push.isEmpty) return;
    final body = jsonEncode({
      for (final e in result.push.entries) 'notes/${e.key}': e.value.toJson(),
      'stamp': {'.sv': 'timestamp'},
    });
    await _request(epoch, 'PATCH', code, 'v2.json', body: body);
    _check(epoch);
    for (final id in result.push.keys) {
      final entry = result.base[id];
      if (entry != null) data.base[id] = entry;
    }

    // 6. Remember the stamp our own write left, so the next cycle can stop after
    // one request. If it cannot be read now the older stamp stays, and the next
    // cycle simply reads everything once more: the push itself worked.
    try {
      final after = _asInt(await _request(epoch, 'GET', code, 'v2/stamp.json'));
      if (after != null) data.lastStamp = after;
    } on _Aborted {
      rethrow;
    } catch (_) {
      // keep the stamp from before
    }
    _check(epoch);
    await store.save(data);
  }

  List<LocalNote> _toLocal(List<Note> notes) => [
    for (final n in notes) LocalNote(id: n.id, title: n.title, body: n.body, u: n.updatedAt),
  ];

  int? _asInt(Object? v) => v is num ? v.toInt() : null;

  /// Notes in the old per-device slots (/sync/CODE/DEVICE/notes) that this
  /// device does not have. Later edits win when two slots have the same note.
  Future<void> _readV1Slots(String code, int epoch, Map<String, Note> into) async {
    final listing = await _request(epoch, 'GET', code, '.json', query: 'shallow=true');
    if (listing is! Map) return;
    for (final slot in listing.keys.whereType<String>()) {
      if (slot == 'v2' || slot == deviceId || !noteIdPattern.hasMatch(slot)) continue;
      final notes = await _request(epoch, 'GET', code, '$slot/notes.json');
      // Firebase answers an array for dense integer keys and an object otherwise.
      final list = notes is List ? notes : (notes is Map ? notes.values.toList() : const []);
      for (final raw in list) {
        if (raw is! Map) continue;
        try {
          final note = Note.fromJson(Map<String, dynamic>.from(raw));
          if (!noteIdPattern.hasMatch(note.id)) continue;
          if (isBlankNote(note.title, note.body)) continue;
          // Copies this device made itself in the first versions.
          if (note.forkedFrom?.deviceId == deviceId) continue;
          final known = into[note.id];
          if (known == null || note.updatedAt > known.updatedAt) into[note.id] = note;
        } catch (_) {
          // one bad note must not cost the rest
        }
      }
    }
  }

  // ----------------------------------------------------------------- http

  Uri _uri(String code, String path, String? query) {
    final q = [if (query != null && query.isNotEmpty) query, if (extraQuery.isNotEmpty) extraQuery].join('&');
    // '.json' alone means the whole code node: /sync/CODE.json
    final where = path == '.json' ? '/sync/$code.json' : '/sync/$code/$path';
    return Uri.parse('$baseUrl$where${q.isEmpty ? '' : '?$q'}');
  }

  Future<Object?> _request(int epoch, String method, String code, String path, {String? query, String? body}) async {
    final client = HttpClient()..connectionTimeout = requestTimeout;
    try {
      final result = await _send(client, method, _uri(code, path, query), body).timeout(requestTimeout);
      _check(epoch);
      return result;
    } finally {
      client.close(force: true);
    }
  }

  Future<Object?> _send(HttpClient client, String method, Uri uri, String? body) async {
    final req = await client.openUrl(method, uri);
    if (body != null) {
      final bytes = utf8.encode(body);
      req.headers.contentType = ContentType.json;
      req.contentLength = bytes.length;
      req.add(bytes);
    }
    final res = await req.close();
    final text = await utf8.decoder.bind(res).join();
    if (res.statusCode == HttpStatus.unauthorized || res.statusCode == HttpStatus.forbidden) throw const _Denied();
    if (res.statusCode != HttpStatus.ok) throw HttpException('HTTP ${res.statusCode}');
    return text.trim().isEmpty ? null : jsonDecode(text);
  }
}
