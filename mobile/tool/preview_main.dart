// Web preview of the Android app's screens, for layout review only. The real
// app never imports this file.
//
//   flutter build web -t tool/preview_main.dart --no-web-resources-cdn
//
// Then open build/web/index.html through any static server, with a query:
//   ?screen=home|search|editor|settings  &theme=light|dark
//   &q=<search term>  &empty=1 (no notes)  &sync=on (settings with a code)
//
// Every note below is SAMPLE content, written for the preview.
import 'package:flutter/material.dart';
import 'package:mobile/main.dart';
import 'package:mobile/models/note.dart';
import 'package:mobile/sync/cloud_sync.dart';

const _sampleMeeting =
    'Pauta da reunião ☕\n'
    '- Revisar o orçamento do trimestre\n'
    '- Ligar para a gráfica e confirmar a entrega dos cartões até sexta-feira\n'
    '- Levar o caderno de anotações\n'
    '\n'
    'Decisões:\n'
    '[ ] Mudar o horário para 9h30\n'
    '[x] Avisar a equipe 👍';

List<Note> _sampleNotes(DateTime now) {
  int ago(Duration d) => now.subtract(d).millisecondsSinceEpoch;
  return [
    Note(
      id: 'exemplo-1',
      title: 'Reunião de quinta',
      time: '',
      body: _sampleMeeting,
      updatedAt: ago(const Duration(minutes: 5)),
    ),
    Note(
      id: 'exemplo-2',
      title: 'Lista do mercado',
      time: '',
      body: 'Arroz\nFeijão\nCafé em grãos\nMaçã e banana\nPão de queijo',
      updatedAt: ago(const Duration(hours: 2)),
    ),
    Note(
      id: 'exemplo-3',
      title: 'Ideias para o vídeo',
      time: '',
      body: 'Abrir com o atalho Ctrl+Shift+Espaço e mostrar a nota aparecendo no celular.',
      updatedAt: ago(const Duration(days: 1, hours: 3)),
    ),
    Note(
      id: 'exemplo-4',
      title: 'Livros para ler',
      time: '',
      body: 'Grande Sertão: Veredas\nO Tempo e o Vento\nVidas Secas',
      updatedAt: ago(const Duration(days: 3)),
    ),
    Note(
      id: 'exemplo-5',
      title: '',
      time: '',
      body: 'Dentista: rua das Acácias, 120, sala 4. Terça às 15h.',
      updatedAt: ago(const Duration(days: 12)),
    ),
    Note(
      id: 'exemplo-0',
      title: 'Sobre estas notas',
      time: '',
      body: 'Notas de exemplo, escritas só para a prévia do layout.',
      updatedAt: ago(const Duration(days: 40)),
    ),
  ];
}

void main() {
  final q = Uri.base.queryParameters;
  final screen = CyScreen.values.firstWhere((s) => s.name == q['screen'], orElse: () => CyScreen.home);
  final dark = switch (q['theme']) {
    'dark' => true,
    'light' => false,
    _ => null,
  };
  final notes = q['empty'] == '1' ? <Note>[] : _sampleNotes(DateTime.now());
  final syncOn = q['sync'] == 'on';
  final caret = _sampleMeeting.indexOf('confirmar');

  registerFontLicense();
  runApp(
    CynoteApp(
      initialNotes: notes,
      preview: CynotePreview(
        screen: screen,
        noteId: screen == CyScreen.editor ? 'exemplo-1' : null,
        caret: screen == CyScreen.editor && q['focus'] != '0' ? caret : null,
        searchQuery: q['q'] ?? '',
        darkMode: dark,
        syncCode: syncOn ? '4F2A9-C81D0-77B3E-0A1C5' : null,
        syncStatus: syncOn
            ? SyncStatus(SyncPhase.synced, lastSync: DateTime.now().subtract(const Duration(minutes: 2)))
            : SyncStatus.off,
        version: '0.1.31',
      ),
    ),
  );
}
