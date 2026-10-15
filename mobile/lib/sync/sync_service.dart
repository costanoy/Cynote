import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:bonsoir/bonsoir.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../device_identity.dart';
import '../models/note.dart';
import 'bookkeeping_store.dart';
import 'deleted_notes_store.dart';
import 'merge.dart';
import 'peer_info.dart';

const _serviceType = '_cynote._tcp';
const _syncInterval = Duration(seconds: 25);
const _httpTimeout = Duration(seconds: 8);
const _maxRequestBytes = 16 * 1024;

/// A paired device, and the secret both sides agreed on when pairing. Every
/// request for notes - in either direction - has to present that secret;
/// without it, anyone on the same network could ask for (and get) them.
class TrustedPeer {
  final String name;
  final String secret;
  const TrustedPeer(this.name, this.secret);

  Map<String, dynamic> toJson() => {'name': name, 'secret': secret};
}

String newPairingSecret() {
  final random = Random.secure();
  return List.generate(32, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

bool isValidPairingSecret(String s) => s.length >= 32 && s.length <= 128 && RegExp(r'^[0-9a-fA-F]+$').hasMatch(s);

/// Constant-time comparison, so response timing can't reveal how much of a
/// guessed secret was right.
bool sameSecret(String a, String b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
  }
  return diff == 0;
}

class SyncService extends ChangeNotifier {
  final DeviceIdentity own;
  final BookkeepingStore bookkeeping;
  final DeletedNotesStore deleted;
  SyncService(this.own, this.bookkeeping, this.deleted);

  HttpServer? _server;
  BonsoirBroadcast? _broadcast;
  BonsoirDiscovery? _discovery;
  Timer? _syncTimer;
  bool _cycleRunning = false;

  final Map<String, PeerInfo> discovered = {};
  final Map<String, TrustedPeer> trusted = {};
  final Map<String, PeerInfo> incomingRequests = {};
  final Map<String, String> _incomingSecrets = {};

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
      await bookkeeping.load();
      await deleted.load();

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

  bool _isAuthorized(HttpRequest request) {
    final header = request.headers.value(HttpHeaders.authorizationHeader) ?? '';
    if (!header.startsWith('Bearer ')) return false;
    final token = header.substring('Bearer '.length).trim();
    return trusted.values.any((t) => sameSecret(t.secret, token));
  }

  /// A pairing request is a few hundred bytes - never read more than this.
  Future<String?> _readSmallBody(HttpRequest request) async {
    final bytes = <int>[];
    await for (final chunk in request) {
      bytes.addAll(chunk);
      if (bytes.length > _maxRequestBytes) return null;
    }
    return utf8.decode(bytes, allowMalformed: true);
  }

  Future<void> _handleRequest(HttpRequest request) async {
    final path = request.uri.path;
    request.response.headers.contentType = ContentType.json;

    if (request.method == 'GET' && path == '/cynote/notes') {
      if (!_isAuthorized(request)) {
        request.response.statusCode = HttpStatus.unauthorized;
        request.response.write(jsonEncode({'error': 'not paired'}));
      } else {
        request.response.write(jsonEncode({
          'deviceId': own.deviceId,
          'deviceName': own.deviceName,
          'notes': notesProvider().map((n) => n.toJson()).toList(),
        }));
      }
      await request.response.close();
      return;
    }

    if (request.method == 'POST' && path == '/cynote/pair-request') {
      try {
        final body = await _readSmallBody(request);
        final json = jsonDecode(body ?? '') as Map<String, dynamic>;
        final deviceId = (json['deviceId'] as String).trim();
        final secret = json['secret'] as String? ?? '';
        // Also what older versions get: they don't send a pairing secret.
        if (deviceId.isEmpty || deviceId.length > 64 || !isValidPairingSecret(secret)) {
          throw const FormatException('invalid pairing request');
        }
        final rawName = json['deviceName'] as String? ?? 'Dispositivo';
        final deviceName = rawName.length > 80 ? rawName.substring(0, 80) : rawName;
        final port = (json['port'] as num?)?.toInt() ?? 0;
        final address = request.connectionInfo?.remoteAddress.address ?? '';
        // While a request is waiting on the user, another one claiming to be
        // the same device can't swap in its own secret.
        if (!incomingRequests.containsKey(deviceId)) {
          incomingRequests[deviceId] = PeerInfo(deviceId: deviceId, deviceName: deviceName, address: address, port: port);
          _incomingSecrets[deviceId] = secret;
          notifyListeners();
        }
        request.response.write(jsonEncode({'status': 'pending'}));
      } catch (_) {
        request.response.statusCode = HttpStatus.badRequest;
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

    request.response.statusCode = HttpStatus.notFound;
    request.response.write(jsonEncode({'error': 'not found'}));
    await request.response.close();
  }

  final Map<String, PairStatus> _pairStatuses = {};

  HttpClient _client() => HttpClient()..connectionTimeout = _httpTimeout;

  /// Called by the initiating side: sends a pairing request to [peer] and polls for the result.
  Future<bool> requestPairing(PeerInfo peer) async {
    final client = _client();
    // Proposed by whoever starts the pairing; both sides keep it once accepted.
    final secret = newPairingSecret();
    try {
      final req = await client.postUrl(Uri.parse('http://${peer.address}:${peer.port}/cynote/pair-request'));
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({
        'deviceId': own.deviceId,
        'deviceName': own.deviceName,
        'port': _server!.port,
        'secret': secret,
      }));
      await req.close().timeout(_httpTimeout);

      for (var i = 0; i < 20; i++) {
        await Future.delayed(const Duration(seconds: 1));
        try {
          final statusReq = await client.getUrl(
            Uri.parse('http://${peer.address}:${peer.port}/cynote/pair-status?deviceId=${own.deviceId}'),
          );
          final statusRes = await statusReq.close().timeout(_httpTimeout);
          final text = await utf8.decoder.bind(statusRes).join().timeout(_httpTimeout);
          if (text.contains('accepted')) {
            trusted[peer.deviceId] = TrustedPeer(peer.deviceName, secret);
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
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }

  /// Called by the receiving side when the local user responds to an incoming pairing prompt.
  void respondToPairing(String deviceId, bool accept) {
    _pairStatuses[deviceId] = accept ? PairStatus.accepted : PairStatus.declined;
    final peer = incomingRequests.remove(deviceId);
    final secret = _incomingSecrets.remove(deviceId);
    if (accept && peer != null && secret != null) {
      trusted[deviceId] = TrustedPeer(peer.deviceName, secret);
      _saveTrusted();
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>?> _fetchPeerNotes(PeerInfo peer) async {
    final secret = trusted[peer.deviceId]?.secret;
    if (secret == null) return null;
    final client = _client();
    try {
      final req = await client.getUrl(Uri.parse('http://${peer.address}:${peer.port}/cynote/notes'));
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $secret');
      final res = await req.close().timeout(_httpTimeout);
      if (res.statusCode != HttpStatus.ok) return null;
      final text = await utf8.decoder.bind(res).join().timeout(_httpTimeout);
      final decoded = jsonDecode(text);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> runSyncCycle() async {
    if (_cycleRunning) return;
    _cycleRunning = true;
    try {
      final peers = reachableTrustedPeers.values.toList();
      final fetched = <String, List<Note>>{};
      for (final peer in peers) {
        final resp = await _fetchPeerNotes(peer);
        if (resp == null) continue;
        fetched[peer.deviceId] = notesFromJsonList(resp['notes']);
      }
      if (fetched.isEmpty) return;

      // No awaits from here until the result is handed back, so the merge
      // can't interleave with an edit or with the internet sync's own merge.
      var currentNotes = notesProvider();
      var book = bookkeeping.value;
      var anyChange = false;
      fetched.forEach((peerId, peerNotes) {
        final result = mergeFromPeer(
          myNotes: currentNotes,
          peerNotes: peerNotes,
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

  Future<File> _trustedFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/trusted_devices.json');
  }

  /// Devices paired by older versions were stored as just a name, with no
  /// secret to check them against - they're dropped, and need pairing again.
  Future<void> _loadTrusted() async {
    try {
      final file = await _trustedFile();
      if (await file.exists()) {
        final decoded = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
        decoded.forEach((id, value) {
          if (value is Map && value['name'] is String && value['secret'] is String) {
            final secret = value['secret'] as String;
            if (isValidPairingSecret(secret)) trusted[id] = TrustedPeer(value['name'] as String, secret);
          }
        });
      }
    } catch (_) {
      // fresh install, no trusted devices yet
    }
  }

  Future<void> _saveTrusted() async {
    try {
      final file = await _trustedFile();
      await file.writeAsString(jsonEncode(trusted.map((id, peer) => MapEntry(id, peer.toJson()))));
    } catch (_) {
      // best-effort
    }
  }
}
