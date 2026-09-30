import 'package:flutter/material.dart';
import '../icons.dart';
import '../models/note.dart';
import '../theme.dart';
import '../widgets/greenhouse.dart';
import 'home_screen.dart' show NoteCardFrame, flattenNoteText;

// How much of the note is shown around the search term.
const _snippetBefore = 30;
const _snippetAfter = 60;
const _snippetPlain = 90;

class SearchScreen extends StatefulWidget {
  final CyColors t;
  final List<Note> notes;
  final void Function(Note) onOpenNote;
  final VoidCallback onBack;

  const SearchScreen({
    super.key,
    required this.t,
    required this.notes,
    required this.onOpenNote,
    required this.onBack,
  });

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _focusNode.requestFocus());
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _clear() {
    _controller.clear();
    setState(() => _query = '');
    _focusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final query = _query.trim();
    final lower = query.toLowerCase();
    final filtered = widget.notes
        .where((n) => lower.isEmpty || n.title.toLowerCase().contains(lower) || n.body.toLowerCase().contains(lower))
        .toList();
    final focused = _focusNode.hasFocus;

    return GreenhouseScreen(
      t: t,
      header: [
        Medallion(t: t, onTap: widget.onBack, child: BackChevronIcon(color: t.frameInk)),
        const SizedBox(width: 6),
        Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            height: kTouchTarget,
            padding: const EdgeInsets.only(left: 14, right: 6),
            decoration: BoxDecoration(
              color: t.field,
              border: Border.all(color: focused ? t.gold : t.fieldBorder),
              borderRadius: BorderRadius.circular(999),
              boxShadow: focused ? [BoxShadow(color: t.goldSoft, spreadRadius: 3)] : null,
            ),
            child: Row(
              children: [
                SearchIcon(size: 16, color: t.inkFaint),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    onChanged: (v) => setState(() => _query = v),
                    cursorColor: t.accent,
                    style: CyType.ui(15, t.fieldInk),
                    decoration: InputDecoration(
                      isDense: true,
                      border: InputBorder.none,
                      hintText: 'Buscar nas notas',
                      hintStyle: CyType.ui(15, t.inkFaint),
                    ),
                  ),
                ),
                if (_query.isNotEmpty)
                  Pressable(
                    onTap: _clear,
                    pressedScale: 0.88,
                    builder: (context, pressed) => Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: pressed ? t.paper2 : null),
                      child: ClearIcon(color: t.inkSoft),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 2),
      ],
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 500),
        color: t.paper2,
        child: filtered.isEmpty
            ? SingleChildScrollView(
                padding: const EdgeInsets.only(top: ArchHeader.overhang),
                child: Center(
                  child: EmptyState(t: t, title: 'Nenhuma nota encontrada', hint: 'Tente outra palavra.'),
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, ArchHeader.overhang + 8, 16, 60),
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) => _ResultCard(
                  t: t,
                  note: filtered[i],
                  query: query,
                  onTap: () => widget.onOpenNote(filtered[i]),
                ),
              ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  final CyColors t;
  final Note note;
  final String query;
  final VoidCallback onTap;
  const _ResultCard({required this.t, required this.note, required this.query, required this.onTap});

  /// [text] with the first occurrence of the query highlighted.
  List<InlineSpan> _highlight(String text, Color background, Color? foreground) {
    final at = query.isEmpty ? -1 : text.toLowerCase().indexOf(query.toLowerCase());
    if (at < 0) return [TextSpan(text: text)];
    return [
      TextSpan(text: text.substring(0, at)),
      TextSpan(
        text: text.substring(at, at + query.length),
        style: TextStyle(backgroundColor: background, color: foreground),
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
    final snippet = _snippet();
    return NoteCardFrame(
      t: t,
      onTap: onTap,
      innerRule: false,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: _highlight(note.title.isEmpty ? 'Sem título' : note.title, t.matchCur, const Color(0xFF1B261F)),
                  ),
                  style: CyType.display(16.5, t.ink),
                ),
              ),
              const SizedBox(width: 10),
              Text(note.time, style: CyType.ui(12, t.inkFaint)),
            ],
          ),
          if (snippet.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text.rich(
              TextSpan(children: _highlight(snippet, t.match, t.ink)),
              style: CyType.body(13.5, t.inkSoft, height: 1.5),
            ),
          ],
        ],
      ),
    );
  }
}
