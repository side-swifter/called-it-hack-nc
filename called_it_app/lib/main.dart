import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

// Served by the bot itself on port 8787. Override with --dart-define=API=http://host:8787
const _apiOverride = String.fromEnvironment('API');

String get apiBase {
  if (_apiOverride.isNotEmpty) return _apiOverride;
  if (kIsWeb && Uri.base.port == 8787) return Uri.base.origin;
  return 'http://192.168.1.228:8787';
}

void main() => runApp(const CalledItApp());

const bg = Color(0xFF0E0F13);
const card = Color(0xFF181A21);
const accent = Color(0xFFFFC53D);
const muted = Color(0xFF8A8F9C);

class CalledItApp extends StatelessWidget {
  const CalledItApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Called It',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          brightness: Brightness.dark,
          scaffoldBackgroundColor: bg,
          colorScheme: const ColorScheme.dark(primary: accent),
          fontFamily: 'Roboto',
        ),
        home: const LeaderboardPage(),
      );
}

class Player {
  Player(this.rank, this.name, this.chips);
  final int rank;
  final String name;
  final int chips;
}

class ResultItem {
  ResultItem(this.target, this.item, this.winners, this.losers, this.pot);
  final String target;
  final String item;
  final List<String> winners;
  final List<String> losers;
  final int pot;
}

class Board {
  Board(this.players, this.pot, this.liveStakes, this.livePlayers, this.results);
  final List<Player> players;
  final int pot;
  final int? liveStakes;
  final int? livePlayers;
  final List<ResultItem> results;

  factory Board.fromJson(Map<String, dynamic> j) {
    final live = j['live'] as Map<String, dynamic>?;
    return Board(
      [for (final p in j['players'] as List) Player(p['rank'], p['name'], (p['chips'] as num).round())],
      (j['pot'] as num).round(),
      live?['stakes'],
      live?['players'],
      [
        for (final r in j['results'] as List)
          ResultItem(r['target'], r['item'], List<String>.from(r['winners']), List<String>.from(r['losers']),
              (r['pot'] as num).round())
      ],
    );
  }
}

class LeaderboardPage extends StatefulWidget {
  const LeaderboardPage({super.key});

  @override
  State<LeaderboardPage> createState() => _LeaderboardPageState();
}

class _LeaderboardPageState extends State<LeaderboardPage> {
  Board? board;
  String? error;
  Timer? timer;

  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 3), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final res = await http.get(Uri.parse('$apiBase/api/leaderboard')).timeout(const Duration(seconds: 5));
      final b = Board.fromJson(jsonDecode(res.body));
      if (mounted) setState(() { board = b; error = null; });
    } catch (e) {
      if (mounted) setState(() => error = "can't reach the bot at $apiBase");
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = board;
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
            children: [
              Row(children: [
                const Text('🎯', style: TextStyle(fontSize: 28)),
                const SizedBox(width: 10),
                const Text('Called It', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                const Spacer(),
                if (b?.liveStakes != null) _LivePill(stakes: b!.liveStakes!, players: b.livePlayers ?? 0),
              ]),
              const SizedBox(height: 4),
              const Text('chip leaderboard', style: TextStyle(color: muted)),
              if (error != null) _Banner(error!),
              const SizedBox(height: 16),
              if (b == null && error == null) const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator())),
              if (b != null) ...[
                if (b.players.length >= 3) _Podium(players: b.players.take(3).toList()),
                const SizedBox(height: 12),
                if (b.players.isEmpty) const _Empty() else ...[
                  for (final p in b.players) _Row(p: p, max: b.players.first.chips == 0 ? 1 : b.players.first.chips),
                ],
                if (b.pot > 0) _PotCard(chips: b.pot),
                if (b.results.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const Text('Recent bets', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  for (final r in b.results) _ResultCard(r: r),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LivePill extends StatelessWidget {
  const _LivePill({required this.stakes, required this.players});
  final int stakes;
  final int players;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: const Color(0x33FF4D4D), borderRadius: BorderRadius.circular(20)),
        child: Text('● bet live · $stakes/$players staked', style: const TextStyle(color: Color(0xFFFF6B6B), fontWeight: FontWeight.w600)),
      );
}

class _Banner extends StatelessWidget {
  const _Banner(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0x33FF4D4D), borderRadius: BorderRadius.circular(12)),
        child: Text(text),
      );
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: Text('no players yet — type /bet in the group', style: TextStyle(color: muted))),
      );
}

String _initial(String n) => n.isEmpty ? '?' : n.characters.first.toUpperCase();

class _Podium extends StatelessWidget {
  const _Podium({required this.players});
  final List<Player> players;
  @override
  Widget build(BuildContext context) {
    final order = [players[1], players[0], players[2]];
    final heights = [90.0, 120.0, 70.0];
    final medals = ['🥈', '🥇', '🥉'];
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (var i = 0; i < 3; i++)
          Expanded(
            child: Column(children: [
              Text(medals[i], style: const TextStyle(fontSize: 26)),
              Text(order[i].name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('${order[i].chips}', style: const TextStyle(color: accent, fontWeight: FontWeight.w800, fontSize: 18)),
              const SizedBox(height: 6),
              Container(
                height: heights[i],
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: i == 1 ? accent : card,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                ),
                alignment: Alignment.center,
                child: Text('#${order[i].rank}',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: i == 1 ? Colors.black : muted)),
              ),
            ]),
          ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.p, required this.max});
  final Player p;
  final int max;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14)),
        child: Column(children: [
          Row(children: [
            SizedBox(width: 28, child: Text('${p.rank}', style: const TextStyle(color: muted, fontWeight: FontWeight.w700))),
            CircleAvatar(backgroundColor: accent, foregroundColor: Colors.black, child: Text(_initial(p.name))),
            const SizedBox(width: 12),
            Expanded(child: Text(p.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
            Text('${p.chips}', style: const TextStyle(color: accent, fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(width: 4),
            const Text('chips', style: TextStyle(color: muted)),
          ]),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: (p.chips / max).clamp(0.02, 1.0), minHeight: 6, backgroundColor: bg, color: accent),
          ),
        ]),
      );
}

class _PotCard extends StatelessWidget {
  const _PotCard({required this.chips});
  final int chips;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: const Color(0x22FFC53D), borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          const Text('🏦', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          const Expanded(child: Text('left in the pot')),
          Text('$chips chips', style: const TextStyle(color: accent, fontWeight: FontWeight.w800)),
        ]),
      );
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.r});
  final ResultItem r;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${r.target} called it — ${r.item}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          if (r.winners.isNotEmpty) Text('🏆 ${r.winners.join(', ')}', style: const TextStyle(color: Color(0xFF6EE7A0))),
          if (r.losers.isNotEmpty) Text('💀 ${r.losers.join(', ')}', style: const TextStyle(color: Color(0xFFFF8A8A))),
          Text('pot ${r.pot} chips', style: const TextStyle(color: muted)),
        ]),
      );
}
