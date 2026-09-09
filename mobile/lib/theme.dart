import 'package:flutter/widgets.dart';

/// Global upsize applied to fonts, icons and spacing across the app - the
/// '+' add-note button is deliberately left out of this (kept at its
/// original size) since it's already the most prominent element on screen.
const double kScale = 1.15;

class CyColors {
  final Color bg;
  final Color border;
  final Color text;
  final Color mutedText;
  final Color subtleText;
  final Color cardBg;
  final Color cardBorder;
  final Color accent;
  final Color accentDark;
  final Color accentTint;
  final Color accentBorder;
  final Color menuBg;
  final List<BoxShadow> shadow;

  const CyColors({
    required this.bg,
    required this.border,
    required this.text,
    required this.mutedText,
    required this.subtleText,
    required this.cardBg,
    required this.cardBorder,
    required this.accent,
    required this.accentDark,
    required this.accentTint,
    required this.accentBorder,
    required this.menuBg,
    required this.shadow,
  });

  static const dark = CyColors(
    bg: Color(0xFF1E1B22),
    border: Color(0xFF332E3A),
    text: Color(0xFFF5EEE6),
    mutedText: Color(0x8CF5EEE6), // rgba(245,238,230,.55)
    subtleText: Color(0x59F5EEE6), // rgba(245,238,230,.35)
    cardBg: Color(0x0AFFFFFF), // rgba(255,255,255,.04)
    cardBorder: Color(0xFF332E3A),
    accent: Color(0xFFFF8C3A),
    accentDark: Color(0xFFFFB066),
    accentTint: Color(0x2EFF8C3A), // rgba(255,140,58,.18)
    accentBorder: Color(0x66FF8C3A), // rgba(255,140,58,.4)
    menuBg: Color(0xFF262230),
    shadow: [BoxShadow(color: Color(0x66000000), blurRadius: 60, offset: Offset(0, 30))],
  );

  static const light = CyColors(
    bg: Color(0xFFFFFAF5),
    border: Color(0xFFECDFD0),
    text: Color(0xFF2A1A10),
    mutedText: Color(0x8C281C14), // rgba(40,28,20,.55)
    subtleText: Color(0x59281C14), // rgba(40,28,20,.35)
    cardBg: Color(0xFFFFFFFF),
    cardBorder: Color(0xFFF2E7D9),
    accent: Color(0xFFFF8C3A),
    accentDark: Color(0xFFC1530A),
    accentTint: Color(0x24FF8C3A), // rgba(255,140,58,.14)
    accentBorder: Color(0x4DFF8C3A), // rgba(255,140,58,.3)
    menuBg: Color(0xFFFFFFFF),
    shadow: [BoxShadow(color: Color(0x241E1208), blurRadius: 60, offset: Offset(0, 30))],
  );
}

class CySync {
  static const synced = Color(0xFF2FAE5A);
  static const syncing = Color(0xFFFF8C3A);
  static const error = Color(0xFFE0432C);
}
