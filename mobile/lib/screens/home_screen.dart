import 'package:flutter/material.dart';
import '../icons.dart';
import '../models/note.dart';
import '../theme.dart';
import '../widgets/greenhouse.dart';

/// Line breaks shown as a middle dot, so a preview reads as one flowing line.
String flattenNoteText(String text) => text.trim().replaceAll(RegExp(r'\s*\n+\s*'), ' · ');

/// The herbarium: every note a card pinned to dotted paper.
class HomeScreen extends StatelessWidget {
  final CyColors t;
  final List<Note> notes;
  final void Function(Note) onOpenNote;
  final VoidCallback onSearch;
  final VoidCallback onSettings;
  final VoidCallback onAddNote;

  const HomeScreen({
    super.key,
    required this.t,
    required this.notes,
    required this.onOpenNote,
    required this.onSearch,
    required this.onSettings,
    required this.onAddNote,
  });

  @override
  Widget build(BuildContext context) {
    return GreenhouseScreen(
      t: t,
      header: [
        const SizedBox(width: 6),
        LogoMedallion(t: t),
        const SizedBox(width: 10),
        Expanded(child: Text('Cynote', style: CyType.display(22, t.frameInk, letterSpacing: 2.2))),
        Medallion(t: t, onTap: onSearch, child: SearchIcon(color: t.frameInk)),
        const SizedBox(width: 6),
        Medallion(t: t, onTap: onSettings, child: SettingsIcon(color: t.frameInk)),
      ],
      body: DottedPaper(
        t: t,
        child: Stack(
          children: [
            Positioned.fill(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, ArchHeader.overhang + 8, 16, 120),
                itemCount: notes.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, i) => RiseIn(
                  key: ValueKey(notes[i].id),
                  // Only the first screenful cascades in; the rest just appear.
                  delay: Duration(milliseconds: i < 10 ? i * 45 : 0),
                  child: NoteCard(t: t, note: notes[i], onTap: () => onOpenNote(notes[i])),
                ),
              ),
            ),
            Positioned(right: 22, bottom: 40, child: _AddButton(t: t, onTap: onAddNote)),
          ],
        ),
      ),
    );
  }
}

/// The "+" medallion: iron with a double gold ring; turns a quarter while pressed.
class _AddButton extends StatelessWidget {
  final CyColors t;
  final VoidCallback onTap;
  const _AddButton({required this.t, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      pressedScale: 0.88,
      builder: (context, pressed) => AnimatedRotation(
        turns: pressed ? 0.25 : 0,
        duration: const Duration(milliseconds: 220),
        curve: CyMotion.grow,
        child: Container(
          width: 66,
          height: 66,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: t.frame,
            shape: BoxShape.circle,
            border: Border.all(color: t.gold),
            boxShadow: [
              BoxShadow(color: t.shadow, blurRadius: 20, offset: const Offset(0, 8)),
              BoxShadow(color: t.glow, blurRadius: 18),
            ],
          ),
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: t.goldLine)),
            child: PlusIcon(color: t.gold),
          ),
        ),
      ),
    );
  }
}

/// A card with two rounded corners and a fine gold inner rule.
class NoteCardFrame extends StatelessWidget {
  final CyColors t;
  final VoidCallback onTap;
  final EdgeInsets padding;
  final bool innerRule;
  final Widget child;

  const NoteCardFrame({
    super.key,
    required this.t,
    required this.onTap,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(20, 16, 18, 16),
    this.innerRule = true,
  });

  static const _radius = BorderRadius.only(
    topLeft: Radius.circular(6),
    topRight: Radius.circular(18),
    bottomRight: Radius.circular(6),
    bottomLeft: Radius.circular(18),
  );
  static const _innerRadius = BorderRadius.only(
    topLeft: Radius.circular(3),
    topRight: Radius.circular(15),
    bottomRight: Radius.circular(3),
    bottomLeft: Radius.circular(15),
  );

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      pressedScale: 0.98,
      builder: (context, pressed) => AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: t.paper,
          border: Border.all(color: pressed ? t.goldLine : t.rule),
          borderRadius: _radius,
          boxShadow: [BoxShadow(color: t.rule, offset: const Offset(0, 1))],
        ),
        child: Stack(
          children: [
            if (innerRule)
              Positioned.fill(
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: DecoratedBox(
                    decoration: BoxDecoration(border: Border.all(color: t.goldSoft), borderRadius: _innerRadius),
                  ),
                ),
              ),
            Padding(padding: padding, child: child),
          ],
        ),
      ),
    );
  }
}

class NoteCard extends StatelessWidget {
  final CyColors t;
  final Note note;
  final VoidCallback onTap;
  const NoteCard({super.key, required this.t, required this.note, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final preview = flattenNoteText(note.body);
    return NoteCardFrame(
      t: t,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // A bead of stained glass, in this note's color.
              Container(
                width: 11,
                height: 11,
                decoration: BoxDecoration(
                  color: t.glassFor(note.id),
                  shape: BoxShape.circle,
                  border: Border.all(color: t.lead, width: 1.2),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  note.title.isEmpty ? 'Sem título' : note.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: CyType.display(17, t.ink, letterSpacing: 0.17),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                note.time,
                style: CyType.ui(12, t.inkFaint).copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 21),
            child: Text(
              preview.isEmpty ? 'Nota vazia' : preview,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: CyType.body(13.5, t.inkSoft, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}
