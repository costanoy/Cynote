import 'dart:convert';
import 'dart:io';

import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

/// Mirrors the desktop app's auto-updater, but Android has no equivalent of
/// Tauri's updater plugin - this hand-rolls the same idea against the same
/// GitHub repo: a `latest-android.json` manifest (published alongside the
/// APK on each release) tells the app whether a newer build exists.
class MobileUpdate {
  final int buildNumber;
  final String version;
  final String notes;
  final String apkUrl;

  const MobileUpdate({
    required this.buildNumber,
    required this.version,
    required this.notes,
    required this.apkUrl,
  });
}

const _manifestUrl = 'https://github.com/costanoy/Cynote/releases/latest/download/latest-android.json';

/// Null if there's no update, the device is offline, or the check failed.
Future<MobileUpdate?> checkForMobileUpdate() async {
  final client = HttpClient();
  try {
    final request = await client.getUrl(Uri.parse(_manifestUrl));
    final response = await request.close();
    if (response.statusCode != 200) return null;

    final body = await response.transform(utf8.decoder).join();
    final json = jsonDecode(body) as Map<String, dynamic>;
    final buildNumber = json['buildNumber'] as int;

    final info = await PackageInfo.fromPlatform();
    final current = int.tryParse(info.buildNumber) ?? 0;
    if (buildNumber <= current) return null;

    return MobileUpdate(
      buildNumber: buildNumber,
      version: json['version'] as String,
      notes: json['notes'] as String? ?? '',
      apkUrl: json['apkUrl'] as String,
    );
  } catch (e) {
    // Swallowed on purpose (offline shouldn't nag the user) - logged so a
    // genuine failure is still visible instead of silently vanishing.
    // ignore: avoid_print
    print('Mobile update check failed: $e');
    return null;
  } finally {
    client.close();
  }
}

/// Downloads the APK to a temp file and hands it to the system installer -
/// the user still sees Android's own "install this app?" confirmation, this
/// just gets them there without hunting for a download link themselves.
Future<void> downloadAndInstallMobileUpdate(MobileUpdate update) async {
  final client = HttpClient();
  final bytes = <int>[];
  try {
    final request = await client.getUrl(Uri.parse(update.apkUrl));
    final response = await request.close();
    await for (final chunk in response) {
      bytes.addAll(chunk);
    }
  } finally {
    client.close();
  }

  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/cynote-update.apk');
  await file.writeAsBytes(bytes, flush: true);
  await OpenFilex.open(file.path);
}
