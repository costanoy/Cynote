import 'dart:async';

import 'package:flutter/material.dart';
import '../icons.dart';
import '../models/note.dart';
import '../note_sort.dart';
import '../theme.dart';
import '../widgets/greenhouse.dart';

/// Line breaks shown as a middle dot, so a preview reads as one flowing line.
String flattenNoteText(String text) => text.trim().replaceAll(RegExp(r'\s*\n+\s*'), ' · ');

/// The herbarium: every note a card pinned to dotted paper.
class HomeScreen extends StatefulWidget {
  final CyColors t;

  /// Already in [sort]'s order.
  final List<Note> notes;
  final NoteSort sort;
  final ValueChanged<NoteSort> onSortChanged;
  final void Function(Note) onOpenNote;
  final VoidCallback onSearch;
  final VoidCallback onSettings;
  final VoidCallback onAddNote;
  final void Function(Note)? onLongPressNote;

  const HomeScreen({
    super.key,
    required this.t,
    required this.notes,
    required this.sort,
    required this.onSortChanged,
    required this.onOpenNote,
    required this.onSearch,
    required this.onSettings,
    required this.onAddNote,
    this.onLongPressNote,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _scroll = ScrollController();
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    // "há 5 min" keeps counting while the list is on screen.
    _clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(HomeScreen old) {
    super.didUpdateWidget(old);
    // A new order starts from its first note.
    if (old.sort != widget.sort && _scroll.hasClients) {
      _scroll.animateTo(0, duration: const Duration(milliseconds: 350), curve: CyMotion.grow);
    }
  }

  @override
  void dispose() {
    _clock?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final notes = widget.notes;
    return GreenhouseScreen(
      t: t,
      header: [
        const SizedBox(width: 6),
        LogoMedallion(t: t),
        const SizedBox(width: 10),
        Expanded(child: Text('Cynote', style: CyType.display(22, t.frameInk, letterSpacing: 2.2))),
        Medallion(t: t, onTap: widget.onSearch, child: SearchIcon(color: t.frameInk)),
        const SizedBox(width: 6),
        Medallion(t: t, onTap: widget.onSettings, child: SettingsIcon(color: t.frameInk)),
      ],
      body: DottedPaper(
        t: t,
        child: Stack(
          children: [
            Positioned.fill(
              child: ListView.separated(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(16, ArchHeader.overhang + 2, 16, 120),
                itemCount: notes.length + 1,
                separatorBuilder: (_, i) => SizedBox(height: i == 0 ? 4 : 12),
                itemBuilder: (context, i) {
                  if (i == 0) {
                    return _ListHeader(t: t, count: notes.length, sort: widget.sort, onSortChanged: widget.onSortChanged);
                  }
                  final note = notes[i - 1];
                  return RiseIn(
                    key: ValueKey(note.id),
                    // Only the first screenful cascades in; the rest just appear.
                    delay: Duration(milliseconds: i <= 10 ? (i - 1) * 45 : 0),
                    child: NoteCard(
                      t: t,
                      note: note,
                      onTap: () => widget.onOpenNote(note),
                      onLongPress: widget.onLongPressNote == null ? null : () => widget.onLongPressNote!(note),
                    ),
                  );
                },
              ),
            ),
            Positioned(right: 22, bottom: 40, child: _AddButton(t: t, onTap: widget.onAddNote)),
          ],
        ),
      ),
    );
  }
}

/// Above the cards: how many notes there are, and the order they're in.
class _ListHeader extends StatelessWidget {
  final CyColors t;
  final int count;
  final NoteSort sort;
  final ValueChanged<NoteSort> onSortChanged;
  const _ListHeader({required this.t, required this.count, required this.sort, required this.onSortChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const SizedBox(width: 4),
        Text(count == 1 ? '1 nota' : '$count notas', style: CyType.ui(12.5, t.inkFaint)),
        const Spacer(),
        _SortChip(t: t, sort: sort, onChanged: onSortChanged),
      ],
    );
  }
}

/// The current order as a chip; tapping it lists the others.
class _SortChip extends StatelessWidget {
  final CyColors t;
  final NoteSort sort;
  final ValueChanged<NoteSort> onChanged;
  const _SortChip({required this.t, required this.sort, required this.onChanged});

  Future<void> _pick(BuildContext context) async {
    final chip = context.findRenderObject() as RenderBox;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final below = Rect.fromPoints(
      chip.localToGlobal(Offset(0, chip.size.height - 4), ancestor: overlay),
      chip.localToGlobal(chip.size.bottomRight(Offset.zero), ancestor: overlay),
    );
    final chosen = await showMenu<NoteSort>(
      context: context,
      position: RelativeRect.fromRect(below, Offset.zero & overlay.size),
      color: t.paper,
      surfaceTintColor: const Color(0x00000000),
      elevation: 10,
      shadowColor: t.shadow,
      // The square corner is the one the menu grows from, like the computer's.
      shape: RoundedRectangleBorder(
        side: BorderSide(color: t.goldLine),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(14),
          topRight: Radius.circular(5),
          bottomLeft: Radius.circular(14),
          bottomRight: Radius.circular(14),
        ),
      ),
      items: [
        PopupMenuItem<NoteSort>(
          enabled: false,
          height: 30,
          child: Text('Ordenar por', style: CyType.ui(12, t.inkFaint)),
        ),
        for (final option in NoteSort.values)
          PopupMenuItem<NoteSort>(
            value: option,
            height: kTouchTarget + 2,
            child: Row(
              children: [
                SizedBox(width: 20, child: option == sort ? CheckIcon(size: 15, color: t.accent) : null),
                const SizedBox(width: 8),
                Text(
                  option.label,
                  style: CyType.ui(
                    14.5,
                    option == sort ? t.ink : t.inkSoft,
                    weight: option == sort ? FontWeight.w500 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
    if (chosen != null && chosen != sort) onChanged(chosen);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Ordenar notas: ${sort.label}',
      excludeSemantics: true,
      child: Pressable(
        onTap: () => _pick(context),
        pressedScale: 0.94,
        builder: (context, pressed) => SizedBox(
          height: kTouchTarget,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              height: 34,
              padding: const EdgeInsets.only(left: 11, right: 10),
              decoration: BoxDecoration(
                color: pressed ? t.goldSoft : t.paper,
                border: Border.all(color: t.goldLine),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SortIcon(size: 14, color: t.gold),
                  const SizedBox(width: 7),
                  Text(sort.label, style: CyType.ui(13, t.ink)),
                  const SizedBox(width: 5),
                  ChevronDownIcon(size: 11, color: t.inkSoft),
                ],
              ),
            ),
          ),
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
  final VoidCallback? onLongPress;
  final EdgeInsets padding;
  final bool innerRule;
  final Widget child;

  const NoteCardFrame({
    super.key,
    required this.t,
    required this.onTap,
    required this.child,
    this.onLongPress,
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
      onLongPress: onLongPress,
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
  final VoidCallback? onLongPress;
  const NoteCard({super.key, required this.t, required this.note, required this.onTap, this.onLongPress});

  @override
  Widget build(BuildContext context) {
    final preview = flattenNoteText(note.body);
    return NoteCardFrame(
      t: t,
      onTap: onTap,
      onLongPress: onLongPress,
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
                editedLabel(note.updatedAt, DateTime.now()),
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
