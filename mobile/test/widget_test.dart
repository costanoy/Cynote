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

  Future<void> goToHome(WidgetTester tester) async {
    await tester.pumpWidget(CynoteApp(initialNotes: testNotes()));
    await tester.tap(find.text('Continuar sem sincronizar'));
    await tester.pumpAndSettle();
  }

  testWidgets('Sync screen shows sync prompt and can be skipped to home', (tester) async {
    await tester.pumpWidget(CynoteApp(initialNotes: testNotes()));

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

    expect(find.text('Roteiro: Vídeo IA'), findsOneWidget);
    expect(find.text('Bloquinho'), findsNothing);

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
