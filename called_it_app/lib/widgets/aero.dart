import 'dart:ui';

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Full-screen Frutiger Aero wallpaper. [variant]: 0 water, 1 sky, 2 room (city + water), 3 meadow.
class AeroBackground extends StatelessWidget {
  const AeroBackground({super.key, required this.child, this.variant = 0});
  final Widget child;
  final int variant;
  static const _files = ['water', 'sky', 'room', 'meadow'];

  @override
  Widget build(BuildContext context) => Stack(fit: StackFit.expand, children: [
        const ColoredBox(color: Color(0xFF3FA2F0)),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 450),
          child: Image.asset('assets/bg/${_files[variant]}.jpg', key: ValueKey(variant), fit: BoxFit.cover, width: double.infinity, height: double.infinity, filterQuality: FilterQuality.high, errorBuilder: (_, _, _) => const SizedBox()),
        ),
        // light wash so the white glass cards stay readable over busy photos
        DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white.withValues(alpha: .18), Colors.white.withValues(alpha: .02)]))),
        SafeArea(child: child),
      ]);
}

/// Frosted glass card: ~70% white, strong blur, bright thin edge, soft blue shadow.
class Glass extends StatelessWidget {
  const Glass({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.radius = 24, this.onTap});
  final Widget child;
  final EdgeInsets padding;
  final double radius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: const [BoxShadow(color: Color(0x3A0A5F9C), blurRadius: 22, offset: Offset(0, 8))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                child: Container(
                  padding: padding,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xCFFFFFFF), Color(0xA8EAF6FF)]),
                    borderRadius: BorderRadius.circular(radius),
                    border: Border.all(color: const Color(0xF2FFFFFF), width: 1.2),
                  ),
                  child: child,
                ),
              ),
            ),
          ),
        ),
      );
}

/// Glossy pill button with a top sheen. [color] defaults to sky blue; pass Aero.yes / Aero.no for green/orange.
class GlossyButton extends StatelessWidget {
  const GlossyButton({super.key, required this.label, this.icon, this.onPressed, this.color = Aero.sky, this.loading = false, this.height = 46});
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final Color color;
  final bool loading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final on = onPressed != null && !loading;
    final base = on ? color : Colors.grey.shade400;
    final top = Color.lerp(base, Colors.white, .22)!;
    final bottom = Color.lerp(base, const Color(0xFF053E78), .35)!;
    return Opacity(
      opacity: on ? 1 : .7,
      child: GestureDetector(
        onTap: on ? onPressed : null,
        child: Container(
          height: height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [top, base, bottom], stops: const [0, .5, 1]),
            border: Border.all(color: Colors.white.withValues(alpha: .75), width: 1),
            boxShadow: [BoxShadow(color: bottom.withValues(alpha: .45), blurRadius: 12, offset: const Offset(0, 5))],
          ),
          child: Stack(alignment: Alignment.center, children: [
            // gloss sheen over the top half
            Positioned(
              left: 2,
              right: 2,
              top: 2,
              height: height * .46,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white.withValues(alpha: .5), Colors.white.withValues(alpha: .08)]),
                ),
              ),
            ),
            loading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      if (icon != null) ...[Icon(icon, color: Colors.white, size: 18), const SizedBox(width: 7)],
                      Flexible(child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14, shadows: [Shadow(color: Color(0x55000000), blurRadius: 2, offset: Offset(0, 1))]), overflow: TextOverflow.ellipsis)),
                    ]),
                  ),
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
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: .13), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: .38))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dot) Container(width: 7, height: 7, margin: const EdgeInsets.only(right: 6), decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          Flexible(child: Text(text, overflow: TextOverflow.ellipsis, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12))),
        ]),
      );
}

/// Round initials avatar (AL, MY, JD ...). Agent gets the glowing orb.
class Avatar extends StatelessWidget {
  const Avatar(this.name, {super.key, this.agent = false, this.size = 34});
  final String name;
  final bool agent;
  final double size;
  // (fill, initials colour): pastel disc with a darker tone of the same hue
  static const _tints = [
    (Color(0xFFBFE4FA), Color(0xFF2B79B0)),
    (Color(0xFFC6F0CF), Color(0xFF2E8B4A)),
    (Color(0xFFFFD7BC), Color(0xFFC0611F)),
    (Color(0xFFE2D2F7), Color(0xFF7B4DB5)),
    (Color(0xFFFBCFE0), Color(0xFFB8436F)),
  ];
  @override
  Widget build(BuildContext context) {
    final t = _tints[name.codeUnits.fold<int>(0, (a, b) => a + b) % _tints.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: agent ? const RadialGradient(center: Alignment(-.3, -.3), colors: [Colors.white, Aero.aqua, Aero.skyDeep], stops: [0, .45, 1]) : null,
        color: agent ? null : t.$1,
        border: Border.all(color: Colors.white, width: 1.5),
        boxShadow: agent ? const [BoxShadow(color: Aero.aqua, blurRadius: 12)] : const [BoxShadow(color: Color(0x22005588), blurRadius: 4, offset: Offset(0, 2))],
      ),
      child: agent
          ? Icon(Icons.auto_awesome, size: size * .5, color: Colors.white)
          : Text(name.isEmpty ? '?' : name.substring(0, name.length >= 2 ? 2 : 1).toUpperCase(), style: TextStyle(fontSize: size * .34, fontWeight: FontWeight.w800, color: t.$2)),
    );
  }
}

/// Header chip showing the signed-in player's balance (gold pill + coin); tap -> Chips tab.
class ChipsBadge extends StatelessWidget {
  const ChipsBadge(this.balance, {super.key, this.onTap});
  final int balance;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 6, 14, 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFFFEFB8), Color(0xFFFFC94D)]),
            border: Border.all(color: Colors.white, width: 1.2),
            boxShadow: const [BoxShadow(color: Color(0x33B77900), blurRadius: 8, offset: Offset(0, 3))],
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: BoxDecoration(shape: BoxShape.circle, gradient: const RadialGradient(center: Alignment(-.3, -.3), colors: [Color(0xFFFFE08A), Color(0xFFF29A1F)]), border: Border.all(color: const Color(0xFFFFF3C9), width: 1.5)),
              child: const Text('\$', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF9A5A00), height: 1)),
            ),
            const SizedBox(width: 7),
            Text('$balance chips', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF7A4F00))),
          ]),
        ),
      );
}
