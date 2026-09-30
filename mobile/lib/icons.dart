import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

// Interface icons: 16x16 grid, rounded line ends, tinted with one color.
Widget _mono(String path, {required double size, required Color color, String viewBox = '0 0 16 16'}) {
  final svg = '<svg viewBox="$viewBox" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#000" '
      'stroke-linecap="round" stroke-linejoin="round">$path</svg>';
  return SvgPicture.string(
    svg,
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
  );
}

/// SVG paint attributes for a color, keeping its alpha.
String svgFill(Color c) => 'fill="${_hex(c)}" fill-opacity="${c.a.toStringAsFixed(3)}"';
String svgStroke(Color c) => 'stroke="${_hex(c)}" stroke-opacity="${c.a.toStringAsFixed(3)}"';

String _hex(Color c) {
  String two(double v) => (v * 255).round().clamp(0, 255).toRadixString(16).padLeft(2, '0');
  return '#${two(c.r)}${two(c.g)}${two(c.b)}';
}

class SearchIcon extends StatelessWidget {
  final double size;
  final Color color;
  const SearchIcon({super.key, this.size = 18, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<circle cx="7" cy="7" r="4.5" stroke-width="1.5"/><path d="M10.4 10.4L14 14" stroke-width="1.5"/>',
        size: size,
        color: color,
      );
}

class SettingsIcon extends StatelessWidget {
  final double size;
  final Color color;
  const SettingsIcon({super.key, this.size = 19, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M2 4h6.2M11.8 4H14M2 8h1.2M6.8 8H14M2 12h7.2M12.8 12H14" stroke-width="1.4"/>'
        '<circle cx="10" cy="4" r="1.8" stroke-width="1.4"/>'
        '<circle cx="5" cy="8" r="1.8" stroke-width="1.4"/>'
        '<circle cx="11" cy="12" r="1.8" stroke-width="1.4"/>',
        size: size,
        color: color,
      );
}

class BackChevronIcon extends StatelessWidget {
  final double size;
  final Color color;
  const BackChevronIcon({super.key, this.size = 18, required this.color});

  @override
  Widget build(BuildContext context) =>
      _mono('<path d="M13 8H3M7 4L3 8l4 4" stroke-width="1.7"/>', size: size, color: color);
}

class PlusIcon extends StatelessWidget {
  final double size;
  final Color color;
  const PlusIcon({super.key, this.size = 24, required this.color});

  @override
  Widget build(BuildContext context) =>
      _mono('<path d="M8 2.5v11M2.5 8h11" stroke-width="1.6"/>', size: size, color: color);
}

class UndoIcon extends StatelessWidget {
  final double size;
  final Color color;
  const UndoIcon({super.key, this.size = 18, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M5.5 3L2.5 6l3 3" stroke-width="1.5"/><path d="M2.5 6H10a3.5 3.5 0 0 1 0 7H7" stroke-width="1.5"/>',
        size: size,
        color: color,
      );
}

class RedoIcon extends StatelessWidget {
  final double size;
  final Color color;
  const RedoIcon({super.key, this.size = 18, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M10.5 3l3 3-3 3" stroke-width="1.5"/><path d="M13.5 6H6a3.5 3.5 0 0 0 0 7h3" stroke-width="1.5"/>',
        size: size,
        color: color,
      );
}

class ClearIcon extends StatelessWidget {
  final double size;
  final Color color;
  const ClearIcon({super.key, this.size = 11, required this.color});

  @override
  Widget build(BuildContext context) =>
      _mono('<path d="M4 4l8 8M12 4l-8 8" stroke-width="2"/>', size: size, color: color);
}

class ComputerIcon extends StatelessWidget {
  final double size;
  final Color color;
  const ComputerIcon({super.key, this.size = 20, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<rect x="2" y="3" width="12" height="8" rx="1.5" stroke-width="1.3"/><path d="M5.5 14h5M8 11v3" stroke-width="1.3"/>',
        size: size,
        color: color,
      );
}

class UpdateIcon extends StatelessWidget {
  final double size;
  final Color color;
  const UpdateIcon({super.key, this.size = 22, required this.color});

  @override
  Widget build(BuildContext context) => _mono(
        '<path d="M2 12.5h12" stroke-width="1.3"/><path d="M4.5 12.5a3.5 3.5 0 0 1 7 0" stroke-width="1.3"/>'
        '<path d="M8 2v5M5.8 4.2L8 2l2.2 2.2" stroke-width="1.3"/>',
        size: size,
        color: color,
      );
}
