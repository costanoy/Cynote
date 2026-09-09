class ForkedFrom {
  final String deviceId;
  final String noteId;

  const ForkedFrom({required this.deviceId, required this.noteId});

  Map<String, dynamic> toJson() => {'deviceId': deviceId, 'noteId': noteId};

  factory ForkedFrom.fromJson(Map<String, dynamic> json) => ForkedFrom(
        deviceId: json['deviceId'] as String,
        noteId: json['noteId'] as String,
      );
}

class Note {
  final String id;
  String title;
  final String time;
  String body;
  final int updatedAt;
  final String originDeviceId;
  final ForkedFrom? forkedFrom;

  Note({
    required this.id,
    required this.title,
    required this.time,
    required this.body,
    int? updatedAt,
    this.originDeviceId = 'seed',
    this.forkedFrom,
  }) : updatedAt = updatedAt ?? DateTime.now().millisecondsSinceEpoch;

  Note copyWith({String? title, String? body}) => Note(
        id: id,
        title: title ?? this.title,
        time: time,
        body: body ?? this.body,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
        originDeviceId: originDeviceId,
        forkedFrom: forkedFrom,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'time': time,
        'body': body,
        'updatedAt': updatedAt,
        'originDeviceId': originDeviceId,
        if (forkedFrom != null) 'forkedFrom': forkedFrom!.toJson(),
      };

  factory Note.fromJson(Map<String, dynamic> json) => Note(
        id: json['id'] as String,
        title: json['title'] as String,
        time: json['time'] as String? ?? '',
        body: json['body'] as String,
        updatedAt: json['updatedAt'] as int?,
        originDeviceId: json['originDeviceId'] as String? ?? 'seed',
        forkedFrom: json['forkedFrom'] != null
            ? ForkedFrom.fromJson(json['forkedFrom'] as Map<String, dynamic>)
            : null,
      );
}
