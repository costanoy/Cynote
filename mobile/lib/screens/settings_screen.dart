import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../icons.dart';
import '../theme.dart';
import '../widgets/switch_toggle.dart';

class SettingsScreen extends StatelessWidget {
  final CyColors t;
  final bool darkMode;
  final VoidCallback onBack;
  final VoidCallback onToggleDarkMode;

  const SettingsScreen({
    super.key,
    required this.t,
    required this.darkMode,
    required this.onBack,
    required this.onToggleDarkMode,
  });

  @override
  Widget build(BuildContext context) {
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
                  onTap: onBack,
                  child: SizedBox(width: 30, height: 30, child: Center(child: BackChevronIcon(color: t.mutedText))),
                ),
                const SizedBox(width: 6),
                Text(
                  'Configurações',
                  style: GoogleFonts.bricolageGrotesque(fontWeight: FontWeight.w700, fontSize: 15.5, color: t.text),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(28),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.border))),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Tema escuro',
                          style: GoogleFonts.manrope(fontWeight: FontWeight.w600, fontSize: 13.5, color: t.text),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Ativa a interface escura do bloquinho',
                          style: GoogleFonts.manrope(fontSize: 11.5, color: t.mutedText),
                        ),
                      ],
                    ),
                  ),
                  SwitchToggle(on: darkMode, onTap: onToggleDarkMode, t: t),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
