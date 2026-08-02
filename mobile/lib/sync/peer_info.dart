class PeerInfo {
  final String deviceId;
  final String deviceName;
  final String address;
  final int port;

  const PeerInfo({
    required this.deviceId,
    required this.deviceName,
    required this.address,
    required this.port,
  });

  Map<String, dynamic> toJson() => {
        'deviceId': deviceId,
        'deviceName': deviceName,
        'address': address,
        'port': port,
      };

  factory PeerInfo.fromJson(Map<String, dynamic> json) => PeerInfo(
        deviceId: json['deviceId'] as String,
        deviceName: json['deviceName'] as String? ?? 'Dispositivo',
        address: json['address'] as String? ?? '',
        port: (json['port'] as num?)?.toInt() ?? 0,
      );
}

enum PairStatus { pending, accepted, declined }
