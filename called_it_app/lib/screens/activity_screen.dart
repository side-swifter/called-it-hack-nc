import 'package:flutter/material.dart';

import '../app.dart' show goTab;
import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart' show Aero;
import 'chips_screen.dart' show MockBalancePill, MockCard, MockCoinLogo, MockPill;

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});
  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  String filter = 'all';

  String _time(DateTime t) {
    final l = t.toLocal();
    final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
    return '$h:${l.minute.toString().padLeft(2, '0')} ${l.hour >= 12 ? 'PM' : 'AM'}';
  }

  IconData _icon(ActivityItem a) => switch (a.kind) {
        'prediction' => Icons.bolt,
        'chips' => Icons.monetization_on,
        _ => Icons.auto_awesome,
      };

  void _open(ActivityItem a) {
    final id = a.predictionId;
    if (id == null) return;
    final settled = a.text.toLowerCase().contains('settle') || a.text.toLowerCase().contains('result');
    Navigator.pushNamed(context, settled ? '/result' : '/prediction', arguments: id);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          final s = appState.snap;
          if (s == null) return const Center(child: CircularProgressIndicator());
          final items = s.activity.where((a) => filter == 'all' || a.kind == filter).toList();
          return Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
            child: Column(children: [
              MockCard(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                radius: 22,
                child: Row(children: [
                  const MockCoinLogo(size: 38, icon: Icons.bolt),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Activity', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: Color(0xFF1F4E79))),
                      Text('Predictions, chips & agent', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF3B8FD4))),
                    ]),
                  ),
                  MockBalancePill(s.me.balance, onTap: () => goTab(context, 3)),
                ]),
              ),
              if (appState.error != null) const Padding(padding: EdgeInsets.only(top: 8), child: MockPill('Showing last confirmed data', bg: Color(0xFFFFE2CC), border: Color(0xFFF5B98A), fg: Aero.orange)),
              const SizedBox(height: 10),
              Row(children: [
                for (final f in const [('all', 'All'), ('prediction', 'Predictions'), ('chips', 'Chips'), ('agent', 'Agent')])
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => filter = f.$1),
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        padding: const EdgeInsets.symmetric(vertical: 9),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(18),
                          gradient: filter == f.$1 ? const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF4CC3FA), Color(0xFF1E90E0)]) : null,
                          color: filter == f.$1 ? null : Colors.white.withValues(alpha: .62),
                          border: Border.all(color: Colors.white.withValues(alpha: .9), width: 1.2),
                          boxShadow: filter == f.$1 ? const [BoxShadow(color: Color(0x551E90E0), blurRadius: 8, offset: Offset(0, 3))] : null,
                        ),
                        child: Text(f.$2, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: filter == f.$1 ? Colors.white : const Color(0xFF3B8FD4))),
                      ),
                    ),
                  ),
              ]),
              const SizedBox(height: 10),
              Expanded(
                child: items.isEmpty
                    ? const Center(child: MockCard(child: Text('No activity yet. Your group\'s next prediction will appear here.', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF4E7691)))))
                    : ListView.separated(
                        itemCount: items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final a = items[i];
                          final bad = a.status == 'failed' || a.status == 'error';
                          final pending = a.status == 'pending';
                          return MockCard(
                            padding: const EdgeInsets.all(12),
                            radius: 20,
                            onTap: a.predictionId == null ? null : () => _open(a),
                            child: Row(children: [
                              Container(
                                width: 34,
                                height: 34,
                                decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xFFCFEAFB), border: Border.all(color: Colors.white, width: 1.5)),
                                child: Icon(_icon(a), size: 18, color: const Color(0xFF2C7BC2)),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(a.text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: Color(0xFF1F4E79))),
                                  Text(_time(a.at), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Color(0xFF6D8CA8))),
                                ]),
                              ),
                              if (bad || pending) MockPill(bad ? 'Failed' : 'Pending', bg: bad ? const Color(0xFFFFE2CC) : const Color(0xFFD6ECFB), border: bad ? const Color(0xFFF5B98A) : const Color(0xFFA9D3F2), fg: bad ? Aero.orange : const Color(0xFF2C7BC2), size: 11),
                            ]),
                          );
                        },
                      ),
              ),
            ]),
          );
        },
      );
}
