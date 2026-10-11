import 'dart:ui';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart' show Aero;

// Colours measured from the Chips mockup.
const _navy = Color(0xFF1F4E79);
const _label = Color(0xFF6D8CA8);
const _blueText = Color(0xFF3B8FD4);
const _poolTitle = Color(0xFF4A86B5);
const _rowName = Color(0xFF3F6E94);

/// Frosted white card used by the Chips and Activity screens (matches the mockup glass).
class MockCard extends StatelessWidget {
  const MockCard({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.radius = 24, this.onTap, this.opacity = 1});
  final Widget child;
  final EdgeInsets padding;
  final double radius;
  final VoidCallback? onTap;
  final double opacity;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              child: Container(
                padding: padding,
                decoration: BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white.withValues(alpha: .82 * opacity), Color.fromRGBO(226, 243, 252, .62 * opacity)]),
                  borderRadius: BorderRadius.circular(radius),
                  border: Border.all(color: Colors.white.withValues(alpha: .9), width: 1.2),
                  boxShadow: const [BoxShadow(color: Color(0x2E0A5A8C), blurRadius: 18, offset: Offset(0, 6))],
                ),
                child: child,
              ),
            ),
          ),
        ),
      );
}

/// Small tinted pill. [solid] fills with [fg] and uses white text (e.g. "6 Chips Total").
class MockPill extends StatelessWidget {
  const MockPill(this.text, {super.key, required this.bg, required this.border, required this.fg, this.solid = false, this.size = 12, this.dot = false});
  final String text;
  final Color bg, border, fg;
  final bool solid, dot;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.symmetric(horizontal: dot ? 11 : 10, vertical: 4.5),
        decoration: BoxDecoration(color: solid ? fg : bg, borderRadius: BorderRadius.circular(20), border: Border.all(color: solid ? Colors.white.withValues(alpha: .6) : border)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dot) Container(width: 8, height: 8, margin: const EdgeInsets.only(right: 6), decoration: const BoxDecoration(color: Color(0xFF2AA0F0), shape: BoxShape.circle)),
          Text(text, style: TextStyle(fontSize: size, fontWeight: FontWeight.w800, color: solid ? Colors.white : fg)),
        ]),
      );
}

/// White header pill with a blue dot: "98 Chips".
class MockBalancePill extends StatelessWidget {
  const MockBalancePill(this.balance, {super.key, this.onTap});
  final int balance;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .85), borderRadius: BorderRadius.circular(20), border: Border.all(color: const Color(0xFFBFE0F5))),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 9, height: 9, margin: const EdgeInsets.only(right: 7), decoration: const BoxDecoration(color: Color(0xFF2AA0F0), shape: BoxShape.circle)),
            Text('$balance Chips', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: _navy)),
          ]),
        ),
      );
}

/// Blue circle with a gold coin: the header logo.
class MockCoinLogo extends StatelessWidget {
  const MockCoinLogo({super.key, this.size = 36, this.icon});
  final double size;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF63C3F6), Color(0xFF1B7FD1)]),
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: const [BoxShadow(color: Color(0x551B7FD1), blurRadius: 8, offset: Offset(0, 3))],
        ),
        child: icon != null
            ? Icon(icon, color: Colors.white, size: size * .5)
            : Container(
                width: size * .56,
                height: size * .56,
                decoration: BoxDecoration(shape: BoxShape.circle, gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFE9A0), Color(0xFFF0A92C)]), border: Border.all(color: const Color(0xFFFFF4CC), width: 1.5)),
                child: Center(child: Container(width: size * .22, height: size * .22, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0xFFC98512), width: 1.2)))),
              ),
      );
}

class ChipsScreen extends StatelessWidget {
  const ChipsScreen({super.key});

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          final s = appState.snap;
          if (s == null) {
            return Center(child: appState.error != null ? const Text('Backend unreachable') : const CircularProgressIndicator());
          }
          final p = s.prediction;
          final confirmed = p?.picks.where((k) => k.status == 'confirmed').toList() ?? [];
          final total = confirmed.fold<int>(0, (a, k) => a + k.amount);
          // Cards share the leftover height, as in the mockup; scrolls when content is taller.
          return LayoutBuilder(
            builder: (context, c) => SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 8),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: c.maxHeight - 18),
                child: IntrinsicHeight(
                  child: Column(children: [
                    if (appState.error != null) _stale(),
                    _header(s),
                    const SizedBox(height: 12),
                    _balance(context, s),
                    const Spacer(),
                    const SizedBox(height: 12),
                    _pool(context, s, p, total),
                    const Spacer(),
                    const SizedBox(height: 12),
                    _flow(context, p, total),
                    const Spacer(),
                    const SizedBox(height: 12),
                    const MockCard(
                      padding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      radius: 20,
                      opacity: .9,
                      child: SizedBox(
                        width: double.infinity,
                        child: Text('🔒 Powered by Capital One Nessie API · Purely fictional sandbox economy', textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF4E7691), height: 1.3)),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          );
        },
      );

  Widget _stale() => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: MockCard(padding: const EdgeInsets.all(8), radius: 14, child: const SizedBox(width: double.infinity, child: Text('Showing last confirmed data', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Aero.orange, fontWeight: FontWeight.w700)))),
      );

  Widget _header(Snapshot s) => MockCard(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        radius: 22,
        child: Row(children: [
          const MockCoinLogo(size: 38),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Text('VibeBet', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: _navy)),
                const SizedBox(width: 8),
                Flexible(child: MockPill('Chips & Pool', bg: const Color(0xFFD8EEFB), border: const Color(0xFFB5DBF2), fg: _blueText, size: 10.5)),
              ]),
              const SizedBox(height: 2),
              const Text('Nessie Sandbox', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: _blueText)),
            ]),
          ),
          MockBalancePill(s.me.balance),
        ]),
      );

  Widget _balance(BuildContext context, Snapshot s) => MockCard(
        onTap: () => _ledgerSheet(context, s),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('PERSONAL SANDBOX BALANCE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _label, letterSpacing: .7)),
          const SizedBox(height: 6),
          Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            Text('${s.me.balance}', style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800, color: _navy, height: 1)),
            const SizedBox(width: 10),
            const Text('Demo Chips', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: _blueText)),
            const Spacer(),
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFFFF1BE), Color(0xFFFFC857)]),
                border: Border.all(color: Colors.white, width: 1.6),
                boxShadow: const [BoxShadow(color: Color(0x44F0A92C), blurRadius: 10, offset: Offset(0, 4))],
              ),
              child: const Icon(Icons.account_balance, color: Color(0xFFC99A3E), size: 24),
            ),
          ]),
          const SizedBox(height: 6),
          Divider(height: 14, color: _label.withValues(alpha: .25)),
          Row(children: [
            Expanded(child: Text('Initial: ${s.me.initial} chips · Staked: ${s.me.staked} chips', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: Color(0xFF2F5F85)))),
            const MockPill('No cash value', bg: Color(0xFFDDF3D3), border: Color(0xFFBFE5AE), fg: Color(0xFF3E9B2B), size: 11),
          ]),
          const SizedBox(height: 8),
          const Center(child: Text('Capital One Nessie Sandbox · Fictional balance · Educational demo', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: _label))),
        ]),
      );

  Widget _pool(BuildContext context, Snapshot s, Prediction? p, int total) => MockCard(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(children: [
          Row(children: [
            Container(width: 12, height: 12, decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xFF7FD3F5), border: Border.all(color: Colors.white, width: 1.5))),
            const SizedBox(width: 8),
            Expanded(child: Text('${s.room.name} Pool', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: _poolTitle))),
            MockPill('$total Chips Total', bg: Colors.white, border: Colors.white, fg: const Color(0xFF78B5E8), solid: true, size: 12),
          ]),
          const SizedBox(height: 10),
          if (p == null || p.picks.isEmpty)
            const Padding(padding: EdgeInsets.all(12), child: Text('No picks in the pool yet.', style: TextStyle(color: _label, fontWeight: FontWeight.w600)))
          else
            for (var i = 0; i < p.picks.length; i++) _row(context, p.picks[i], p, i),
        ]),
      );

  // AL / MY / JD tints from the mockup: blue, green, orange.
  static const _tints = [
    (Color(0xFFD3E8F8), Color(0xFF5B8DB8)),
    (Color(0xFFD0F0D6), Color(0xFF3F9B57)),
    (Color(0xFFFFD9C0), Color(0xFFC46A2F)),
  ];

  Widget _row(BuildContext context, Pick k, Prediction p, int i) {
    final yes = k.choice == 'YES';
    final label = switch (k.status) {
      'pending' => 'Pending',
      'failed' => 'Not recorded',
      _ => '${k.amount} chips → ${k.choice}',
    };
    final ok = k.status == 'confirmed';
    final bg = !ok ? const Color(0xFFE6EEF4) : (yes ? const Color(0xFFD6ECFB) : const Color(0xFFFFD9BD));
    final border = !ok ? const Color(0xFFC3D3DF) : (yes ? const Color(0xFFA9D3F2) : const Color(0xFFF5B98A));
    final fg = !ok ? _label : (yes ? const Color(0xFF2C7BC2) : const Color(0xFFC4561A));
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => showModalBottomSheet(
          context: context,
          builder: (_) => Padding(
            padding: const EdgeInsets.all(20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(k.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(k.status == 'confirmed' ? '${k.name} contributed ${k.amount} fictional chips to prediction ${p.id}.' : 'Entry status: ${k.status}.'),
              Text('Pick: ${k.choice}'),
            ]),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 7, 10, 7),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .72), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white.withValues(alpha: .8))),
          child: Row(children: [
            _avatar(k.name, i, 26),
            const SizedBox(width: 10),
            Expanded(child: Text(k.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: _rowName))),
            MockPill(label, bg: bg, border: border, fg: fg, size: 12),
          ]),
        ),
      ),
    );
  }

  Widget _avatar(String name, int i, double size) {
    final t = _tints[i % _tints.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(shape: BoxShape.circle, color: t.$1, border: Border.all(color: Colors.white, width: 1.6)),
      child: Text(name.isEmpty ? '?' : name.substring(0, name.length >= 2 ? 2 : 1).toUpperCase(), style: TextStyle(fontSize: size * .36, fontWeight: FontWeight.w800, color: t.$2)),
    );
  }

  Widget _flow(BuildContext context, Prediction? p, int total) {
    final pending = p?.picks.where((k) => k.status == 'pending').length ?? 0;
    final hasPicks = p != null && p.picks.isNotEmpty;
    final label = pending > 0 ? 'Transferring ${p?.entryAmount ?? 0} demo chips…' : (hasPicks ? '${p.entryAmount} chips each' : '$total chips recorded');
    final status = pending > 0 ? ('Pending', const Color(0xFFFFE2CC), const Color(0xFFF5B98A), Aero.orange) : (hasPicks ? ('Active', const Color(0xFFCFEFC9), const Color(0xFFB4E2AC), const Color(0xFF2E9E3E)) : ('Idle', const Color(0xFFE6EEF4), const Color(0xFFC3D3DF), _label));
    return MockCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      onTap: () => showModalBottomSheet(
        context: context,
        builder: (_) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Transfer details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            if (p == null || p.picks.isEmpty) const Text('No transfers yet.'),
            for (final k in p?.picks ?? <Pick>[]) Text('${k.name} → Group Pool · ${k.amount} chips · ${k.status}'),
          ]),
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(child: Text('LIVE SIMULATED TRANSFER FLOW', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Color(0xFF2C7BC2), letterSpacing: .3))),
          MockPill(status.$1, bg: status.$2, border: status.$3, fg: status.$4, size: 10.5),
        ]),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .7), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white.withValues(alpha: .9))),
          child: Row(children: [
            SizedBox(
              width: 22.0 * 3 + 12,
              height: 28,
              child: Stack(children: [
                if (hasPicks)
                  for (var i = 0; i < p.picks.take(3).length; i++) Positioned(left: i * 22.0, child: _avatar(p.picks[i].name, i, 28)),
              ]),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(label, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF2F5F85))),
                const SizedBox(height: 3),
                const _Arrow(),
                const SizedBox(height: 3),
                const Text('Simulated Escrow hold', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w500, color: _label)),
              ]),
            ),
            const SizedBox(width: 8),
            Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(11), gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFC6EAFF), Color(0xFF6EC3F5)]), border: Border.all(color: Colors.white, width: 1.4)),
                child: const Icon(Icons.account_balance, size: 20, color: Color(0xFF4A7FA8)),
              ),
              const SizedBox(height: 2),
              const Text('Group Pool', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF3F6E94))),
            ]),
          ]),
        ),
        const SizedBox(height: 8),
        const Center(child: Text('Player Chips → Group Pool · Nessie records simulated transfers', textAlign: TextAlign.center, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: Color(0xFF4E7691)))),
      ]),
    );
  }

  void _ledgerSheet(BuildContext context, Snapshot s) => showModalBottomSheet(
        context: context,
        builder: (_) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Balance details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text('Initial demo balance: ${s.me.initial}'),
            Text('Group-pool contribution: −${s.me.staked}'),
            Text('Current balance: ${s.me.balance}'),
          ]),
        ),
      );
}

/// Thick blue arrow line from the mockup's transfer flow.
class _Arrow extends StatelessWidget {
  const _Arrow();
  @override
  Widget build(BuildContext context) => SizedBox(height: 8, width: double.infinity, child: CustomPaint(painter: _ArrowPainter()));
}

class _ArrowPainter extends CustomPainter {
  @override
  void paint(Canvas c, Size s) {
    final y = s.height / 2;
    final line = Rect.fromLTWH(0, y - 2.5, s.width - 6, 5);
    c.drawRRect(
      RRect.fromRectAndRadius(line, const Radius.circular(3)),
      Paint()..shader = const LinearGradient(colors: [Color(0xFF58BDF5), Color(0xFF0A7ACC)]).createShader(line),
    );
    final head = Path()
      ..moveTo(s.width - 9, y - 4)
      ..lineTo(s.width, y)
      ..lineTo(s.width - 9, y + 4)
      ..close();
    c.drawPath(head, Paint()..color = const Color(0xFF0A7ACC));
  }

  @override
  bool shouldRepaint(_) => false;
}
