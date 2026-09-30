import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../icons.dart';
import '../theme.dart';

/// Every touch target is at least this big.
const double kTouchTarget = 44;

/// Ornamental motion (breathing lamp, swaying sprout, entry cascades) is
/// skipped when the system asks for reduced motion.
bool motionEnabled(BuildContext context) => !MediaQuery.disableAnimationsOf(context);

// ------------------------------------------------------------ interaction

/// Tap feedback shared by every button: shrinks a little while pressed.
class Pressable extends StatefulWidget {
  final VoidCallback? onTap;
  final double pressedScale;
  final Widget Function(BuildContext context, bool pressed) builder;

  const Pressable({super.key, required this.onTap, required this.builder, this.pressedScale = 0.95});

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _pressed = false;

  void _set(bool value) {
    if (widget.onTap == null || _pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      child: AnimatedScale(
        scale: _pressed ? widget.pressedScale : 1,
        duration: const Duration(milliseconds: 180),
        curve: CyMotion.grow,
        child: widget.builder(context, _pressed),
      ),
    );
  }
}

/// A round iron button with a gold rim.
class Medallion extends StatelessWidget {
  final CyColors t;
  final VoidCallback? onTap;
  final Widget child;
  final bool bordered;
  final bool active;
  final bool enabled;

  const Medallion({
    super.key,
    required this.t,
    required this.onTap,
    required this.child,
    this.bordered = true,
    this.active = false,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: Pressable(
        onTap: enabled ? onTap : null,
        pressedScale: 0.88,
        builder: (context, pressed) => AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: kTouchTarget,
          height: kTouchTarget,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active ? t.gold : (pressed ? t.goldSoft : const Color(0x00000000)),
            border: bordered ? Border.all(color: t.goldLine) : null,
            boxShadow: active ? [BoxShadow(color: t.glow, blurRadius: 12)] : null,
          ),
          child: child,
        ),
      ),
    );
  }
}

enum PillKind { primary, outline, link, danger }

/// A pill-shaped button, 44px tall.
class PillButton extends StatelessWidget {
  final CyColors t;
  final String label;
  final VoidCallback? onTap;
  final PillKind kind;
  final bool enabled;
  final double height;
  final double horizontalPadding;
  final double fontSize;

  const PillButton({
    super.key,
    required this.t,
    required this.label,
    required this.onTap,
    this.kind = PillKind.outline,
    this.enabled = true,
    this.height = kTouchTarget,
    this.horizontalPadding = 20,
    this.fontSize = 14,
  });

  @override
  Widget build(BuildContext context) {
    final primary = kind == PillKind.primary;
    final text = kind == PillKind.link || kind == PillKind.danger;
    final color = switch (kind) {
      PillKind.primary => t.accentInk,
      PillKind.outline => t.ink,
      PillKind.link => t.accent,
      PillKind.danger => t.danger,
    };
    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: Pressable(
        onTap: enabled ? onTap : null,
        builder: (context, pressed) => Container(
          height: height,
          padding: EdgeInsets.symmetric(horizontal: text ? 4 : horizontalPadding),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: primary ? t.accent : (pressed && !text ? t.paper2 : null),
            border: kind == PillKind.outline ? Border.all(color: t.fieldBorder) : null,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            maxLines: 1,
            style: CyType.ui(fontSize, color, weight: primary || kind == PillKind.link ? FontWeight.w500 : FontWeight.w400)
                .copyWith(
              decoration: text && pressed ? TextDecoration.underline : TextDecoration.none,
              decorationColor: color,
            ),
          ),
        ),
      ),
    );
  }
}

/// The on/off switch: a cream knob with a gold rim on a leaf-green track.
class CySwitch extends StatelessWidget {
  final CyColors t;
  final bool on;
  final VoidCallback onTap;
  const CySwitch({super.key, required this.t, required this.on, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Pressable(
      onTap: onTap,
      pressedScale: 0.94,
      builder: (context, pressed) => SizedBox(
        // The track is 30px tall; the padding keeps the touch target at 44.
        height: kTouchTarget,
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: 52,
            height: 30,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: on ? t.accent : t.paper2,
              border: Border.all(color: on ? t.accent : t.fieldBorder),
              borderRadius: BorderRadius.circular(15),
            ),
            child: AnimatedAlign(
              duration: const Duration(milliseconds: 300),
              curve: CyMotion.grow,
              alignment: on ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: t.paper,
                  shape: BoxShape.circle,
                  border: Border.all(color: t.gold),
                  boxShadow: [BoxShadow(color: t.shadow, blurRadius: 3, offset: const Offset(0, 1))],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ----------------------------------------------------------------- motion

/// Runs a looping 0..1..0 animation while motion is enabled; holds still at
/// [restValue] otherwise.
class Breathing extends StatefulWidget {
  final Duration period;
  final double restValue;
  final Widget Function(BuildContext context, double value) builder;

  const Breathing({super.key, required this.period, required this.builder, this.restValue = 0});

  @override
  State<Breathing> createState() => _BreathingState();
}

class _BreathingState extends State<Breathing> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.period ~/ 2);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (motionEnabled(context)) {
      if (!_controller.isAnimating) _controller.repeat(reverse: true);
    } else {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!motionEnabled(context)) return widget.builder(context, widget.restValue);
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) => widget.builder(context, Curves.easeInOut.transform(_controller.value)),
    );
  }
}

/// Entry animation for list items: rises 6px while fading in, after [delay].
class RiseIn extends StatefulWidget {
  final Duration delay;
  final Widget child;
  const RiseIn({super.key, this.delay = Duration.zero, required this.child});

  @override
  State<RiseIn> createState() => _RiseInState();
}

class _RiseInState extends State<RiseIn> with SingleTickerProviderStateMixin {
  static const _rise = Duration(milliseconds: 350);
  // The delay is part of the animation itself (no timers to outlive the widget).
  late final AnimationController _controller;
  late final Animation<double> _progress;

  @override
  void initState() {
    super.initState();
    final total = widget.delay + _rise;
    _controller = AnimationController(vsync: this, duration: total)..forward();
    _progress = CurvedAnimation(
      parent: _controller,
      curve: Interval(widget.delay.inMilliseconds / total.inMilliseconds, 1, curve: CyMotion.rise),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!motionEnabled(context)) return widget.child;
    return AnimatedBuilder(
      animation: _progress,
      child: widget.child,
      builder: (context, child) => Opacity(
        opacity: _progress.value,
        child: Transform.translate(offset: Offset(0, 6 * (1 - _progress.value)), child: child),
      ),
    );
  }
}

// -------------------------------------------------------------- ornaments

/// The in-app mark: a gold "C" in a double ring, with a leaf.
class LogoMedallion extends StatelessWidget {
  final CyColors t;
  final double size;
  final bool glowing;
  const LogoMedallion({super.key, required this.t, this.size = 32, this.glowing = false});

  @override
  Widget build(BuildContext context) {
    final ring = size * (glowing ? 4 / 88 : 2 / 32);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: t.frame,
        border: Border.all(color: t.gold),
        boxShadow: glowing ? [BoxShadow(color: t.glow, blurRadius: 26)] : null,
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Inner ring.
          Container(
            margin: EdgeInsets.all(ring),
            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: t.goldLine)),
          ),
          Transform.translate(
            offset: Offset(-size / 32, 0),
            child: Text('C', style: CyType.display(size * 0.56, t.gold, height: 1)),
          ),
          Positioned(
            right: size * 0.16,
            top: size * 0.19,
            child: SvgPicture.string(
              '<svg viewBox="-4 -4 8 8" xmlns="http://www.w3.org/2000/svg"><path d="M0 -3.5 C2.6 -1.8 2.6 1.8 0 3.5 '
              'C-2.6 1.8 -2.6 -1.8 0 -3.5 Z" ${svgFill(t.accent)} transform="rotate(35)"/></svg>',
              width: size * 0.28,
              height: size * 0.28,
            ),
          ),
        ],
      ),
    );
  }
}

/// A swaying sprout, for empty states.
class Sprout extends StatelessWidget {
  final CyColors t;
  const Sprout({super.key, required this.t});

  @override
  Widget build(BuildContext context) {
    final picture = SvgPicture.string(
      '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">'
      '<path d="M20 35 C20 28 20 22 20 15" fill="none" ${svgStroke(t.accent)} stroke-width="1.4" stroke-linecap="round"/>'
      '<path d="M20 23 C13 23 8.5 18 8.5 13 C14.5 13 20 17 20 23 Z M20 18.5 C26 18.5 31.5 13.5 31.5 8.5 '
      'C25 8.5 20 12.5 20 18.5 Z" ${svgFill(t.accent)} opacity=".75"/>'
      '<path d="M9 35.5 C15 33 25 33 31 35.5" fill="none" ${svgStroke(t.gold)} stroke-width="1.2" stroke-linecap="round"/>'
      '</svg>',
      width: 44,
      height: 44,
    );
    return Breathing(
      period: const Duration(seconds: 6),
      restValue: 0.5,
      builder: (context, v) => Transform.rotate(
        angle: (v - 0.5) * 2 * 3 * math.pi / 180,
        alignment: const Alignment(0, 0.8),
        child: picture,
      ),
    );
  }
}

/// A closed bud that pulses while something is being looked for.
class PulsingBud extends StatelessWidget {
  final CyColors t;
  const PulsingBud({super.key, required this.t});

  @override
  Widget build(BuildContext context) {
    final picture = SvgPicture.string(
      '<svg viewBox="-8 -9 16 18" xmlns="http://www.w3.org/2000/svg">'
      '<path d="M0 -7 C4 -3 4 3 0 5 C-4 3 -4 -3 0 -7 Z" ${svgFill(t.gold)}/></svg>',
      width: 12,
      height: 14,
    );
    return Breathing(
      period: const Duration(milliseconds: 1600),
      restValue: 1,
      builder: (context, v) =>
          Opacity(opacity: 0.75 + 0.25 * v, child: Transform.scale(scale: 0.88 + 0.16 * v, child: picture)),
    );
  }
}

/// The hand-drawn gold underline beneath titles.
class VineUnderline extends StatelessWidget {
  final CyColors t;
  final double width;
  const VineUnderline({super.key, required this.t, this.width = 130});

  @override
  Widget build(BuildContext context) => SvgPicture.string(
        '<svg viewBox="0 0 130 8" xmlns="http://www.w3.org/2000/svg"><path d="M1 5 C30 -1 52 9 84 4 '
        'C100 1.5 112 2.5 128 5" fill="none" ${svgStroke(t.gold)} stroke-width="1.1" stroke-linecap="round"/></svg>',
        width: width,
        height: 8,
        fit: BoxFit.fill,
      );
}

/// Section divider: a gold leaf between two curls, on a hairline.
class LeafDivider extends StatelessWidget {
  final CyColors t;
  const LeafDivider({super.key, required this.t});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Container(height: 1, color: t.rule)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: SvgPicture.string(
            '<svg viewBox="0 0 30 10" xmlns="http://www.w3.org/2000/svg">'
            '<path d="M15 1 C19 3.5 19 6.5 15 9 C11 6.5 11 3.5 15 1 Z" ${svgFill(t.gold)}/>'
            '<path d="M2 5 C6 2 9 8 12 5 M28 5 C24 2 21 8 18 5" fill="none" ${svgStroke(t.gold)} stroke-width="1" '
            'stroke-linecap="round"/></svg>',
            width: 30,
            height: 10,
          ),
        ),
        Expanded(child: Container(height: 1, color: t.rule)),
      ],
    );
  }
}

/// Empty state: sprout, a title, an italic line.
class EmptyState extends StatelessWidget {
  final CyColors t;
  final String title;
  final String hint;
  const EmptyState({super.key, required this.t, required this.title, required this.hint});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 70, horizontal: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Sprout(t: t),
          const SizedBox(height: 8),
          Text(title, textAlign: TextAlign.center, style: CyType.display(19, t.inkSoft)),
          const SizedBox(height: 8),
          Text(hint, textAlign: TextAlign.center, style: CyType.body(13.5, t.inkFaint, italic: true)),
        ],
      ),
    );
  }
}

// ----------------------------------------------------------------- header

/// The iron header: status bar, a 60px strip of controls, and a lower edge
/// that dips 14px at the center, with a gold fillet and a little lamp.
class ArchHeader extends StatelessWidget {
  final CyColors t;
  final List<Widget> children;
  const ArchHeader({super.key, required this.t, required this.children});

  static const double stripHeight = 60;
  static const double archHeight = 22;

  /// How far the arch hangs over the content below the header.
  static const double overhang = archHeight + 4;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context).top;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 500),
      color: t.frame,
      // Without a real status bar (desktop preview) keep the prototype's 34px.
      padding: EdgeInsets.only(top: inset > 0 ? inset : 34),
      child: SizedBox(
        height: stripHeight,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 10, 0),
          child: Row(children: children),
        ),
      ),
    );
  }
}

/// The arched lower edge of [ArchHeader], drawn over the top of the content.
class ArchEdge extends StatelessWidget {
  final CyColors t;
  const ArchEdge({super.key, required this.t});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: SizedBox(
        height: ArchHeader.overhang,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              right: 0,
              top: -1,
              height: ArchHeader.archHeight,
              child: CustomPaint(painter: _ArchPainter(iron: t.frame, fillet: t.goldLine)),
            ),
            Positioned(
              left: 0,
              right: 0,
              top: ArchHeader.archHeight - 6,
              child: Center(
                child: Breathing(
                  period: const Duration(seconds: 4),
                  builder: (context, v) => Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: t.gold,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: t.glow, blurRadius: 6 + 8 * v)],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArchPainter extends CustomPainter {
  final Color iron;
  final Color fillet;
  _ArchPainter({required this.iron, required this.fillet});

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn on a 370 x 22 grid, stretched to the header's width.
    final sx = size.width / 370;
    final sy = size.height / 22;
    Offset p(double x, double y) => Offset(x * sx, y * sy);
    void cubic(Path path, double x1, double y1, double x2, double y2, double x, double y) =>
        path.cubicTo(x1 * sx, y1 * sy, x2 * sx, y2 * sy, x * sx, y * sy);

    final body = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(p(370, 6).dx, p(370, 6).dy);
    cubic(body, 286, 6, 238, 20, 185, 20);
    cubic(body, 132, 20, 84, 6, 0, 6);
    body.close();
    canvas.drawPath(body, Paint()..color = iron);

    final line = Path()..moveTo(0, 2.5 * sy);
    cubic(line, 84, 2.5, 132, 16.5, 185, 16.5);
    cubic(line, 238, 16.5, 286, 2.5, 370, 2.5);
    canvas.drawPath(
      line,
      Paint()
        ..color = fillet
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_ArchPainter old) => old.iron != iron || old.fillet != fillet;
}

/// A screen under the arched header: [header] controls on the iron, [body]
/// below, with the arch hanging over the top of it.
class GreenhouseScreen extends StatelessWidget {
  final CyColors t;
  final List<Widget> header;
  final Widget body;
  const GreenhouseScreen({super.key, required this.t, required this.header, required this.body});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ArchHeader(t: t, children: header),
        Expanded(
          child: Stack(
            children: [
              Positioned.fill(child: body),
              Positioned(left: 0, right: 0, top: 0, child: ArchEdge(t: t)),
            ],
          ),
        ),
      ],
    );
  }
}

/// Paper with a fine dotted grid, like a herbarium sheet.
class DottedPaper extends StatelessWidget {
  final CyColors t;
  final Widget child;
  const DottedPaper({super.key, required this.t, required this.child});

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 500),
      color: t.paper2,
      child: CustomPaint(painter: _DotsPainter(t.rule), child: child),
    );
  }
}

class _DotsPainter extends CustomPainter {
  final Color color;
  _DotsPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    for (double y = 9; y < size.height; y += 18) {
      for (double x = 9; x < size.width; x += 18) {
        canvas.drawCircle(Offset(x, y), 0.8, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DotsPainter old) => old.color != color;
}

// ------------------------------------------------------------------- sync

enum SyncState { synced, syncing, error }

/// The sync indicator: three gold leaves open when synced, a bud pulsing
/// while syncing, a wilted bud on error.
class SyncFlower extends StatefulWidget {
  final CyColors t;
  final SyncState status;
  final double size;
  const SyncFlower({super.key, required this.t, required this.status, this.size = 20});

  @override
  State<SyncFlower> createState() => _SyncFlowerState();
}

class _SyncFlowerState extends State<SyncFlower> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _started = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this);
  }

  void _play() {
    if (!motionEnabled(context)) {
      _controller.stop();
      _controller.value = 1;
      return;
    }
    switch (widget.status) {
      case SyncState.synced:
        _controller.duration = const Duration(milliseconds: 600);
        _controller.forward(from: 0);
      case SyncState.syncing:
        _controller.duration = const Duration(milliseconds: 600);
        _controller.repeat(reverse: true);
      case SyncState.error:
        _controller.duration = const Duration(milliseconds: 700);
        _controller.forward(from: 0);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _play();
    }
  }

  @override
  void didUpdateWidget(covariant SyncFlower oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.status != widget.status) _play();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _svg {
    final t = widget.t;
    const open = 'M0 4 C-1.5 -1.5 -6 -4 -9.5 -3 C-8 2 -4 4.5 0 4 Z M0 4 C1.5 -1.5 6 -4 9.5 -3 C8 2 4 4.5 0 4 Z '
        'M0 4 C-2 -1 -1.4 -6 0 -9 C1.4 -6 2 -1 0 4 Z';
    final inner = switch (widget.status) {
      SyncState.synced => '<path d="$open" ${svgFill(t.gold)}/>'
          '<path d="M0 4 V9.5" ${svgStroke(t.gold)} stroke-width="1.3" stroke-linecap="round"/>',
      SyncState.syncing => '<path d="M0 -8 C4.5 -3.5 4.5 2.5 0 5 C-4.5 2.5 -4.5 -3.5 0 -8 Z" ${svgFill(t.gold)}/>'
          '<path d="M0 5 C-2.5 3 -5 4.5 -5.5 7 M0 5 C2.5 3 5 4.5 5.5 7 M0 5 V9.5" fill="none" '
          '${svgStroke(t.frameInkSoft)} stroke-width="1.2" stroke-linecap="round"/>',
      SyncState.error => '<path d="M0 -7 C4 -3 4 2 0 4.5 C-4 2 -4 -3 0 -7 Z" ${svgFill(t.alert)}/>'
          '<path d="M0 4.5 V9.5 M0 7 C-2 6 -4 7 -4.5 8.5" fill="none" ${svgStroke(t.alert)} stroke-width="1.2" '
          'stroke-linecap="round"/>',
    };
    return '<svg viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">$inner</svg>';
  }

  @override
  Widget build(BuildContext context) {
    final picture = SvgPicture.string(_svg, width: widget.size, height: widget.size);
    return AnimatedBuilder(
      animation: _controller,
      child: picture,
      builder: (context, child) {
        final v = _controller.value;
        switch (widget.status) {
          case SyncState.synced:
            // Blooms: grows past full size while untwisting, then settles.
            final e = CyMotion.grow.transform(v);
            final scale = e < 0.7 ? 0.15 + (1.12 - 0.15) * (e / 0.7) : 1.12 - 0.12 * ((e - 0.7) / 0.3);
            final turn = e < 0.7 ? -60 + 66 * (e / 0.7) : 6 - 6 * ((e - 0.7) / 0.3);
            return Opacity(
              opacity: (e / 0.7).clamp(0, 1).toDouble(),
              child: Transform.rotate(angle: turn * math.pi / 180, child: Transform.scale(scale: scale, child: child)),
            );
          case SyncState.syncing:
            final e = Curves.easeInOut.transform(v);
            return Opacity(
              opacity: 0.75 + 0.25 * e,
              child: Transform.scale(scale: 0.88 + 0.16 * e, alignment: const Alignment(0, 0.6), child: child),
            );
          case SyncState.error:
            // Wilts: tips over 38 degrees from the foot of the stem, and stays.
            return Transform.rotate(
              angle: 38 * CyMotion.grow.transform(v) * math.pi / 180,
              alignment: const Alignment(0, 0.9),
              child: child,
            );
        }
      },
    );
  }
}

String syncLabel(SyncState s) => switch (s) {
      SyncState.synced => 'Sincronizado',
      SyncState.syncing => 'Sincronizando…',
      SyncState.error => 'Erro de sincronização',
    };

// ---------------------------------------------------------------- dialogs

class CyDialogAction {
  final String label;
  final bool primary;
  final VoidCallback onTap;
  const CyDialogAction(this.label, this.onTap, {this.primary = false});
}

/// A paper plaque crowned by a medallion, over a scrim.
class CyDialog extends StatelessWidget {
  final CyColors t;
  final Widget icon;
  final String title;
  final String body;
  final List<CyDialogAction> actions;

  /// Shows the growing green bar instead of buttons, while something downloads.
  final bool progress;

  const CyDialog({
    super.key,
    required this.t,
    required this.icon,
    required this.title,
    required this.body,
    this.actions = const [],
    this.progress = false,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 318),
          child: Material(
            type: MaterialType.transparency,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.topCenter,
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(22, 44, 22, 20),
                  decoration: BoxDecoration(
                    color: t.paper,
                    border: Border.all(color: t.goldLine),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(26), bottom: Radius.circular(18)),
                    boxShadow: [BoxShadow(color: t.shadow, blurRadius: 44, offset: const Offset(0, 20))],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(title, textAlign: TextAlign.center, style: CyType.display(20, t.ink, letterSpacing: 0.4)),
                      const SizedBox(height: 8),
                      Text(body, textAlign: TextAlign.center, style: CyType.body(14.5, t.inkSoft, height: 1.55)),
                      const SizedBox(height: 18),
                      if (progress)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 2),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(minHeight: 4, color: t.accent, backgroundColor: t.rule),
                          ),
                        ),
                      if (actions.isNotEmpty)
                        Row(
                          children: [
                            for (var i = 0; i < actions.length; i++) ...[
                              if (i > 0) const SizedBox(width: 10),
                              Expanded(
                                child: PillButton(
                                  t: t,
                                  label: actions[i].label,
                                  onTap: actions[i].onTap,
                                  kind: actions[i].primary ? PillKind.primary : PillKind.outline,
                                  horizontalPadding: 16,
                                ),
                              ),
                            ],
                          ],
                        ),
                    ],
                  ),
                ),
                Positioned(
                  top: -32,
                  child: Container(
                    width: 64,
                    height: 64,
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: t.paper,
                      shape: BoxShape.circle,
                      border: Border.all(color: t.gold),
                    ),
                    child: Container(
                      decoration: BoxDecoration(
                        color: t.frame,
                        shape: BoxShape.circle,
                        border: Border.all(color: t.gold),
                        boxShadow: [BoxShadow(color: t.glow, blurRadius: 14)],
                      ),
                      alignment: Alignment.center,
                      child: icon,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Opens a [CyDialog]: the scrim fades in while the plaque grows into place.
Future<void> showCyDialog(BuildContext context, CyColors t, WidgetBuilder builder) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierColor: t.scrim,
    transitionDuration: const Duration(milliseconds: 320),
    pageBuilder: (ctx, _, __) => builder(ctx),
    transitionBuilder: (ctx, animation, _, child) {
      final grow = CurvedAnimation(parent: animation, curve: CyMotion.grow);
      return FadeTransition(
        opacity: animation,
        child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(grow), child: child),
      );
    },
  );
}
