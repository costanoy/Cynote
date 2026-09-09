import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

Widget _mono(String path, {required double size, required Color color, String viewBox = '0 0 24 24'}) {
  final svg = '<svg viewBox="$viewBox" xmlns="http://www.w3.org/2000/svg">$path</svg>';
  return SvgPicture.string(
    svg,
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
  );
}

class LogoIcon extends StatelessWidget {
  final double size;
  const LogoIcon({super.key, this.size = 48});

  @override
  Widget build(BuildContext context) =>
      Image.asset('assets/cynote-logo.png', width: size, height: size);
}

class SearchIcon extends StatelessWidget {
  final double size;
  final Color color;
  const SearchIcon({super.key, this.size = 16, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/>'
        '<path d="M21 21l-4.3-4.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
        size: size,
        color: color,
      );
}

class SettingsIcon extends StatelessWidget {
  final double size;
  final Color color;
  const SettingsIcon({super.key, this.size = 16, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2.1"/>'
        '<path d="M19.4 13.5a7.6 7.6 0 000-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 00-2.6-1.5L14 2h-4l-.5 2.5a7.6 7.6 0 00-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 000 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 002.6 1.5L10 22h4l.5-2.5a7.6 7.6 0 002.6-1.5l2.3.9 2-3.4z" fill="none" stroke="currentColor" stroke-width="2.1"/>',
        size: size,
        color: color,
      );
}

class BackChevronIcon extends StatelessWidget {
  final double size;
  final Color color;
  const BackChevronIcon({super.key, this.size = 17, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
        size: size,
        color: color,
      );
}

class PlusIcon extends StatelessWidget {
  final double size;
  final Color color;
  const PlusIcon({super.key, this.size = 26, this.color = const Color(0xFFFFFFFF)});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
        size: size,
        color: color,
      );
}

class UndoIcon extends StatelessWidget {
  final double size;
  final Color color;
  const UndoIcon({super.key, this.size = 15, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M7 7H16a5 5 0 010 10H11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        '<path d="M10.5 3.5L6.5 7L10.5 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        size: size,
        color: color,
      );
}

class RedoIcon extends StatelessWidget {
  final double size;
  final Color color;
  const RedoIcon({super.key, this.size = 15, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M17 7H8a5 5 0 000 10H13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        '<path d="M13.5 3.5L17.5 7L13.5 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        size: size,
        color: color,
      );
}

class FormatIcon extends StatelessWidget {
  final double size;
  final Color color;
  const FormatIcon({super.key, this.size = 15, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<circle cx="12" cy="5" r="1.7" fill="currentColor"/>'
        '<circle cx="12" cy="12" r="1.7" fill="currentColor"/>'
        '<circle cx="12" cy="19" r="1.7" fill="currentColor"/>',
        size: size,
        color: color,
      );
}
