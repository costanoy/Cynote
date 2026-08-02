import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

class DeviceIdentity {
  final String deviceId;
  final String deviceName;
  const DeviceIdentity({required this.deviceId, required this.deviceName});
}

DeviceIdentity? _cached;

Future<File> _identityFile() async {
  final dir = await getApplicationDocumentsDirectory();
  return File('${dir.path}/device.json');
}

String _hostName() {
  try {
    final name = Platform.localHostname;
    return name.isNotEmpty ? name : 'Celular';
  } catch (_) {
    return 'Celular';
  }
}

Future<DeviceIdentity> getDeviceIdentity() async {
  if (_cached != null) return _cached!;

  try {
    final file = await _identityFile();
    if (await file.exists()) {
      final decoded = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      _cached = DeviceIdentity(
        deviceId: decoded['deviceId'] as String,
        deviceName: decoded['deviceName'] as String,
      );
      return _cached!;
    }

    final identity = DeviceIdentity(deviceId: const Uuid().v4(), deviceName: _hostName());
    await file.writeAsString(jsonEncode({'deviceId': identity.deviceId, 'deviceName': identity.deviceName}));
    _cached = identity;
    return identity;
  } catch (_) {
    _cached = DeviceIdentity(deviceId: const Uuid().v4(), deviceName: _hostName());
    return _cached!;
  }
}
