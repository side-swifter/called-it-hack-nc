import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart';
import 'aero.dart';

/// Blue gradient round "VB" logo used in the Room/Home headers.
class VbLogo extends StatelessWidget {
  const VbLogo({super.key, this.size = 36});
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(width: size, height: size, child: Image.asset('assets/brand/logo.png', fit: BoxFit.contain, filterQuality: FilterQuality.high));
}

/// Live prediction card. Shows YES/NO controls when open and the player has no pick;
/// otherwise shows the confirmed pick. [compact] is the embedded Room variant (no confirm button).
class PredictionCard extends StatefulWidget {
  const PredictionCard({super.key, required this.prediction, required this.me, this.compact = false, this.onTap, this.onPool, this.onWhy});
  final Prediction prediction;
  final Me me;
  final bool compact;
  final VoidCallback? onTap, onPool, onWhy;
  @override
  State<PredictionCard> createState() => _PredictionCardState();
}

class _PredictionCardState extends State<PredictionCard> {
  String? _sel;
  String? _err;

  Future<void> _confirm() async {
    final key = 'select:${widget.prediction.id}';
    final e = await appState.post(key, '/api/predictions/${widget.prediction.id}/select', {'choice': _sel});
    if (mounted) setState(() => _err = e == null ? null : "Your selection wasn't recorded. Please try again.");
  }

  List<String> _names(String c) => [for (final p in widget.prediction.picks) if (p.choice == c && p.status == 'confirmed') p.name];

  /// Question in quotes; a phrase in single quotes is shown as a blue underlined link-style highlight.
  List<InlineSpan> _question(String q) {
    const base = TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: Color(0xFF3F5F7A), height: 1.35);
    final m = RegExp('[\'‘]([^\'’]+)[\'’]').firstMatch(q);
    if (m == null) return [TextSpan(text: '“$q”', style: base)];
    return [
      TextSpan(text: '“${q.substring(0, m.start)}', style: base),
      TextSpan(
        text: '‘${m.group(1)}’',
        style: base.copyWith(color: Aero.sky, decoration: TextDecoration.underline, decorationColor: Aero.sky),
      ),
      TextSpan(text: '${q.substring(m.end)}”', style: base),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.prediction;
    final mine = widget.me.myPick;
    final canPick = p.isOpen && mine == null;
    final key = 'select:${p.id}';
    final busy = appState.busy.contains(key);
    final yesN = _names('YES').length, noN = _names('NO').length;
    // Highlighted side: your pick, else your pending selection, else (embedded view) the side with more locked picks.
    final String? lead = yesN == noN ? null : (yesN > noN ? 'YES' : 'NO');
    final String? hi = mine ?? _sel ?? (widget.compact ? lead : null);

    Widget side(String c, int pct) {
      final names = _names(c);
      final chosen = hi == c;
      final showTick = chosen && (mine != null || (widget.compact && _sel == null));
      return Expanded(
        child: GestureDetector(
          onTap: canPick && !busy ? () => setState(() => _sel = c) : null,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              gradient: chosen
                  ? const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFD4EEFF), Color(0xFFB4E0FA)])
                  : LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white.withValues(alpha: .62), Colors.white.withValues(alpha: .38)]),
              border: Border.all(color: chosen ? const Color(0xFF8DD0F5) : Colors.white.withValues(alpha: .9), width: 1.2),
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('${showTick ? '✓ ' : ''}$c ($pct%)', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: chosen ? const Color(0xFF14527F) : const Color(0xFF3F5F7A))),
              const SizedBox(height: 1),
              Text(names.isEmpty ? 'No picks yet' : '${names.join(' & ')} locked', style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: Aero.inkSoft), textAlign: TextAlign.center),
            ]),
          ),
        ),
      );
    }

    return Glass(
      onTap: widget.onTap,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.bolt, size: 14, color: Color(0xFFF2994A)),
          const SizedBox(width: 4),
          Flexible(child: Text(widget.compact ? 'Live Prediction' : 'Live Prediction · ${p.stage.replaceAll('_', ' ')}', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Aero.inkSoft))),
          const Spacer(),
          GestureDetector(
            onTap: widget.onPool,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(color: const Color(0xFFD7EEFB), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFB5DDF5))),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('Pool: ${p.pool} chips', style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: Aero.skyDeep)),
                const SizedBox(width: 4),
                Container(width: 8, height: 8, decoration: const BoxDecoration(shape: BoxShape.circle, color: Aero.gold)),
              ]),
            ),
          ),
        ]),
        const SizedBox(height: 7),
        Text.rich(TextSpan(children: _question(p.question))),
        const SizedBox(height: 9),
        Row(children: [side('YES', p.yesPct), const SizedBox(width: 9), side('NO', p.noPct)]),
        if (!widget.compact) ...[
          const SizedBox(height: 10),
          if (mine != null) ...[
            Text('Your pick: $mine', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('${p.entryAmount} chips recorded', style: const TextStyle(color: Aero.inkSoft, fontSize: 12)),
          ] else if (canPick) ...[
            GlossyButton(label: 'Confirm Pick', icon: Icons.check, loading: busy, onPressed: _sel == null ? null : _confirm),
            if (_err != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_err!, style: const TextStyle(color: Colors.red, fontSize: 12))),
          ] else
            const Text('Selections are closed.', style: TextStyle(color: Aero.inkSoft)),
          if (widget.onWhy != null)
            TextButton.icon(onPressed: widget.onWhy, icon: const Icon(Icons.psychology_alt_outlined, size: 16), label: const Text('Why this prediction?')),
        ],
      ]),
    );
  }
}
