import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart';
import 'aero.dart';

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

  @override
  Widget build(BuildContext context) {
    final p = widget.prediction;
    final mine = widget.me.myPick;
    final canPick = p.isOpen && mine == null;
    final key = 'select:${p.id}';
    final busy = appState.busy.contains(key);
    Widget side(String c, int pct) {
      final names = _names(c);
      final chosen = (mine ?? _sel) == c;
      final color = c == 'YES' ? Aero.yes : Aero.no;
      return Expanded(
        child: GestureDetector(
          onTap: canPick && !busy ? () => setState(() => _sel = c) : null,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: chosen ? Aero.aqua.withValues(alpha: .35) : Colors.white.withValues(alpha: .45),
              border: Border.all(color: chosen ? color : Colors.white, width: chosen ? 2 : 1),
            ),
            child: Column(children: [
              Text('${chosen && mine != null ? '✓ ' : ''}$c ($pct%)', style: TextStyle(fontWeight: FontWeight.w900, color: chosen ? color : Aero.ink)),
              Text(names.isEmpty ? 'No picks yet' : '${names.join(' & ')} locked', style: const TextStyle(fontSize: 11, color: Aero.inkSoft), textAlign: TextAlign.center),
            ]),
          ),
        ),
      );
    }

    return Glass(
      onTap: widget.onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.bolt, size: 16, color: Aero.orange),
          const SizedBox(width: 4),
          Text(widget.compact ? 'Live Prediction' : 'Live Prediction · ${p.stage.replaceAll('_', ' ')}', style: const TextStyle(fontWeight: FontWeight.w700, color: Aero.inkSoft)),
          const Spacer(),
          GestureDetector(onTap: widget.onPool, child: Pill('Pool: ${p.pool} demo chips')),
        ]),
        const SizedBox(height: 8),
        Text('“${p.question}”', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        Row(children: [side('YES', p.yesPct), const SizedBox(width: 10), side('NO', p.noPct)]),
        if (!widget.compact) ...[
          const SizedBox(height: 10),
          if (mine != null) ...[
            Text('Your pick: $mine', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('${p.entryAmount} demo chips recorded', style: const TextStyle(color: Aero.inkSoft, fontSize: 12)),
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
