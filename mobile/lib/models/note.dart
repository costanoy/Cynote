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

List<Note> seedNotes() => [
      Note(
        id: 't1',
        title: 'Bloquinho',
        time: 'Hoje, 14:32',
        body: 'TODOs — sprint sync\n\n'
            'Terminar o debounce de 1.5s no auto-save. Testar em modo avião pra ver a fila de sync.\n\n'
            'Registrar Shell Extension no Explorer.\n'
            'Ícone de bandeja com status de sync.',
      ),
      Note(
        id: 't2',
        title: 'Referências',
        time: 'Ontem, 21:10',
        body: 'Referências — mestrado\n\n'
            'Ler no ônibus, continuar sincronizado no notebook à noite.\n\n'
            '[1] Kleppmann, M. — local-first software: por que apps deveriam sincronizar sem depender de tempo real colaborativo pra funcionar bem sozinho.\n\n'
            'Shapiro & Preguiça — CRDTs como base pra sync multi-dispositivo sem conflito.',
      ),
      Note(
        id: 't3',
        title: 'Roteiro: Vídeo IA',
        time: 'Seg, 09:15',
        body: 'Roteiro: Vídeo IA\n\n'
            'Gancho: "todo mundo já perdeu uma nota importante trocando de tela."\n\n'
            'Mostrar o modo bloquinho abrindo instantâneo, depois o mesmo texto já no celular.',
      ),
    ];
