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
          if (s == null) {
            if (appState.error == null) return const Center(child: CircularProgressIndicator());
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Glass(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text('Can’t reach the backend', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 8),
                    Text('Trying $apiBase', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12)),
                    const SizedBox(height: 6),
                    Text('${appState.error}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, color: Aero.inkSoft)),
                    const SizedBox(height: 12),
                    GlossyButton(label: 'Retry', onPressed: appState.refresh),
                  ]),
                ),
              ),
            );
          }
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
            if (s.dare != null && s.dare!.lastPlaceName != null) ...[const SizedBox(height: 12), _DareCard(dare: s.dare!)],
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


class _DareCard extends StatelessWidget {
  const _DareCard({required this.dare});
  final Dare dare;

  String _when(DateTime t) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final m = t.minute.toString().padLeft(2, '0');
    return '${days[t.weekday - 1]} $h:$m ${t.hour >= 12 ? 'PM' : 'AM'}';
  }

  String _countdown(DateTime t) {
    final d = t.difference(DateTime.now());
    if (d.isNegative) return 'any moment now';
    if (d.inDays >= 1) return 'in ${d.inDays}d ${d.inHours % 24}h';
    if (d.inHours >= 1) return 'in ${d.inHours}h ${d.inMinutes % 60}m';
    return 'in ${d.inMinutes}m';
  }

  @override
  Widget build(BuildContext context) {
    final next = dare.nextAt;
    return Glass(
      radius: 24,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Text('WEEKLY DARE', style: _label),
          const Spacer(),
          if (next != null) Pill('${_when(next)} · ${_countdown(next)}', color: Aero.orange),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Avatar(dare.lastPlaceName ?? '', size: 34),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${dare.lastPlaceName} is in last place', style: const TextStyle(fontWeight: FontWeight.w800)),
              Text('${dare.lastPlaceBalance} chips · gets the dare', style: const TextStyle(fontSize: 11, color: Aero.inkSoft)),
            ]),
          ),
        ]),
        if (dare.text != null && dare.text!.isNotEmpty) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: .55), borderRadius: BorderRadius.circular(14)),
            child: Text('${dare.name != null ? '${dare.name}: ' : ''}${dare.text}', style: const TextStyle(fontSize: 12.5, height: 1.35)),
          ),
        ],
      ]),
    );
  }
}
