import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Cynote is a steno pad: pale green ruled paper, graphite ink, one ballpoint
/// blue spent only on where you are, a red margin rule that also marks
/// destructive actions, and a deep green cover. Same names and values as the
/// desktop app's CSS variables (desktop/src/theme.css).
@immutable
class CyColors extends ThemeExtension<CyColors> {
  /// The page itself: list and editor background.
  final Color page;

  /// One step darker: app bars, cards, sheets, dialogs.
  final Color page2;

  /// The printed rule under every line of note text, and list separators.
  final Color rule;
  final Color ink;
  final Color inkSoft;
  final Color inkFaint;

  /// Ballpoint blue: caret, focus, selection.
  final Color accent;
  final Color onAccent;
  final Color accentSoft;
  final Color selection;

  /// The red margin rule; also errors and destructive actions.
  final Color margin;

  /// [margin] dark enough (or light enough) to be read as text.
  final Color marginInk;

  /// The pad's cover: the editor's status bar and the new-note button.
  final Color cover;
  final Color coverInk;

  /// Warnings on the cover (offline, refused, failed), from the desktop status bar.
  final Color coverAlert;

  /// Offline, as a small mark on the page.
  final Color amber;

  const CyColors({
    required this.page,
    required this.page2,
    required this.rule,
    required this.ink,
    required this.inkSoft,
    required this.inkFaint,
    required this.accent,
    required this.onAccent,
    required this.accentSoft,
    required this.selection,
    required this.margin,
    required this.marginInk,
    required this.cover,
    required this.coverInk,
    required this.coverAlert,
    required this.amber,
  });

  static const light = CyColors(
    page: Color(0xFFEDF2E8),
    page2: Color(0xFFE1E8DB),
    rule: Color(0xFFCBD9C6),
    ink: Color(0xFF262B27),
    inkSoft: Color(0xFF59625A),
    inkFaint: Color(0xFF67716A),
    accent: Color(0xFF2350C0),
    onAccent: Color(0xFFFFFFFF),
    accentSoft: Color(0x242350C0), // rgba(35,80,192,.14)
    selection: Color(0x382350C0), // rgba(35,80,192,.22)
    margin: Color(0xFFC9463D),
    marginInk: Color(0xFFB23A31),
    cover: Color(0xFF2F5240),
    coverInk: Color(0xFFE6EFE4),
    coverAlert: Color(0xFFFFD27A),
    amber: Color(0xFFB7791F),
  );

  static const dark = CyColors(
    page: Color(0xFF18201B),
    page2: Color(0xFF111713),
    rule: Color(0xFF26312A),
    ink: Color(0xFFDCE5DA),
    inkSoft: Color(0xFF9AA79B),
    inkFaint: Color(0xFF7C8A7F),
    accent: Color(0xFF7FA2FF),
    onAccent: Color(0xFF0B1430),
    accentSoft: Color(0x297FA2FF), // rgba(127,162,255,.16)
    selection: Color(0x477FA2FF), // rgba(127,162,255,.28)
    margin: Color(0xFFE0766C),
    marginInk: Color(0xFFE0766C),
    cover: Color(0xFF2B4D3B),
    coverInk: Color(0xFFCFE0D2),
    coverAlert: Color(0xFFFFD27A),
    amber: Color(0xFFD9A441),
  );

  static CyColors of(BuildContext context) => Theme.of(context).extension<CyColors>() ?? light;

  @override
  CyColors copyWith() => this;

  @override
  CyColors lerp(CyColors? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return CyColors(
      page: l(page, other.page),
      page2: l(page2, other.page2),
      rule: l(rule, other.rule),
      ink: l(ink, other.ink),
      inkSoft: l(inkSoft, other.inkSoft),
      inkFaint: l(inkFaint, other.inkFaint),
      accent: l(accent, other.accent),
      onAccent: l(onAccent, other.onAccent),
      accentSoft: l(accentSoft, other.accentSoft),
      selection: l(selection, other.selection),
      margin: l(margin, other.margin),
      marginInk: l(marginInk, other.marginInk),
      cover: l(cover, other.cover),
      coverInk: l(coverInk, other.coverInk),
      coverAlert: l(coverAlert, other.coverAlert),
      amber: l(amber, other.amber),
    );
  }
}

/// The note's own type: JetBrains Mono 400 (bundled, see assets/fonts), one
/// size, one fixed pitch. The strut forces every row, wrapped or not, emoji or
/// not, to exactly [pitch] logical pixels at the default text scale.
class CyNoteType {
  static const family = 'JetBrainsMono';
  static const size = 15.0;
  static const pitch = 26.0;

  static TextStyle style(Color color) => TextStyle(
    fontFamily: family,
    fontSize: size,
    height: pitch / size,
    leadingDistribution: TextLeadingDistribution.even,
    fontWeight: FontWeight.w400,
    letterSpacing: 0,
    color: color,
    // Plain text: "->" stays two characters, as on the desktop.
    fontFeatures: const [FontFeature.disable('liga'), FontFeature.disable('calt')],
  );

  static const strut = StrutStyle(
    fontFamily: family,
    fontSize: size,
    height: pitch / size,
    leadingDistribution: TextLeadingDistribution.even,
    forceStrutHeight: true,
  );
}

const _tabular = [FontFeature.tabularFigures()];

TextTheme _textTheme(Brightness brightness, CyColors c) {
  // Roboto through the Material 3 type scale, on every platform (the web
  // preview included). labelSmall is raised to 12 so a screen can stay at
  // three sizes.
  final typography = Typography.material2021(platform: TargetPlatform.android);
  final base = (brightness == Brightness.dark ? typography.white : typography.black).merge(typography.englishLike);
  final themed = base.apply(bodyColor: c.ink, displayColor: c.ink, fontFamily: 'Roboto');
  return themed.copyWith(
    labelSmall: themed.labelSmall!.copyWith(fontSize: 12, height: 16 / 12, letterSpacing: 0.4, fontFeatures: _tabular),
  );
}

ThemeData cynoteTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final c = dark ? CyColors.dark : CyColors.light;
  final text = _textTheme(brightness, c);

  final scheme = ColorScheme(
    brightness: brightness,
    // Blue marks only where you are (caret, current rule, focus, selection), so
    // Material's primary is ink and the filled button wears the cover.
    primary: c.ink,
    onPrimary: c.page,
    primaryContainer: Color.alphaBlend(c.ink.withValues(alpha: 0.08), c.page),
    onPrimaryContainer: c.ink,
    secondary: c.cover,
    onSecondary: c.coverInk,
    secondaryContainer: c.cover,
    onSecondaryContainer: c.coverInk,
    tertiary: c.cover,
    onTertiary: c.coverInk,
    error: c.margin,
    onError: dark ? const Color(0xFF2A0D0A) : const Color(0xFFFFFFFF),
    errorContainer: Color.alphaBlend(c.margin.withValues(alpha: 0.14), c.page),
    onErrorContainer: c.marginInk,
    surface: c.page,
    onSurface: c.ink,
    onSurfaceVariant: c.inkSoft,
    surfaceDim: c.page2,
    surfaceBright: c.page,
    surfaceContainerLowest: c.page,
    surfaceContainerLow: c.page2,
    surfaceContainer: c.page2,
    surfaceContainerHigh: c.page2,
    surfaceContainerHighest: Color.alphaBlend(c.ink.withValues(alpha: 0.08), c.page2),
    outline: c.inkFaint,
    outlineVariant: c.rule,
    shadow: const Color(0xFF000000),
    scrim: const Color(0xFF000000),
    inverseSurface: c.ink,
    onInverseSurface: c.page,
    inversePrimary: dark ? CyColors.light.accent : CyColors.dark.accent,
    surfaceTint: const Color(0x00000000),
  );

  final overlay = SystemUiOverlayStyle(
    statusBarColor: const Color(0x00000000),
    statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
    statusBarBrightness: brightness,
    systemNavigationBarColor: const Color(0x00000000),
    systemNavigationBarDividerColor: const Color(0x00000000),
    systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
    systemNavigationBarContrastEnforced: false,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    typography: Typography.material2021(platform: TargetPlatform.android),
    textTheme: text,
    fontFamily: 'Roboto',
    scaffoldBackgroundColor: c.page,
    canvasColor: c.page,
    splashFactory: InkRipple.splashFactory,
    extensions: [c],
    appBarTheme: AppBarTheme(
      backgroundColor: c.page2,
      foregroundColor: c.ink,
      surfaceTintColor: const Color(0x00000000),
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge,
      iconTheme: IconThemeData(color: c.ink, size: 24),
      actionsIconTheme: IconThemeData(color: c.ink, size: 24),
      systemOverlayStyle: overlay,
    ),
    iconTheme: IconThemeData(color: c.ink, size: 24),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(foregroundColor: c.ink, disabledForegroundColor: c.ink.withValues(alpha: 0.38)),
    ),
    dividerTheme: DividerThemeData(color: c.rule, thickness: 1, space: 1),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: c.cover,
      foregroundColor: c.coverInk,
      splashColor: c.coverInk.withValues(alpha: 0.12),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: c.accent,
      selectionColor: c.selection,
      selectionHandleColor: c.accent,
    ),
    inputDecorationTheme: InputDecorationTheme(
      hintStyle: text.bodyLarge!.copyWith(color: c.inkSoft),
      // Only the shape: the side follows the state (outline, then the
      // accent at 2 dp when focused, the margin red on error).
      border: const OutlineInputBorder(),
      errorStyle: text.bodySmall!.copyWith(color: c.marginInk),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(backgroundColor: c.cover, foregroundColor: c.coverInk, textStyle: text.labelLarge),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink,
        side: BorderSide(color: c.inkFaint),
        textStyle: text.labelLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: c.ink, textStyle: text.labelLarge),
    ),
    switchTheme: SwitchThemeData(
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? const Color(0x00000000) : c.inkFaint,
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: const Color(0x00000000),
      side: BorderSide(color: c.inkFaint.withValues(alpha: 0.6)),
      shape: const StadiumBorder(),
      labelStyle: text.labelMedium!.copyWith(color: c.ink),
      iconTheme: IconThemeData(color: c.inkSoft, size: 18),
      padding: const EdgeInsets.symmetric(horizontal: 4),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: c.page2,
      surfaceTintColor: const Color(0x00000000),
      textStyle: text.bodyLarge,
      labelTextStyle: WidgetStatePropertyAll(text.bodyLarge),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.page2,
      modalBackgroundColor: c.page2,
      surfaceTintColor: const Color(0x00000000),
      showDragHandle: true,
      dragHandleColor: c.inkFaint,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.page2,
      surfaceTintColor: const Color(0x00000000),
      titleTextStyle: text.titleLarge,
      contentTextStyle: text.bodyMedium!.copyWith(color: c.inkSoft),
      iconColor: c.inkSoft,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.ink,
      contentTextStyle: text.bodyMedium!.copyWith(color: c.page),
      actionTextColor: c.page,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.ink, linearTrackColor: c.rule),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: c.ink, borderRadius: BorderRadius.circular(4)),
      textStyle: text.labelMedium!.copyWith(color: c.page),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: c.inkSoft,
      textColor: c.ink,
      titleTextStyle: text.bodyLarge,
      subtitleTextStyle: text.bodyMedium!.copyWith(color: c.inkSoft),
    ),
  );
}

/// Tabular figures, for times and counts that change in place.
TextStyle tabular(TextStyle style) => style.copyWith(fontFeatures: _tabular);
