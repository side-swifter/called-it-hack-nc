import 'package:flutter/material.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/aero.dart';

class ResultScreen extends StatelessWidget {
  const ResultScreen({super.key, this.predictionId});
  final String? predictionId;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: AeroBackground(
          variant: 3,
          child: ListenableBuilder(
            listenable: appState,
            builder: (context, _) {
              final s = appState.snap;
              final r = s?.result;
              if (s == null) return const Center(child: CircularProgressIndicator());
              if (r == null || (predictionId != null && r.predictionId != predictionId)) {
                return Center(child: Glass(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('No settled result yet.'),
                  const SizedBox(height: 8),
                  GlossyButton(label: 'Back to Home', onPressed: () => _back(context, 0)),
                ])));
              }
              final done = r.nessieOk;
              final yes = r.outcome == 'YES';
              final c = yes ? Aero.yes : Aero.no;
              return ListView(padding: const EdgeInsets.fromLTRB(14, 14, 14, 18), children: [
                if (appState.error != null)
                  const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('Showing last confirmed data', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
                Glass(
                  radius: 24,
                  padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
                  child: Row(children: [
                    GestureDetector(
                      onTap: () => Navigator.maybePop(context),
                      behavior: HitTestBehavior.opaque,
                      child: const Padding(padding: EdgeInsets.symmetric(horizontal: 4), child: Icon(Icons.arrow_back_ios_new, size: 15, color: _ink)),
                    ),
                    const _SparkIcon(),
                    const SizedBox(width: 11),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Settlement & Result', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: _ink)),
                      const SizedBox(height: 2),
                      Text('${s.room.name} #alpha', style: const TextStyle(fontSize: 11, color: _muted, fontWeight: FontWeight.w500)),
                    ])),
                    _StatusPill(done ? 'Settled' : 'Processing', done ? const Color(0xFF22A845) : Aero.orange),
                  ]),
                ),
                const SizedBox(height: 14),
                Glass(
                  radius: 28,
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                  child: Column(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: .6), borderRadius: BorderRadius.circular(14), border: Border.all(color: Aero.sky.withValues(alpha: .18))),
                      child: const Text('RESULT CONFIRMED', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _muted, letterSpacing: .8)),
                    ),
                    const SizedBox(height: 12),
                    _headline(r.headline),
                    const SizedBox(height: 14),
                    Container(
                      width: 168,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color.lerp(c, Colors.white, .3)!, c, Color.lerp(c, Colors.black, .18)!], stops: const [0, .5, 1]),
                        border: Border.all(color: Colors.white.withValues(alpha: .85), width: 1.5),
                        boxShadow: [BoxShadow(color: c.withValues(alpha: .45), blurRadius: 14, offset: const Offset(0, 5))],
                      ),
                      child: Column(children: [
                        Text('${yes ? '✓' : '✕'} ${r.outcome}', style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, height: 1.1)),
                        const SizedBox(height: 2),
                        const Text('WINNING PICK', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: .8)),
                      ]),
                    ),
                    const SizedBox(height: 14),
                    done
                        ? Text.rich(TextSpan(style: const TextStyle(fontSize: 12.5, color: _slate, fontWeight: FontWeight.w500), children: [
                            const TextSpan(text: 'Pool Payout: '),
                            TextSpan(text: '${r.pool} chips distributed', style: const TextStyle(fontWeight: FontWeight.w800, color: Aero.skyDeep)),
                          ]))
                        : const Text('Settlement processing', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Aero.orange)),
                  ]),
                ),
                const SizedBox(height: 14),
                Glass(
                  radius: 24,
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                  child: Column(children: [
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 2),
                      child: Row(children: [
                        Expanded(child: Text('PARTICIPANTS', style: _caps)),
                        Text('OUTCOME & BALANCE', style: _caps),
                      ]),
                    ),
                    for (final row in r.rows) _row(context, row, done),
                  ]),
                ),
                const SizedBox(height: 14),
                Glass(
                  radius: 22,
                  padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
                  child: Row(children: [
                    const _SparkIcon(size: 36),
                    const SizedBox(width: 11),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Photon AI Announcement', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Aero.skyDeep)),
                      const SizedBox(height: 3),
                      Text('“${r.announcement}”', style: const TextStyle(fontSize: 13, color: _ink, fontWeight: FontWeight.w500, height: 1.3)),
                      const SizedBox(height: 3),
                      Text(_status(r.announcementStatus), style: const TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w600)),
                    ])),
                  ]),
                ),
                const SizedBox(height: 12),
                Glass(
                  radius: 18,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Flexible(child: _badge('Snowflake', Icons.ac_unit, r.snowflakeOk, 'predicted', 'pending')),
                    const _Dot(),
                    Flexible(child: _badge('Nessie', Icons.account_balance, r.nessieOk, 'settled', 'processing')),
                    const _Dot(),
                    Flexible(child: _badge('Photon', Icons.chat_bubble_outline, r.photonOk, 'broadcast', r.announcementStatus)),
                  ]),
                ),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: _Mini(label: 'Home', onTap: () => _back(context, 0))),
                  const SizedBox(width: 8),
                  Expanded(child: _Mini(label: 'Activity', onTap: () => _back(context, 1))),
                  const SizedBox(width: 8),
                  Expanded(child: _Mini(label: 'Transfers', onTap: () => _ledger(context, r))),
                ]),
              ]);
            },
          ),
        ),
      );

  // Underlines the quoted phrase in the headline (e.g. ‘ship it’), as in the design.
  Widget _headline(String h) {
    const base = TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _slate, height: 1.3);
    final m = RegExp("[‘'’“\"]([^‘'’”\"]{1,40})[’'’”\"]").firstMatch(h);
    if (m == null) return Text('“$h”', textAlign: TextAlign.center, style: base);
    return Text.rich(
      TextSpan(style: base, children: [
        TextSpan(text: '“${h.substring(0, m.start)}'),
        TextSpan(text: h.substring(m.start, m.end), style: const TextStyle(color: Aero.skyDeep, decoration: TextDecoration.underline, decorationColor: Aero.skyDeep)),
        TextSpan(text: '${h.substring(m.end)}”'),
      ]),
      textAlign: TextAlign.center,
    );
  }

  void _back(BuildContext context, int tab) {
    Navigator.of(context).popUntil((r) => r.isFirst);
    final s = context.findAncestorStateOfType<ShellState>();
    s?.go(tab);
  }

  String _status(String s) => switch (s) {
        'delivered' => 'Delivered',
        'sending' => 'Sending…',
        'failed' => 'Delivery failed',
        _ => 'Preparing',
      };

  Widget _badge(String name, IconData icon, bool ok, String good, String bad) {
    final color = ok ? _slate : Aero.orange;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 11, color: ok ? Aero.skyDeep : Aero.orange),
      const SizedBox(width: 3),
      Flexible(child: Text(ok ? '$name $good' : '$name: $bad', overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color))),
    ]);
  }

  Widget _row(BuildContext context, ResultRow row, bool done) {
    final good = row.correct;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => showModalBottomSheet(
          context: context,
          builder: (_) => Padding(
            padding: const EdgeInsets.all(20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(row.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text('Selection: ${row.choice}'),
              Text('Contribution: ${row.contributed} chips'),
              Text(row.payout > 0 ? 'Distribution: ${row.payout} chips' : 'No distribution'),
              Text('Net change: ${row.payout - row.contributed >= 0 ? '+' : ''}${row.payout - row.contributed} chips'),
              Text('Final balance: ${row.balance} chips'),
            ]),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .62), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white.withValues(alpha: .9))),
          child: Row(children: [
            Avatar(row.name, size: 34),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(row.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: _slate)),
              const SizedBox(height: 1),
              Text(good ? 'Correct (+${row.payout} chips)' : 'Not this time (0)', style: TextStyle(fontSize: 10.5, color: good ? const Color(0xFF22A845) : const Color(0xFFD9651A), fontWeight: FontWeight.w700)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('${row.balance} chips', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: _slate)),
              const SizedBox(height: 1),
              Text(!done ? 'Settlement processing' : (good ? 'Nessie updated' : 'No distribution'), style: const TextStyle(fontSize: 9.5, color: _muted, fontWeight: FontWeight.w600)),
            ]),
          ]),
        ),
      ),
    );
  }

  void _ledger(BuildContext context, Result r) => showModalBottomSheet(
        context: context,
        builder: (_) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Settlement ledger', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text('Total pool: ${r.pool} chips · Outcome: ${r.outcome}'),
            for (final row in r.rows) Text('${row.name}: −${row.contributed} in, +${row.payout} out → ${row.balance}'),
          ]),
        ),
      );
}

const _ink = Color(0xFF1B3A57);
const _slate = Color(0xFF4A6178);
const _muted = Color(0xFF7A97AD);
const _caps = TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _muted, letterSpacing: .6);

class _SparkIcon extends StatelessWidget {
  const _SparkIcon({this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const RadialGradient(center: Alignment(-.3, -.4), colors: [Color(0xFF7FD2FF), Aero.sky, Aero.skyDeep]),
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: const [BoxShadow(color: Color(0x5545D0F0), blurRadius: 8)],
        ),
        child: Icon(Icons.auto_awesome, color: Aero.gold, size: size * .5),
      );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.text, this.color);
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(color: color.withValues(alpha: .16), borderRadius: BorderRadius.circular(16), border: Border.all(color: color.withValues(alpha: .4))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 6, height: 6, margin: const EdgeInsets.only(right: 5), decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 11)),
        ]),
      );
}

class _Dot extends StatelessWidget {
  const _Dot();
  @override
  Widget build(BuildContext context) => Container(width: 3.5, height: 3.5, margin: const EdgeInsets.symmetric(horizontal: 7), decoration: const BoxDecoration(color: _muted, shape: BoxShape.circle));
}

class _Mini extends StatelessWidget {
  const _Mini({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .6), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withValues(alpha: .9))),
          child: Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Aero.skyDeep)),
        ),
      );
}
