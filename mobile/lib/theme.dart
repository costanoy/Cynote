import 'package:flutter/widgets.dart';
import 'package:google_fonts/google_fonts.dart';

/// Design tokens: a Victorian greenhouse of iron and glass. "Light" is the
/// greenhouse in the morning, "dark" the same place at night, with the gold
/// ornaments lit like lamps. Same names and values as the desktop app's CSS
/// variables (desktop/src/theme.css).
class CyColors {
  /// Verdigris iron: header, footer.
  final Color frame;
  final Color frame2;
  final Color frameInk;
  final Color frameInkSoft;
  final Color gold;
  final Color goldLine;
  final Color goldSoft;
  final Color glow;
  final Color paper;
  final Color paper2;
  final Color rule;
  final Color ink;
  final Color inkSoft;
  final Color inkFaint;
  final Color accent;
  final Color accentInk;
  final Color petrol;
  final Color match;
  final Color matchCur;
  final Color danger;
  final Color alert;
  /// The lead came around stained glass.
  final Color lead;
  final Color shadow;
  final Color scrim;
  final Color field;
  final Color fieldBorder;
  final Color fieldInk;
  /// Stained-glass colors, one per note (hue % 4).
  final List<Color> glass;

  const CyColors({
    required this.frame,
    required this.frame2,
    required this.frameInk,
    required this.frameInkSoft,
    required this.gold,
    required this.goldLine,
    required this.goldSoft,
    required this.glow,
    required this.paper,
    required this.paper2,
    required this.rule,
    required this.ink,
    required this.inkSoft,
    required this.inkFaint,
    required this.accent,
    required this.accentInk,
    required this.petrol,
    required this.match,
    required this.matchCur,
    required this.danger,
    required this.alert,
    required this.lead,
    required this.shadow,
    required this.scrim,
    required this.field,
    required this.fieldBorder,
    required this.fieldInk,
    required this.glass,
  });

  static const light = CyColors(
    frame: Color(0xFF37604F),
    frame2: Color(0xFF274A3C),
    frameInk: Color(0xFFF3EBD3),
    frameInkSoft: Color(0xFFC3D3BC),
    gold: Color(0xFFC9A04E),
    goldLine: Color(0x8CE2BE6E), // rgba(226,190,110,.55)
    goldSoft: Color(0x38E2BE6E), // rgba(226,190,110,.22)
    glow: Color(0x73F0C86E), // rgba(240,200,110,.45)
    paper: Color(0xFFFBF6E9),
    paper2: Color(0xFFF2EAD5),
    rule: Color(0xFFDCCDA6),
    ink: Color(0xFF2A2A22),
    inkSoft: Color(0xFF645F4C),
    inkFaint: Color(0xFF9C957C),
    accent: Color(0xFF3D7A4C),
    accentInk: Color(0xFFFFFDF4),
    petrol: Color(0xFF2E6470),
    match: Color(0x668FB878), // rgba(143,184,120,.40)
    matchCur: Color(0xFFEBC46C),
    danger: Color(0xFFA8483A),
    alert: Color(0xFFF5B9A8),
    lead: Color(0xFF1C3027),
    shadow: Color(0x4D263420), // rgba(38,52,32,.30)
    scrim: Color(0x611C2C22), // rgba(28,44,34,.38)
    field: Color(0xFFFFFDF6),
    fieldBorder: Color(0xFFCFBF97),
    fieldInk: Color(0xFF2A2A22),
    glass: [Color(0xFFA9CB8F), Color(0xFFE3B45A), Color(0xFF7FB2B8), Color(0xFF9AAAD0)],
  );

  static const dark = CyColors(
    frame: Color(0xFF10211A),
    frame2: Color(0xFF0A1712),
    frameInk: Color(0xFFEADFC2),
    frameInkSoft: Color(0xFF91A58E),
    gold: Color(0xFFE2B85C),
    goldLine: Color(0x8CE2B85C), // rgba(226,184,92,.55)
    goldSoft: Color(0x2EE2B85C), // rgba(226,184,92,.18)
    glow: Color(0x8CECBE5A), // rgba(236,190,90,.55)
    paper: Color(0xFF15251E),
    paper2: Color(0xFF1B2E26),
    rule: Color(0xFF2F4A3D),
    ink: Color(0xFFE9E2CC),
    inkSoft: Color(0xFFAEB49E),
    inkFaint: Color(0xFF6F7F6D),
    accent: Color(0xFF86B96F),
    accentInk: Color(0xFF0E1C16),
    petrol: Color(0xFF7FC2CA),
    match: Color(0x4D86B96F), // rgba(134,185,111,.30)
    matchCur: Color(0xB8E2B85C), // rgba(226,184,92,.72)
    danger: Color(0xFFE58A74),
    alert: Color(0xFFF2A08C),
    lead: Color(0xFF040A08),
    shadow: Color(0x8C000000), // rgba(0,0,0,.55)
    scrim: Color(0x8C020806), // rgba(2,8,6,.55)
    field: Color(0xFF0E1D17),
    fieldBorder: Color(0xFF39584A),
    fieldInk: Color(0xFFE9E2CC),
    glass: [Color(0xFF8CC474), Color(0xFFE5A945), Color(0xFF62A7B0), Color(0xFF8397C9)],
  );

  /// The glass color for a note, picked from its id so it never changes.
  Color glassFor(String id) {
    var h = 0;
    for (final unit in id.codeUnits) {
      h = (h * 31 + unit) & 0x7fffffff;
    }
    return glass[h % glass.length];
  }
}

/// The four typefaces: Marcellus for titles, Literata for the notes
/// themselves, Jost for the interface, JetBrains Mono for codes.
class CyType {
  static TextStyle display(double size, Color color, {double? letterSpacing, double? height}) =>
      GoogleFonts.marcellus(fontSize: size, color: color, letterSpacing: letterSpacing, height: height);

  static TextStyle body(double size, Color color, {double? height, bool italic = false}) => GoogleFonts.literata(
        fontSize: size,
        color: color,
        height: height,
        fontStyle: italic ? FontStyle.italic : FontStyle.normal,
      );

  static TextStyle ui(double size, Color color, {FontWeight weight = FontWeight.w400, double? height}) =>
      GoogleFonts.jost(fontSize: size, color: color, fontWeight: weight, height: height);

  static TextStyle mono(double size, Color color, {double? letterSpacing}) =>
      GoogleFonts.jetBrainsMono(fontSize: size, color: color, letterSpacing: letterSpacing);
}

/// Motion: things grow and rise, never snap.
class CyMotion {
  static const grow = Cubic(0.3, 0.7, 0.2, 1);
  static const rise = Cubic(0.2, 0.8, 0.2, 1);
}
