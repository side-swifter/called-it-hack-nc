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
          variant: 1,
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
                  GlossyButton(label: 'Back to Room', onPressed: () => _back(context, 1)),
                ])));
              }
              final done = r.nessieOk;
              final yes = r.outcome == 'YES';
              final c = yes ? Aero.yes : Aero.no;
              return ListView(padding: const EdgeInsets.all(14), children: [
                if (appState.error != null)
                  const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('Showing last confirmed data', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
                Glass(
                  child: Row(children: [
                    const Avatar('', agent: true, size: 40),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Settlement & Result', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                      Text(s.room.name, style: const TextStyle(fontSize: 12, color: Aero.inkSoft)),
                    ])),
                    Pill(done ? 'Settled' : 'Processing', color: done ? Aero.grass : Aero.orange, dot: true),
                  ]),
                ),
                const SizedBox(height: 12),
                Glass(
                  child: Column(children: [
                    const Pill('RESULT CONFIRMED'),
                    const SizedBox(height: 10),
                    Text('“${r.headline}”', textAlign: TextAlign.center, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 14),
                    GlossyButton(label: '${yes ? '✓' : '✕'} ${r.outcome}  ·  WINNING PICK', color: c),
                    const SizedBox(height: 12),
                    Text(done ? 'Pool Payout: ${r.pool} demo chips distributed' : 'Settlement processing', style: const TextStyle(fontWeight: FontWeight.w700, color: Aero.skyDeep)),
                  ]),
                ),
                const SizedBox(height: 12),
                Glass(
                  child: Column(children: [
                    const Row(children: [
                      Expanded(child: Text('PARTICIPANTS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Aero.inkSoft))),
                      Text('OUTCOME & BALANCE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Aero.inkSoft)),
                    ]),
                    for (final row in r.rows) _row(context, row),
                  ]),
                ),
                const SizedBox(height: 12),
                Glass(
                  child: Row(children: [
                    const Avatar('', agent: true),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Photon AI Announcement', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Aero.skyDeep)),
                      Text('“${r.announcement}”'),
                      Text(_status(r.announcementStatus), style: const TextStyle(fontSize: 11, color: Aero.inkSoft)),
                    ])),
                  ]),
                ),
                const SizedBox(height: 12),
                Glass(
                  padding: const EdgeInsets.all(10),
                  child: Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 4, children: [
                    _badge('Snowflake', r.snowflakeOk, 'predicted', 'pending'),
                    _badge('Nessie', r.nessieOk, 'settled', 'settlement processing'),
                    _badge('Photon', r.photonOk, 'broadcast', 'announcement ${r.announcementStatus}'),
                  ]),
                ),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: GlossyButton(label: 'Back to Room', onPressed: () => _back(context, 1))),
                  const SizedBox(width: 8),
                  Expanded(child: GlossyButton(label: 'Activity', color: Aero.skyDeep, onPressed: () => _back(context, 2))),
                ]),
                const SizedBox(height: 8),
                GlossyButton(label: 'View Transfer Details', icon: Icons.receipt_long, color: Aero.inkSoft, onPressed: () => _ledger(context, r)),
              ]);
            },
          ),
        ),
      );

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

  Widget _badge(String name, bool ok, String good, String bad) => Pill(ok ? '$name $good' : '$name: $bad', color: ok ? Aero.grass : Aero.orange);

  Widget _row(BuildContext context, ResultRow row) {
    final c = row.correct ? Aero.grass : Aero.no;
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
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: Colors.white54, borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            Avatar(row.name),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(row.name, style: const TextStyle(fontWeight: FontWeight.w800)),
              Text(row.correct ? 'Correct (+${row.payout} chips)' : 'Not this time · No distribution', style: TextStyle(fontSize: 12, color: c, fontWeight: FontWeight.w700)),
            ])),
            Text('${row.balance} chips', style: const TextStyle(fontWeight: FontWeight.w900)),
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
