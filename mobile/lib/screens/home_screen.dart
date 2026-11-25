import 'dart:async';

import 'package:flutter/material.dart';
import '../icons.dart';
import '../models/note.dart';
import '../note_sort.dart';
import '../theme.dart';

/// One-line preview: the note's lines joined by a middle dot, without the
/// list markers (- • [ ] [x] 1.) that would otherwise lead every segment.
String flattenNoteText(String text) => text
    .split('\n')
    .map((l) => l.trim().replaceFirst(_listMarker, '').trim())
    .where((l) => l.isNotEmpty)
    .join(' · ');

final _listMarker = RegExp(r'^(?:[-*•]|\[[ xX]\]|\d+[.)])\s+');

/// The list of notes: plain rows on the page, one rule between them.
class HomeScreen extends StatefulWidget {
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
      if (MediaQuery.disableAnimationsOf(context)) {
        _scroll.jumpTo(0);
      } else {
        _scroll.animateTo(0, duration: Durations.medium2, curve: Easing.standard);
      }
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
    final notes = widget.notes;
    final now = DateTime.now();
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cynote'),
        actions: [
          IconButton(tooltip: 'Buscar', onPressed: widget.onSearch, icon: const SearchIcon()),
          IconButton(tooltip: 'Configurações', onPressed: widget.onSettings, icon: const SettingsIcon()),
          const SizedBox(width: 4),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Escrever uma nota',
        onPressed: widget.onAddNote,
        child: const PlusIcon(),
      ),
      body: notes.isEmpty
          ? const _EmptyList()
          : ListView.builder(
              controller: _scroll,
              // Room for the button over the last row.
              padding: EdgeInsets.only(bottom: 96 + bottomInset),
              itemCount: notes.length + 1,
              itemBuilder: (context, i) {
                if (i == 0) {
                  return _ListHeader(count: notes.length, sort: widget.sort, onSortChanged: widget.onSortChanged);
                }
                final note = notes[i - 1];
                final preview = flattenNoteText(note.body);
                return NoteRow(
                  key: ValueKey(note.id),
                  title: NoteRow.titleText(context, note.title),
                  preview: NoteRow.previewText(context, preview.isEmpty ? null : preview),
                  time: editedLabel(note.updatedAt, now),
                  onTap: () => widget.onOpenNote(note),
                  onLongPress: widget.onLongPressNote == null ? null : () => widget.onLongPressNote!(note),
                );
              },
            ),
    );
  }
}

/// No notes yet: say so, and say how to start.
class _EmptyList extends StatelessWidget {
  const _EmptyList();

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    return Align(
      alignment: const Alignment(0, -0.35),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Nenhuma nota ainda', style: text.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 4),
            Text(
              'Toque em + para escrever a primeira.',
              style: text.bodyMedium!.copyWith(color: c.inkSoft),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Above the rows: how many notes there are, and the order they are in.
class _ListHeader extends StatelessWidget {
  final int count;
  final NoteSort sort;
  final ValueChanged<NoteSort> onSortChanged;
  const _ListHeader({required this.count, required this.sort, required this.onSortChanged});

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Row(
        children: [
          Expanded(
            child: Text(
              count == 1 ? '1 nota' : '$count notas',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: tabular(text.labelMedium!.copyWith(color: c.inkSoft)),
            ),
          ),
          const SizedBox(width: 8),
          // Large system text sizes shorten the label rather than overflow.
          Flexible(
            flex: 3,
            child: Align(
              alignment: AlignmentDirectional.centerEnd,
              child: _SortChip(sort: sort, onChanged: onSortChanged),
            ),
          ),
        ],
      ),
    );
  }
}

/// The current order as a chip; tapping it lists the others.
class _SortChip extends StatelessWidget {
  final NoteSort sort;
  final ValueChanged<NoteSort> onChanged;
  const _SortChip({required this.sort, required this.onChanged});

  Future<void> _pick(BuildContext context) async {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    final chip = context.findRenderObject() as RenderBox;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final below = Rect.fromPoints(
      chip.localToGlobal(Offset(0, chip.size.height - 8), ancestor: overlay),
      chip.localToGlobal(chip.size.bottomRight(Offset.zero), ancestor: overlay),
    );
    final chosen = await showMenu<NoteSort>(
      context: context,
      position: RelativeRect.fromRect(below, Offset.zero & overlay.size),
      items: [
        PopupMenuItem<NoteSort>(
          enabled: false,
          height: 32,
          child: Text('Ordenar por', style: text.labelMedium!.copyWith(color: c.inkSoft)),
        ),
        for (final option in NoteSort.values)
          PopupMenuItem<NoteSort>(
            value: option,
            child: Row(
              children: [
                SizedBox(width: 32, child: option == sort ? CheckIcon(size: 20, color: c.ink) : null),
                Flexible(
                  child: Text(option.label, style: text.bodyLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
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
    final c = CyColors.of(context);
    return Semantics(
      button: true,
      label: 'Ordenar notas: ${sort.label}',
      excludeSemantics: true,
      child: ActionChip(
        onPressed: () => _pick(context),
        avatar: const SortIcon(),
        label: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(child: Text(sort.label, maxLines: 1, overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 2),
            ChevronDownIcon(size: 18, color: c.inkSoft),
          ],
        ),
      ),
    );
  }
}

/// One note in a list: title and time on the first line, a one-line preview
/// under it, a rule below. Shared by the list and the search results.
class NoteRow extends StatelessWidget {
  final Widget title;
  final Widget preview;
  final String time;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const NoteRow({
    super.key,
    required this.title,
    required this.preview,
    required this.time,
    required this.onTap,
    this.onLongPress,
  });

  static TextStyle titleStyle(BuildContext context) => Theme.of(context).textTheme.titleMedium!;

  static TextStyle previewStyle(BuildContext context) =>
      Theme.of(context).textTheme.bodySmall!.copyWith(color: CyColors.of(context).inkSoft);

  static Widget titleText(BuildContext context, String title) {
    final empty = title.trim().isEmpty;
    return Text(
      empty ? 'Sem título' : title,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: empty ? titleStyle(context).copyWith(color: CyColors.of(context).inkSoft) : titleStyle(context),
    );
  }

  static Widget previewText(BuildContext context, String? preview) =>
      Text(preview ?? 'Nota vazia', maxLines: 1, overflow: TextOverflow.ellipsis, style: previewStyle(context));

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 72),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Expanded(child: title),
                      const SizedBox(width: 12),
                      Text(time, style: text.labelSmall!.copyWith(color: c.inkSoft)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  preview,
                ],
              ),
            ),
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }
}
