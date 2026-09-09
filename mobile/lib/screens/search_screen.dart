import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../icons.dart';
import '../models/note.dart';
import '../theme.dart';
import 'home_screen.dart' show NoteCard;

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _focusNode.requestFocus());
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final query = _query.trim().toLowerCase();
    final filtered = widget.notes
        .where((n) => query.isEmpty || n.title.toLowerCase().contains(query) || n.body.toLowerCase().contains(query))
        .toList();

    return Container(
      color: t.bg,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 40, 18, 20),
            child: Row(
              children: [
                GestureDetector(
                  onTap: widget.onBack,
                  child: SizedBox(
                    width: 30 * kScale,
                    height: 30 * kScale,
                    child: Center(child: BackChevronIcon(size: 17 * kScale, color: t.mutedText)),
                  ),
                ),
                const SizedBox(width: 6 * kScale),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14 * kScale, vertical: 9 * kScale),
                    decoration: BoxDecoration(
                      color: t.cardBg,
                      border: Border.all(color: t.cardBorder),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: TextField(
                      controller: _controller,
                      focusNode: _focusNode,
                      onChanged: (v) => setState(() => _query = v),
                      style: GoogleFonts.manrope(fontSize: 13.5 * kScale, color: t.text),
                      decoration: InputDecoration(
                        isDense: true,
                        border: InputBorder.none,
                        hintText: 'Buscar notas',
                        hintStyle: GoogleFonts.manrope(fontSize: 13.5 * kScale, color: t.subtleText),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: filtered.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
                    child: Text(
                      'Nenhuma nota encontrada',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(fontSize: 13 * kScale, color: t.subtleText),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(18, 10, 18, 110),
                    children: [
                      for (final note in filtered) NoteCard(t: t, note: note, onTap: () => widget.onOpenNote(note)),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
