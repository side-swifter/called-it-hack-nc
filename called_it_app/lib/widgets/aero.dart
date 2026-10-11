import 'dart:math';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Full-screen Frutiger Aero wallpaper: gradient sky/water + bubbles. [variant] 0=water 1=sky/meadow.
class AeroBackground extends StatelessWidget {
  const AeroBackground({super.key, required this.child, this.variant = 0});
  final Widget child;
  final int variant;

  @override
  Widget build(BuildContext context) => Stack(fit: StackFit.expand, children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: variant == 0
                  ? const [Color(0xFFCDEEFF), Color(0xFF7CCBEF), Color(0xFF1B8FC9), Color(0xFF0B5F95)]
                  : const [Color(0xFF3FA2F0), Color(0xFFB9E4FF), Color(0xFF7FD05B), Color(0xFF2E9B3C)],
              stops: const [0, .35, .7, 1],
            ),
          ),
        ),
        CustomPaint(painter: _Bubbles(variant)),
        SafeArea(child: child),
      ]);
}

class _Bubbles extends CustomPainter {
  _Bubbles(this.seed);
  final int seed;
  @override
  void paint(Canvas c, Size s) {
    final r = Random(7 + seed);
    for (var i = 0; i < 16; i++) {
      final p = Offset(r.nextDouble() * s.width, r.nextDouble() * s.height);
      final rad = 8 + r.nextDouble() * 38;
      c.drawCircle(p, rad, Paint()..color = Colors.white.withValues(alpha: .10));
      c.drawCircle(p, rad, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.2..color = Colors.white.withValues(alpha: .45));
      c.drawCircle(p.translate(-rad * .3, -rad * .3), rad * .22, Paint()..color = Colors.white.withValues(alpha: .55));
    }
  }

  @override
  bool shouldRepaint(_) => false;
}

/// Frosted glass card.
class Glass extends StatelessWidget {
  const Glass({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.radius = 22, this.onTap});
  final Widget child;
  final EdgeInsets padding;
  final double radius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              child: Container(
                padding: padding,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xCCFFFFFF), Color(0x80FFFFFF)]),
                  borderRadius: BorderRadius.circular(radius),
                  border: Border.all(color: Aero.glassEdge, width: 1.2),
                  boxShadow: const [BoxShadow(color: Color(0x33005588), blurRadius: 18, offset: Offset(0, 6))],
                ),
                child: child,
              ),
            ),
          ),
        ),
      );
}

/// Glossy pill button. [color] defaults to sky blue; pass Aero.yes / Aero.no for green/orange.
class GlossyButton extends StatelessWidget {
  const GlossyButton({super.key, required this.label, this.icon, this.onPressed, this.color = Aero.sky, this.loading = false});
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final Color color;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final on = onPressed != null && !loading;
    final base = on ? color : Colors.grey.shade400;
    return Opacity(
      opacity: on ? 1 : .7,
      child: GestureDetector(
        onTap: on ? onPressed : null,
        child: Container(
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color.lerp(base, Colors.white, .35)!, base, Color.lerp(base, Colors.black, .12)!], stops: const [0, .5, 1]),
            border: Border.all(color: Colors.white70),
            boxShadow: [BoxShadow(color: base.withValues(alpha: .4), blurRadius: 10, offset: const Offset(0, 4))],
          ),
          child: loading
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  if (icon != null) ...[Icon(icon, color: Colors.white, size: 18), const SizedBox(width: 6)],
                  Flexible(child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14), overflow: TextOverflow.ellipsis)),
                ]),
        ),
      ),
    );
  }
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = Aero.skyDeep, this.dot = false});
  final String text;
  final Color color;
  final bool dot;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: .14), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: .35))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dot) Container(width: 7, height: 7, margin: const EdgeInsets.only(right: 6), decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
        ]),
      );
}

/// Round initials avatar (AL, MY, JD ...). Agent gets the glowing orb.
class Avatar extends StatelessWidget {
  const Avatar(this.name, {super.key, this.agent = false, this.size = 34});
  final String name;
  final bool agent;
  final double size;
  static const _tints = [Color(0xFF7CC8F5), Color(0xFF8EE0A8), Color(0xFFFFB98A), Color(0xFFC9A6F2), Color(0xFFF5A9C8)];
  @override
  Widget build(BuildContext context) {
    final c = _tints[name.codeUnits.fold<int>(0, (a, b) => a + b) % _tints.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: agent ? const RadialGradient(colors: [Colors.white, Aero.aqua, Aero.skyDeep]) : null,
        color: agent ? null : c.withValues(alpha: .55),
        border: Border.all(color: Colors.white, width: 1.5),
        boxShadow: agent ? const [BoxShadow(color: Aero.aqua, blurRadius: 12)] : null,
      ),
      child: agent
          ? Icon(Icons.auto_awesome, size: size * .5, color: Colors.white)
          : Text(name.isEmpty ? '?' : name.substring(0, name.length >= 2 ? 2 : 1).toUpperCase(), style: TextStyle(fontSize: size * .34, fontWeight: FontWeight.w800)),
    );
  }
}

/// Header chip showing the signed-in player's balance; tap -> Chips tab.
class ChipsBadge extends StatelessWidget {
  const ChipsBadge(this.balance, {super.key, this.onTap});
  final int balance;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), gradient: const LinearGradient(colors: [Color(0xFFFFE9A8), Aero.gold]), border: Border.all(color: Colors.white)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.monetization_on, size: 16, color: Color(0xFFB77900)),
            const SizedBox(width: 5),
            Text('$balance chips', style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF7A4F00))),
          ]),
        ),
      );
}
