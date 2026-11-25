import 'package:flutter/material.dart';
import '../icons.dart';
import '../models/note.dart';
import '../note_sort.dart';
import '../theme.dart';
import 'home_screen.dart' show NoteRow, flattenNoteText;

// How much of the note is shown around the search term.
const _snippetBefore = 24;
const _snippetAfter = 60;
const _snippetPlain = 90;

class SearchScreen extends StatefulWidget {
  final List<Note> notes;
  final void Function(Note) onOpenNote;
  final VoidCallback onBack;

  /// What the field starts with (the web preview uses it).
  final String initialQuery;

  const SearchScreen({
    super.key,
    required this.notes,
    required this.onOpenNote,
    required this.onBack,
    this.initialQuery = '',
  });

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  late final _controller = TextEditingController(text: widget.initialQuery);
  late String _query = widget.initialQuery;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _clear() {
    _controller.clear();
    setState(() => _query = '');
  }

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final text = Theme.of(context).textTheme;
    final query = _query.trim();
    final lower = query.toLowerCase();
    final filtered = widget.notes
        .where((n) => lower.isEmpty || n.title.toLowerCase().contains(lower) || n.body.toLowerCase().contains(lower))
        .toList();
    final now = DateTime.now();

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(tooltip: 'Voltar', onPressed: widget.onBack, icon: const BackChevronIcon()),
        titleSpacing: 0,
        title: TextField(
          controller: _controller,
          autofocus: true,
          onChanged: (v) => setState(() => _query = v),
          textInputAction: TextInputAction.search,
          style: text.bodyLarge,
          decoration: InputDecoration(
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            hintText: 'Buscar nas notas',
            hintStyle: text.bodyLarge!.copyWith(color: c.inkSoft),
          ),
        ),
        actions: [
          if (_query.isNotEmpty) IconButton(tooltip: 'Limpar', onPressed: _clear, icon: const ClearIcon()),
          const SizedBox(width: 4),
        ],
      ),
      body: filtered.isEmpty
          ? Align(
              alignment: const Alignment(0, -0.35),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Nenhuma nota encontrada', style: text.titleMedium, textAlign: TextAlign.center),
                    const SizedBox(height: 4),
                    Text(
                      'Tente outra palavra.',
                      style: text.bodyMedium!.copyWith(color: c.inkSoft),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          : ListView.builder(
              padding: EdgeInsets.only(top: 4, bottom: 24 + MediaQuery.paddingOf(context).bottom),
              itemCount: filtered.length,
              itemBuilder: (context, i) {
                final note = filtered[i];
                return _ResultRow(
                  note: note,
                  query: query,
                  time: editedLabel(note.updatedAt, now),
                  onTap: () => widget.onOpenNote(note),
                );
              },
            ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  final Note note;
  final String query;
  final String time;
  final VoidCallback onTap;
  const _ResultRow({required this.note, required this.query, required this.time, required this.onTap});

  /// [text] with the first occurrence of the query marked.
  List<InlineSpan> _highlight(String text, Color mark, Color ink) {
    final at = query.isEmpty ? -1 : text.toLowerCase().indexOf(query.toLowerCase());
    if (at < 0) return [TextSpan(text: text)];
    return [
      TextSpan(text: text.substring(0, at)),
      TextSpan(
        text: text.substring(at, at + query.length),
        style: TextStyle(backgroundColor: mark, color: ink),
      ),
      TextSpan(text: text.substring(at + query.length)),
    ];
  }

  /// A window of the note's text around the search term (or its opening
  /// words, when the term is only in the title).
  String _snippet() {
    final flat = flattenNoteText(note.body);
    final at = query.isEmpty ? -1 : flat.toLowerCase().indexOf(query.toLowerCase());
    if (at < 0) {
      return flat.length > _snippetPlain ? '${flat.substring(0, _snippetPlain)}…' : flat;
    }
    final start = at > _snippetBefore ? at - _snippetBefore : 0;
    final end = at + query.length + _snippetAfter;
    return '${start > 0 ? '…' : ''}${flat.substring(start, end < flat.length ? end : flat.length)}'
        '${end < flat.length ? '…' : ''}';
  }

  @override
  Widget build(BuildContext context) {
    final c = CyColors.of(context);
    final snippet = _snippet();
    final title = note.title.trim().isEmpty ? 'Sem título' : note.title;
    return NoteRow(
      title: Text.rich(
        TextSpan(children: _highlight(title, c.amber.withValues(alpha: 0.3), c.ink)),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: NoteRow.titleStyle(context),
      ),
      preview: snippet.isEmpty
          ? NoteRow.previewText(context, null)
          : Text.rich(
              TextSpan(children: _highlight(snippet, c.amber.withValues(alpha: 0.3), c.ink)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: NoteRow.previewStyle(context),
            ),
      time: time,
      onTap: onTap,
    );
  }
}
