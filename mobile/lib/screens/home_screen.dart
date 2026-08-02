import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../icons.dart';
import '../models/note.dart';
import '../theme.dart';

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
    return Container(
      color: t.bg,
      child: Stack(
        children: [
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 40, 18, 20),
                child: Row(
                  children: [
                    const LogoIcon(size: 20),
                    const SizedBox(width: 10),
                    Text(
                      'Cynote',
                      style: GoogleFonts.bricolageGrotesque(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: t.text,
                      ),
                    ),
                    const Spacer(),
                    _TopIconBtn(t: t, onTap: onSearch, child: SearchIcon(color: t.mutedText)),
                    const SizedBox(width: 8),
                    _TopIconBtn(t: t, onTap: onSettings, child: SettingsIcon(color: t.mutedText)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 10, 18, 110),
                  children: [
                    for (final note in notes) NoteCard(t: t, note: note, onTap: () => onOpenNote(note)),
                  ],
                ),
              ),
            ],
          ),
          Positioned(
            right: 20,
            bottom: 40,
            child: GestureDetector(
              onTap: onAddNote,
              child: Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFFFAB5C), Color(0xFFFF8C3A)],
                  ),
                  boxShadow: [BoxShadow(color: Color(0x61FF8C3A), blurRadius: 26, offset: Offset(0, 12))],
                ),
                alignment: Alignment.center,
                child: const PlusIcon(size: 26),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopIconBtn extends StatelessWidget {
  final CyColors t;
  final VoidCallback onTap;
  final Widget child;
  const _TopIconBtn({required this.t, required this.onTap, required this.child});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: t.cardBg,
          border: Border.all(color: t.cardBorder),
          borderRadius: BorderRadius.circular(10),
        ),
        child: child,
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: t.cardBg,
          border: Border.all(color: t.cardBorder),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                note.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.bricolageGrotesque(
                  fontWeight: FontWeight.w700,
                  fontSize: 14.5,
                  color: t.text,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              note.time,
              style: GoogleFonts.manrope(fontSize: 11, color: t.subtleText),
            ),
          ],
        ),
      ),
    );
  }
}
