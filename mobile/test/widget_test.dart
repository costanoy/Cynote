import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderEditable;
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/main.dart';
import 'package:mobile/icons.dart';
import 'package:mobile/models/note.dart';
import 'package:mobile/screens/editor_screen.dart' show characterCountLabel;

void main() {
  List<Note> testNotes() => [
    Note(id: 't1', title: 'Bloquinho', time: 'Hoje, 14:32', body: 'Conteudo de teste 1'),
    Note(id: 't2', title: 'Referências', time: 'Ontem, 21:10', body: 'Conteudo de teste 2'),
    Note(id: 't3', title: 'Roteiro: Vídeo IA', time: 'Seg, 09:15', body: 'Conteudo de teste 3'),
  ];

  // Reduced motion on: screen changes cut instead of fading, like on a phone
  // with "Remove animations" set.
  Future<void> pumpApp(WidgetTester tester, {List<Note>? notes}) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    // A phone-sized screen, like the one the layout is designed for.
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(CynoteApp(initialNotes: notes ?? testNotes()));
  }

  Future<void> goToHome(WidgetTester tester, {List<Note>? notes}) async {
    await pumpApp(tester, notes: notes);
    await tester.pumpAndSettle();
  }

  /// Titles from top to bottom, as they are on screen.
  List<String> onScreenOrder(WidgetTester tester, List<String> titles) =>
      [...titles]..sort((a, b) => tester.getTopLeft(find.text(a)).dy.compareTo(tester.getTopLeft(find.text(b)).dy));

  testWidgets('Notes list the last edited first, and can be sorted by title or oldest', (tester) async {
    final now = DateTime.now();
    Note edited(String id, String title, Duration ago) =>
        Note(id: id, title: title, time: 'Agora', body: 'texto', updatedAt: now.subtract(ago).millisecondsSinceEpoch);
    await goToHome(
      tester,
      notes: [
        edited('n1', 'Zebra', const Duration(hours: 30)),
        edited('n2', 'Abacate', const Duration(minutes: 5)),
        edited('n3', 'Âmbar', const Duration(days: 40)),
      ],
    );
    const titles = ['Zebra', 'Abacate', 'Âmbar'];

    expect(find.text('3 notas'), findsOneWidget);
    expect(find.text('Mais recentes'), findsOneWidget);
    expect(onScreenOrder(tester, titles), ['Abacate', 'Zebra', 'Âmbar']);
    // The row shows when the note was edited, not the time it was created.
    expect(find.text('há 5 min'), findsOneWidget);
    expect(find.text('Agora'), findsNothing);

    await tester.tap(find.text('Mais recentes'));
    await tester.pumpAndSettle();
    expect(find.text('Ordenar por'), findsOneWidget);
    await tester.tap(find.text('Título (A a Z)'));
    await tester.pumpAndSettle();
    expect(onScreenOrder(tester, titles), ['Abacate', 'Âmbar', 'Zebra']);

    await tester.tap(find.text('Título (A a Z)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mais antigas'));
    await tester.pumpAndSettle();
    expect(onScreenOrder(tester, titles), ['Âmbar', 'Zebra', 'Abacate']);
  });

  testWidgets('Home is the first screen and lists the notes', (tester) async {
    await pumpApp(tester);
    await tester.pumpAndSettle();

    expect(find.text('Sincronize com seu computador'), findsNothing);
    expect(find.text('Cynote'), findsOneWidget);
    expect(find.text('Bloquinho'), findsOneWidget);
    expect(find.text('Referências'), findsOneWidget);
    expect(find.text('Roteiro: Vídeo IA'), findsOneWidget);
  });

  testWidgets('An empty list says how to write the first note', (tester) async {
    await goToHome(tester, notes: const []);

    expect(find.text('Nenhuma nota ainda'), findsOneWidget);
    expect(find.text('Toque em + para escrever a primeira.'), findsOneWidget);
    expect(find.byType(PlusIcon), findsOneWidget);
  });

  testWidgets('Search filters notes and shows empty state', (tester) async {
    await goToHome(tester);

    await tester.tap(find.byType(SearchIcon));
    await tester.pumpAndSettle();
    expect(find.text('Cynote'), findsNothing);

    await tester.enterText(find.byType(TextField), 'Roteiro');
    await tester.pumpAndSettle();

    // Search results highlight the match, so the title is rich text.
    expect(find.text('Roteiro: Vídeo IA', findRichText: true), findsOneWidget);
    expect(find.text('Bloquinho', findRichText: true), findsNothing);

    await tester.enterText(find.byType(TextField), 'xyz-not-found');
    await tester.pumpAndSettle();

    expect(find.text('Nenhuma nota encontrada'), findsOneWidget);
    expect(find.text('Tente outra palavra.'), findsOneWidget);

    await tester.tap(find.byType(BackChevronIcon));
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsOneWidget);
  });

  testWidgets('Opening a note goes to editor and back returns to home', (tester) async {
    await goToHome(tester);

    await tester.tap(find.text('Bloquinho'));
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsNothing);
    expect(find.byType(TextField), findsWidgets);
    expect(find.text('19 caracteres'), findsOneWidget);
    expect(find.text('Sincronização desligada'), findsOneWidget);

    await tester.tap(find.byType(BackChevronIcon));
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsOneWidget);
  });

  testWidgets('System back leaves the editor for the list', (tester) async {
    await goToHome(tester);

    await tester.tap(find.text('Bloquinho'));
    await tester.pumpAndSettle();
    expect(find.text('Cynote'), findsNothing);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsOneWidget);
  });

  testWidgets('Every row of note text has the same height', (tester) async {
    await goToHome(
      tester,
      notes: [
        Note(
          id: 'r1',
          title: 'Pauta',
          time: '',
          body:
              'Linha curta\nAçúcar, pão e maçã 🍎\nEsta linha é comprida o bastante para quebrar em mais de uma linha na tela do celular.',
        ),
      ],
    );
    await tester.tap(find.text('Pauta'));
    await tester.pumpAndSettle();

    final bodyField = find.byWidgetPredicate((w) => w is TextField && w.maxLines == null);
    final body = tester.widget<TextField>(bodyField);
    expect(body.strutStyle?.forceStrutHeight, isTrue);
    expect(body.strutStyle?.fontSize, 15);
    expect(body.style?.fontFamily, 'JetBrainsMono');

    // With the strut forced, every row is one pitch: the text, its wrapped
    // row and the emoji row each start a whole number of pitches from the
    // top, and the text starts at the top of the field.
    final editable = tester.allRenderObjects.whereType<RenderEditable>().firstWhere(
      (e) => e.text?.toPlainText() == body.controller!.text,
    );
    expect(editable.preferredLineHeight, 26);
    expect(editable.localToGlobal(Offset.zero), tester.getTopLeft(bodyField));
    final text = body.controller!.text;
    for (final offset in [0, text.indexOf('Açúcar'), text.indexOf('🍎'), text.indexOf('Esta'), text.length]) {
      final top = editable.getLocalRectForCaret(TextPosition(offset: offset)).top;
      expect(top % 26, lessThan(3), reason: 'caret at $offset starts at $top');
    }
    // The long line wraps, so there are more rows than lines.
    final lastTop = editable.getLocalRectForCaret(TextPosition(offset: text.length)).top;
    expect(lastTop ~/ 26, greaterThan(2));
  });

  testWidgets('A larger system text size keeps one pitch for every row', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await goToHome(
      tester,
      notes: [
        Note(
          id: 'r2',
          title: 'Grande',
          time: '',
          body: 'Primeira linha\nSegunda linha bem mais comprida, que quebra na tela',
        ),
      ],
    );
    await tester.tap(find.text('Grande'));
    await tester.pumpAndSettle();

    final editable = tester.allRenderObjects.whereType<RenderEditable>().firstWhere((e) => e.maxLines == null);
    final pitch = editable.preferredLineHeight;
    expect(pitch, closeTo(26 * 1.3, 0.5));
    final text = editable.text!.toPlainText();
    final last = editable.getLocalRectForCaret(TextPosition(offset: text.length)).top;
    expect(last % pitch, lessThan(3));
    expect(last ~/ pitch, greaterThan(1));
  });

  testWidgets('The format sheet inserts a list marker', (tester) async {
    await goToHome(tester);

    await tester.tap(find.text('Bloquinho'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FormatIcon));
    await tester.pumpAndSettle();

    expect(find.text('Lista com marcadores'), findsOneWidget);
    expect(find.text('Inserir data e hora'), findsOneWidget);
    await tester.tap(find.text('Lista com marcadores'));
    await tester.pumpAndSettle();

    expect(find.text('• Conteudo de teste 1'), findsOneWidget);
  });

  test('Character count uses the singular for one', () {
    expect(characterCountLabel(''), '0 caracteres');
    expect(characterCountLabel('a'), '1 caractere');
    expect(characterCountLabel('🍎'), '1 caractere');
    expect(characterCountLabel('a' * 1234), '1.234 caracteres');
  });

  testWidgets('FAB creates a new note titled "Nova nota" opened in editor', (tester) async {
    await goToHome(tester);

    await tester.tap(find.byType(PlusIcon));
    await tester.pumpAndSettle();

    expect(find.text('Nova nota'), findsOneWidget);
    expect(find.text('0 caracteres'), findsOneWidget);

    await tester.tap(find.byType(BackChevronIcon));
    await tester.pumpAndSettle();

    expect(find.text('Nova nota'), findsOneWidget);
  });

  testWidgets('Long-pressing a note asks before deleting it, and the delete can be undone', (tester) async {
    await goToHome(tester);

    await tester.longPress(find.text('Referências'));
    await tester.pumpAndSettle();
    expect(find.text('Excluir nota'), findsOneWidget);

    await tester.tap(find.text('Excluir'));
    await tester.pumpAndSettle();
    expect(find.text('Referências'), findsNothing);
    expect(find.text('2 notas'), findsOneWidget);

    await tester.tap(find.text('Desfazer'));
    await tester.pumpAndSettle();
    expect(find.text('Referências'), findsOneWidget);
    expect(find.text('3 notas'), findsOneWidget);
  });

  testWidgets('Settings toggles dark mode switch', (tester) async {
    await goToHome(tester);

    await tester.tap(find.byType(SettingsIcon));
    await tester.pumpAndSettle();

    expect(find.text('Configurações'), findsOneWidget);
    expect(find.text('Tema escuro'), findsOneWidget);
    expect(find.text('Criar código'), findsOneWidget);
    expect(find.text('Colar código'), findsOneWidget);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
    expect(Theme.of(tester.element(find.text('Tema escuro'))).brightness, Brightness.dark);

    await tester.tap(find.byType(BackChevronIcon));
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsOneWidget);
  });
}
