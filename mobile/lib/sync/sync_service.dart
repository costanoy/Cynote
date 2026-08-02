import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:bonsoir/bonsoir.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../device_identity.dart';
import '../models/note.dart';
import 'merge.dart';
import 'peer_info.dart';

const _serviceType = '_cynote._tcp';
const _syncInterval = Duration(seconds: 25);

class SyncService extends ChangeNotifier {
  final DeviceIdentity own;
  SyncService(this.own);

  HttpServer? _server;
  BonsoirBroadcast? _broadcast;
  BonsoirDiscovery? _discovery;
  Timer? _syncTimer;
  Bookkeeping _bookkeeping = {};

  final Map<String, PeerInfo> discovered = {};
  final Map<String, String> trusted = {};
  final Map<String, PeerInfo> incomingRequests = {};

  /// Devices that are both trusted and currently visible on the network.
  Map<String, PeerInfo> get reachableTrustedPeers => {
        for (final entry in discovered.entries)
          if (trusted.containsKey(entry.key)) entry.key: entry.value,
      };

  /// Devices visible on the network that aren't trusted yet (candidates to connect to).
  List<PeerInfo> get connectableDevices =>
      discovered.values.where((p) => !trusted.containsKey(p.deviceId)).toList();

  /// Supplies this device's current notes for GET /cynote/notes and for merging.
  List<Note> Function() notesProvider = () => [];

  /// Called with the reconciled note list after a sync cycle changes something.
  void Function(List<Note> notes)? onNotesMerged;

  /// Best-effort: if networking or the mDNS platform plugin isn't available
  /// (e.g. running under `flutter test`, or a restricted network), the app
  /// should keep working without sync rather than crash.
  Future<void> start() async {
    try {
      await _loadTrusted();
      await _loadBookkeeping();

      _server = await HttpServer.bind(InternetAddress.anyIPv4, 0);
      _server!.listen(_handleRequest);

      final service = BonsoirService(
        name: own.deviceId,
        type: _serviceType,
        port: _server!.port,
        attributes: {'deviceId': own.deviceId, 'deviceName': own.deviceName},
      );
      _broadcast = BonsoirBroadcast(service: service);
      await _broadcast!.initialize();
      await _broadcast!.start();

      _discovery = BonsoirDiscovery(type: _serviceType);
      await _discovery!.initialize();
      _discovery!.eventStream?.listen(_handleDiscoveryEvent);
      await _discovery!.start();

      _syncTimer = Timer.periodic(_syncInterval, (_) => runSyncCycle());
      runSyncCycle();
    } catch (_) {
      // sync unavailable in this environment; app continues without it
    }
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    _discovery?.stop();
    _broadcast?.stop();
    _server?.close(force: true);
    super.dispose();
  }

  void _maybeResolve(BonsoirService s) {
    final deviceId = s.attributes['deviceId'];
    if (deviceId == null || deviceId == own.deviceId) return;
    if (s.host == null) {
      s.resolve(_discovery!.serviceResolver);
    }
  }

  void _handleDiscoveryEvent(BonsoirDiscoveryEvent event) {
    if (event is BonsoirDiscoveryServiceFoundEvent) {
      _maybeResolve(event.service);
    } else if (event is BonsoirDiscoveryServiceUpdatedEvent) {
      _maybeResolve(event.service);
    } else if (event is BonsoirDiscoveryServiceResolvedEvent) {
      final s = event.service;
      final deviceId = s.attributes['deviceId'];
      final deviceName = s.attributes['deviceName'] ?? 'Dispositivo';
      final host = s.host;
      if (deviceId == null || deviceId == own.deviceId || host == null) return;
      discovered[deviceId] = PeerInfo(deviceId: deviceId, deviceName: deviceName, address: host, port: s.port);
      notifyListeners();
    } else if (event is BonsoirDiscoveryServiceLostEvent) {
      final deviceId = event.service.attributes['deviceId'];
      if (deviceId != null) {
        discovered.remove(deviceId);
        notifyListeners();
      }
    }
  }

  Future<void> _handleRequest(HttpRequest request) async {
    final path = request.uri.path;
    request.response.headers.contentType = ContentType.json;

    if (request.method == 'GET' && path == '/cynote/notes') {
      final body = jsonEncode({
        'deviceId': own.deviceId,
        'deviceName': own.deviceName,
        'notes': notesProvider().map((n) => n.toJson()).toList(),
      });
      request.response.write(body);
      await request.response.close();
      return;
    }

    if (request.method == 'POST' && path == '/cynote/pair-request') {
      final body = await utf8.decoder.bind(request).join();
      try {
        final json = jsonDecode(body) as Map<String, dynamic>;
        final deviceId = json['deviceId'] as String;
        final deviceName = json['deviceName'] as String? ?? 'Dispositivo';
        final port = (json['port'] as num?)?.toInt() ?? 0;
        final address = request.connectionInfo?.remoteAddress.address ?? '';
        incomingRequests[deviceId] =
            PeerInfo(deviceId: deviceId, deviceName: deviceName, address: address, port: port);
        notifyListeners();
        request.response.write(jsonEncode({'status': 'pending'}));
      } catch (_) {
        request.response.statusCode = 400;
        request.response.write(jsonEncode({'error': 'invalid body'}));
      }
      await request.response.close();
      return;
    }

    if (request.method == 'GET' && path == '/cynote/pair-status') {
      final deviceId = request.uri.queryParameters['deviceId'] ?? '';
      final status = _pairStatuses[deviceId];
      final statusStr = switch (status) {
        PairStatus.accepted => 'accepted',
        PairStatus.declined => 'declined',
        _ => trusted.containsKey(deviceId) ? 'accepted' : 'pending',
      };
      request.response.write(jsonEncode({'status': statusStr}));
      await request.response.close();
      return;
    }

    request.response.statusCode = 404;
    request.response.write(jsonEncode({'error': 'not found'}));
    await request.response.close();
  }

  final Map<String, PairStatus> _pairStatuses = {};

  /// Called by the initiating side: sends a pairing request to [peer] and polls for the result.
  Future<bool> requestPairing(PeerInfo peer) async {
    final client = HttpClient();
    try {
      final req = await client.postUrl(Uri.parse('http://${peer.address}:${peer.port}/cynote/pair-request'));
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({'deviceId': own.deviceId, 'deviceName': own.deviceName, 'port': _server!.port}));
      await req.close();

      for (var i = 0; i < 20; i++) {
        await Future.delayed(const Duration(seconds: 1));
        try {
          final statusReq = await client.getUrl(
            Uri.parse('http://${peer.address}:${peer.port}/cynote/pair-status?deviceId=${own.deviceId}'),
          );
          final statusRes = await statusReq.close();
          final text = await utf8.decoder.bind(statusRes).join();
          if (text.contains('accepted')) {
            trusted[peer.deviceId] = peer.deviceName;
            await _saveTrusted();
            notifyListeners();
            return true;
          }
          if (text.contains('declined')) return false;
        } catch (_) {
          // peer may be briefly unreachable while polling; keep trying
        }
      }
      return false;
    } finally {
      client.close(force: true);
    }
  }

  /// Called by the receiving side when the local user responds to an incoming pairing prompt.
  void respondToPairing(String deviceId, bool accept) {
    _pairStatuses[deviceId] = accept ? PairStatus.accepted : PairStatus.declined;
    final peer = incomingRequests.remove(deviceId);
    if (accept && peer != null) {
      trusted[deviceId] = peer.deviceName;
      _saveTrusted();
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>?> _fetchPeerNotes(PeerInfo peer) async {
    final client = HttpClient();
    try {
      final req = await client.getUrl(Uri.parse('http://${peer.address}:${peer.port}/cynote/notes'));
      final res = await req.close();
      final text = await utf8.decoder.bind(res).join();
      return jsonDecode(text) as Map<String, dynamic>;
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> runSyncCycle() async {
    final peers = reachableTrustedPeers.values.toList();
    if (peers.isEmpty) return;

    var currentNotes = notesProvider();
    var book = _bookkeeping;
    var anyChange = false;

    for (final peer in peers) {
      final resp = await _fetchPeerNotes(peer);
      if (resp == null) continue;
      final peerNotesJson = resp['notes'] as List<dynamic>? ?? [];
      final peerNotes = peerNotesJson.map((n) => Note.fromJson(n as Map<String, dynamic>)).toList();

      final result = mergeFromPeer(
        myNotes: currentNotes,
        peerNotes: peerNotes,
        peerId: peer.deviceId,
        peerName: peer.deviceName,
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

  Future<File> _trustedFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/trusted_devices.json');
  }

  Future<void> _loadTrusted() async {
    try {
      final file = await _trustedFile();
      if (await file.exists()) {
        final decoded = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
        trusted.addAll(decoded.map((k, v) => MapEntry(k, v as String)));
      }
    } catch (_) {
      // fresh install, no trusted devices yet
    }
  }

  Future<void> _saveTrusted() async {
    try {
      final file = await _trustedFile();
      await file.writeAsString(jsonEncode(trusted));
    } catch (_) {
      // best-effort
    }
  }

  Future<File> _bookkeepingFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/sync_bookkeeping.json');
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
