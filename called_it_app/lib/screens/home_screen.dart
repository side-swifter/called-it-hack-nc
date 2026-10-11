import 'package:flutter/material.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/aero.dart';
import '../widgets/prediction_card.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Color _c(String s) => s == 'connected' ? Aero.grass : (s == 'connecting' ? Aero.gold : Colors.grey);

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          final s = appState.snap;
          if (s == null) return Center(child: appState.error != null ? Text('Can’t reach the backend', style: const TextStyle(fontWeight: FontWeight.w700)) : const CircularProgressIndicator());
          final p = s.prediction;
          return ListView(padding: const EdgeInsets.all(14), children: [
            Glass(
              child: Row(children: [
                const VbLogo(size: 36),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    GestureDetector(onTap: () => goTab(context, 0), child: const Text('Called It!', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF1B4766)))),
                    const SizedBox(height: 4),
                    Row(children: [
                      Pill('AI ${s.room.photon}', color: _c(s.room.photon), dot: true),
                    ]),
                  ]),
                ),
                const SizedBox(width: 6),
                ChipsBadge(s.me.balance, onTap: () => goTab(context, 2)),
                const SizedBox(width: 6),
                GestureDetector(onTap: () => Navigator.pushNamed(context, '/settings'), child: const Icon(Icons.account_circle_outlined, color: Aero.skyDeep, size: 26)),
              ]),
            ),
            if (appState.error != null) const Padding(padding: EdgeInsets.only(top: 8), child: Pill('Showing last confirmed data', color: Aero.orange)),
            const SizedBox(height: 12),
            if (p != null)
              PredictionCard(
                prediction: p,
                me: s.me,
                onPool: () => goTab(context, 2),
                onWhy: () => Navigator.pushNamed(context, '/insights', arguments: p.id),
                onTap: null,
              ),
            const SizedBox(height: 12),
            _Standings(players: s.players, meId: s.me.id),
            if (s.history.isNotEmpty) ...[const SizedBox(height: 12), _RecentBets(items: s.history)],
            const SizedBox(height: 12),
            if (s.me.isHost) ...[
              const SizedBox(height: 10),
              GlossyButton(label: 'Host Controls', icon: Icons.tune, color: Aero.skyDeep, onPressed: () => Navigator.pushNamed(context, '/host')),
            ],
          ]);
        },
      );
}


const _label = TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF5D7F99), letterSpacing: .7);

class _Standings extends StatelessWidget {
  const _Standings({required this.players, required this.meId});
  final List<Player> players;
  final String meId;
  @override
  Widget build(BuildContext context) {
    final ranked = [...players]..sort((a, b) => b.balance.compareTo(a.balance));
    return Glass(
      radius: 24,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('STANDINGS', style: _label),
        const SizedBox(height: 8),
        if (ranked.isEmpty) const Text('No players yet. Add the bot to your Telegram group and type /bet.'),
        for (var i = 0; i < ranked.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [
              SizedBox(width: 22, child: Text('${i + 1}', style: const TextStyle(fontWeight: FontWeight.w800, color: Aero.inkSoft))),
              Avatar(ranked[i].name, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(ranked[i].id == meId ? '${ranked[i].name} (you)' : ranked[i].name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
                  if (ranked[i].bets > 0) Text('${ranked[i].hits}/${ranked[i].bets} called', style: const TextStyle(fontSize: 11, color: Aero.inkSoft)),
                ]),
              ),
              Text('${ranked[i].balance} chips', style: const TextStyle(fontWeight: FontWeight.w800, color: Aero.skyDeep)),
            ]),
          ),
      ]),
    );
  }
}

class _RecentBets extends StatelessWidget {
  const _RecentBets({required this.items});
  final List<HistoryItem> items;
  @override
  Widget build(BuildContext context) => Glass(
        radius: 24,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('RECENT BETS', style: _label),
          const SizedBox(height: 8),
          for (final h in items.take(5))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Avatar(h.target, size: 28),
                const SizedBox(width: 10),
                Expanded(child: Text('${h.target} · ${h.item}', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
                Pill(h.hit ? 'Called it' : 'Missed', color: h.hit ? Aero.grass : Aero.orange),
              ]),
            ),
        ]),
      );
}
