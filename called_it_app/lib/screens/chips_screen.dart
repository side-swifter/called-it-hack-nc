import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/aero.dart';

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
          return ListView(padding: const EdgeInsets.fromLTRB(14, 8, 14, 8), children: [
            if (appState.error != null) _stale(),
            Glass(
              radius: 22,
              child: Row(children: [
                const Icon(Icons.account_balance, color: Aero.skyDeep),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('CalledIt', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                    Text('Chips & Pool · Nessie Sandbox', style: TextStyle(fontSize: 12, color: Aero.inkSoft)),
                  ]),
                ),
                ChipsBadge(s.me.balance),
              ]),
            ),
            const SizedBox(height: 12),
            Glass(
              onTap: () => _ledgerSheet(context, s),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('PERSONAL SANDBOX BALANCE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Aero.inkSoft, letterSpacing: .6)),
                const SizedBox(height: 6),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('${s.me.balance}', style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w900)),
                  const SizedBox(width: 8),
                  const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('Demo Chips', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Aero.skyDeep))),
                  const Spacer(),
                  const Icon(Icons.savings, size: 38, color: Aero.gold),
                ]),
                const Divider(),
                Row(children: [
                  Expanded(child: Text('Initial: ${s.me.initial} chips · Staked: ${s.me.staked} chips', style: const TextStyle(fontSize: 12))),
                  const Pill('No cash value', color: Aero.grass),
                ]),
                const SizedBox(height: 6),
                const Center(child: Text('Capital One Nessie Sandbox · Fictional balance', style: TextStyle(fontSize: 11, color: Aero.inkSoft))),
              ]),
            ),
            const SizedBox(height: 12),
            Glass(
              child: Column(children: [
                Row(children: [
                  const Icon(Icons.circle, size: 10, color: Aero.aqua),
                  const SizedBox(width: 8),
                  Expanded(child: Text('${s.room.name} Pool', style: const TextStyle(fontWeight: FontWeight.w800))),
                  Pill('$total Chips Total', color: Aero.skyDeep),
                ]),
                const SizedBox(height: 8),
                if (p == null || p.picks.isEmpty)
                  const Padding(padding: EdgeInsets.all(12), child: Text('No picks in the pool yet.', style: TextStyle(color: Aero.inkSoft)))
                else
                  for (final k in p.picks) _row(context, k, p),
              ]),
            ),
            const SizedBox(height: 12),
            _flow(context, s, p, total),
            const SizedBox(height: 12),
            const Glass(
              padding: EdgeInsets.all(10),
              child: Text('Powered by Capital One Nessie Sandbox\nFictional chips · No cash value', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Aero.inkSoft)),
            ),
          ]);
        },
      );

  Widget _stale() => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Glass(padding: const EdgeInsets.all(8), radius: 14, child: const Text('Showing last confirmed data', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Aero.orange, fontWeight: FontWeight.w700))),
      );

  Widget _row(BuildContext context, Pick k, Prediction p) {
    final yes = k.choice == 'YES';
    final c = yes ? Aero.yes : Aero.no;
    final label = switch (k.status) {
      'pending' => 'Pending',
      'failed' => 'Not recorded',
      _ => '${k.amount} chips → ${k.choice}',
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
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
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: Colors.white54, borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            Avatar(k.name),
            const SizedBox(width: 10),
            Expanded(child: Text(k.name, style: const TextStyle(fontWeight: FontWeight.w800))),
            Pill(label, color: k.status == 'confirmed' ? c : Aero.inkSoft),
          ]),
        ),
      ),
    );
  }

  Widget _flow(BuildContext context, Snapshot s, Prediction? p, int total) {
    final pending = p?.picks.where((k) => k.status == 'pending').length ?? 0;
    final active = pending > 0;
    return Glass(
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
          const Expanded(child: Text('TRANSFER FLOW', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Aero.skyDeep))),
          Pill(active ? 'Pending' : 'Idle', color: active ? Aero.orange : Aero.grass),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          if (p != null) ...[for (final k in p.picks.take(3)) Padding(padding: const EdgeInsets.only(right: 4), child: Avatar(k.name, size: 30))],
          Expanded(
            child: Column(children: [
              Text(active ? 'Transferring ${p?.entryAmount ?? 0} demo chips…' : '$total chips recorded', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
              Container(height: 4, margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 6), decoration: BoxDecoration(color: Aero.sky, borderRadius: BorderRadius.circular(4))),
            ]),
          ),
          const Icon(Icons.account_balance, color: Aero.skyDeep, size: 30),
        ]),
        const Center(child: Text('Group Pool · Nessie records sandbox transfers', style: TextStyle(fontSize: 11, color: Aero.inkSoft))),
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
