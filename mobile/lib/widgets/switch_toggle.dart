import 'package:flutter/material.dart';
import '../theme.dart';

class SwitchToggle extends StatelessWidget {
  final bool on;
  final VoidCallback onTap;
  final CyColors t;
  const SwitchToggle({super.key, required this.on, required this.onTap, required this.t});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 40 * kScale,
        height: 23 * kScale,
        padding: const EdgeInsets.all(2),
        alignment: on ? Alignment.centerRight : Alignment.centerLeft,
        decoration: BoxDecoration(
          color: on ? t.accent : Colors.black.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Container(
          width: 19 * kScale,
          height: 19 * kScale,
          decoration: const BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: Color(0x4D000000), blurRadius: 3, offset: Offset(0, 1))],
          ),
        ),
      ),
    );
  }
}
