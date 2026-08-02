import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../icons.dart';
import '../models/note.dart';
import '../theme.dart';

class EditorScreen extends StatefulWidget {
  final CyColors t;
  final Note note;
  final VoidCallback onBack;
  final void Function(String title) onTitleChanged;
  final void Function(String body) onBodyChanged;

  const EditorScreen({
    super.key,
    required this.t,
    required this.note,
    required this.onBack,
    required this.onTitleChanged,
    required this.onBodyChanged,
  });

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends State<EditorScreen> {
  late final TextEditingController _titleController = TextEditingController(text: widget.note.title);
  late final TextEditingController _bodyController = TextEditingController(text: widget.note.body);
  bool _formatMenuOpen = false;

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  static const Map<SyncState, Color> _colors = {
    SyncState.synced: Color(0xFF2FAE5A),
    SyncState.syncing: Color(0xFFFF8C3A),
    SyncState.error: Color(0xFFE0432C),
  };

  static String _syncLabel(SyncState s) => switch (s) {
        SyncState.synced => 'Sincronizado',
        SyncState.syncing => 'Sincronizando…',
        SyncState.error => 'Erro de sincronização',
      };

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    return Container(
      color: t.bg,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(18, 40, 18, 20),
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.border))),
            child: Row(
              children: [
                GestureDetector(
                  onTap: widget.onBack,
                  child: SizedBox(width: 30, height: 30, child: Center(child: BackChevronIcon(color: t.mutedText))),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: TextField(
                    controller: _titleController,
                    onChanged: widget.onTitleChanged,
                    style: GoogleFonts.bricolageGrotesque(fontWeight: FontWeight.w700, fontSize: 15.5, color: t.text),
                    decoration: const InputDecoration(isDense: true, border: InputBorder.none),
                  ),
                ),
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    GestureDetector(
                      onTap: () => setState(() => _formatMenuOpen = !_formatMenuOpen),
                      child: SizedBox(width: 30, height: 30, child: Center(child: FormatIcon(color: t.mutedText))),
                    ),
                    if (_formatMenuOpen)
                      Positioned(
                        top: 34,
                        right: 0,
                        child: _FormatMenu(t: t, onItemTap: () => setState(() => _formatMenuOpen = false)),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
              child: TextField(
                controller: _bodyController,
                onChanged: widget.onBodyChanged,
                maxLines: null,
                expands: true,
                textAlignVertical: TextAlignVertical.top,
                style: GoogleFonts.manrope(fontSize: 14.5, height: 1.65, color: t.text),
                decoration: const InputDecoration(isDense: true, border: InputBorder.none),
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 28),
            decoration: BoxDecoration(border: Border(top: BorderSide(color: t.border))),
            child: Row(
              children: [
                ValueListenableBuilder(
                  valueListenable: _bodyController,
                  builder: (context, value, _) => Text(
                    '${value.text.length} caracteres',
                    style: GoogleFonts.manrope(fontSize: 11, color: t.mutedText),
                  ),
                ),
                const Spacer(),
                Tooltip(
                  message: _syncLabel(widget.note.sync),
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: _colors[widget.note.sync]),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FormatMenu extends StatelessWidget {
  final CyColors t;
  final VoidCallback onItemTap;
  const _FormatMenu({required this.t, required this.onItemTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 170,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: t.menuBg,
        border: Border.all(color: t.border),
        borderRadius: BorderRadius.circular(10),
        boxShadow: t.shadow,
      ),
      child: Column(
        children: [
          _FormatItem(t: t, label: 'Negrito', mark: 'B', bold: true, shortcut: 'Ctrl+B', onTap: onItemTap),
          _FormatItem(t: t, label: 'Itálico', mark: 'i', bold: false, shortcut: 'Ctrl+I', onTap: onItemTap),
        ],
      ),
    );
  }
}

class _FormatItem extends StatelessWidget {
  final CyColors t;
  final String label;
  final String mark;
  final bool bold;
  final String shortcut;
  final VoidCallback onTap;
  const _FormatItem({
    required this.t,
    required this.label,
    required this.mark,
    required this.bold,
    required this.shortcut,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Row(
          children: [
            Text(
              mark,
              style: GoogleFonts.manrope(
                fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
                fontStyle: bold ? FontStyle.normal : FontStyle.italic,
                fontSize: 13,
                color: t.text,
              ),
            ),
            const SizedBox(width: 8),
            Text(label, style: GoogleFonts.manrope(fontSize: 13, color: t.text)),
            const Spacer(),
            Text(shortcut, style: GoogleFonts.manrope(fontSize: 10.5, color: t.subtleText)),
          ],
        ),
      ),
    );
  }
}
