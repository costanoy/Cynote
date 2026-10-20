import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/main.dart';
import 'package:mobile/icons.dart';
import 'package:mobile/models/note.dart';

void main() {
  List<Note> testNotes() => [
        Note(id: 't1', title: 'Bloquinho', time: 'Hoje, 14:32', body: 'Conteudo de teste 1'),
        Note(id: 't2', title: 'Referências', time: 'Ontem, 21:10', body: 'Conteudo de teste 2'),
        Note(id: 't3', title: 'Roteiro: Vídeo IA', time: 'Seg, 09:15', body: 'Conteudo de teste 3'),
      ];

  // The interface has ambient animations that never end (breathing lamp,
  // swaying sprout); with reduced motion on they hold still, so
  // pumpAndSettle can settle.
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
    await tester.tap(find.text('Continuar sem sincronizar'));
    await tester.pumpAndSettle();
  }

  /// Titles from top to bottom, as they are on screen.
  List<String> onScreenOrder(WidgetTester tester, List<String> titles) =>
      [...titles]..sort((a, b) => tester.getTopLeft(find.text(a)).dy.compareTo(tester.getTopLeft(find.text(b)).dy));

  testWidgets('Notes list the last edited first, and can be sorted by title or oldest', (tester) async {
    final now = DateTime.now();
    Note edited(String id, String title, Duration ago) =>
        Note(id: id, title: title, time: 'Agora', body: 'texto', updatedAt: now.subtract(ago).millisecondsSinceEpoch);
    await goToHome(tester, notes: [
      edited('n1', 'Zebra', const Duration(hours: 30)),
      edited('n2', 'Abacate', const Duration(minutes: 5)),
      edited('n3', 'Âmbar', const Duration(days: 40)),
    ]);
    const titles = ['Zebra', 'Abacate', 'Âmbar'];

    expect(find.text('3 notas'), findsOneWidget);
    expect(find.text('Mais recentes'), findsOneWidget);
    expect(onScreenOrder(tester, titles), ['Abacate', 'Zebra', 'Âmbar']);
    // The card shows when the note was edited, not the time it was created.
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

  testWidgets('Sync screen shows sync prompt and can be skipped to home', (tester) async {
    await pumpApp(tester);

    expect(find.text('Sincronize com seu computador'), findsOneWidget);
    expect(find.text('Cynote'), findsNothing);

    await tester.tap(find.text('Continuar sem sincronizar'));
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsOneWidget);
    expect(find.text('Bloquinho'), findsOneWidget);
    expect(find.text('Referências'), findsOneWidget);
    expect(find.text('Roteiro: Vídeo IA'), findsOneWidget);
  });

  testWidgets('Search filters notes and shows empty state', (tester) async {
    await goToHome(tester);

    await tester.tap(find.byType(SearchIcon));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'Roteiro');
    await tester.pumpAndSettle();

    // Search results highlight the match, so the title is rich text.
    expect(find.text('Roteiro: Vídeo IA', findRichText: true), findsOneWidget);
    expect(find.text('Bloquinho', findRichText: true), findsNothing);

    await tester.enterText(find.byType(TextField), 'xyz-not-found');
    await tester.pumpAndSettle();

    expect(find.text('Nenhuma nota encontrada'), findsOneWidget);

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

    await tester.tap(find.byType(BackChevronIcon));
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsOneWidget);
  });

  testWidgets('FAB creates a new note titled "Nova nota" opened in editor', (tester) async {
    await goToHome(tester);

    await tester.tap(find.byType(PlusIcon));
    await tester.pumpAndSettle();

    expect(find.text('Nova nota'), findsOneWidget);

    await tester.tap(find.byType(BackChevronIcon));
    await tester.pumpAndSettle();

    expect(find.text('Nova nota'), findsOneWidget);
  });

  testWidgets('Settings toggles dark mode switch', (tester) async {
    await goToHome(tester);

    await tester.tap(find.byType(SettingsIcon));
    await tester.pumpAndSettle();

    expect(find.text('Configurações'), findsOneWidget);
    expect(find.text('Tema escuro'), findsOneWidget);

    await tester.tap(find.byType(GestureDetector).last);
    await tester.pumpAndSettle();

    await tester.tap(find.byType(BackChevronIcon));
    await tester.pumpAndSettle();

    expect(find.text('Cynote'), findsOneWidget);
  });
}
