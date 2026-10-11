import 'package:flutter/material.dart';

import '../app.dart' show goTab;
import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/aero.dart';

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
              Glass(
                child: Row(children: [
                  const Expanded(child: Text('Activity', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18))),
                  ChipsBadge(s.me.balance, onTap: () => goTab(context, 3)),
                ]),
              ),
              if (appState.error != null) const Padding(padding: EdgeInsets.only(top: 8), child: Pill('Showing last confirmed data', color: Aero.orange)),
              const SizedBox(height: 10),
              Row(children: [
                for (final f in const [('all', 'All'), ('prediction', 'Predictions'), ('chips', 'Chips'), ('agent', 'Agent')])
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => filter = f.$1),
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          color: filter == f.$1 ? Aero.aqua.withValues(alpha: .5) : Colors.white.withValues(alpha: .5),
                          border: Border.all(color: Colors.white),
                        ),
                        child: Text(f.$2, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: filter == f.$1 ? Aero.skyDeep : Aero.inkSoft)),
                      ),
                    ),
                  ),
              ]),
              const SizedBox(height: 10),
              Expanded(
                child: items.isEmpty
                    ? const Center(child: Glass(child: Text('No activity yet. Your group\'s next prediction will appear here.', textAlign: TextAlign.center)))
                    : ListView.separated(
                        itemCount: items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final a = items[i];
                          final bad = a.status == 'failed' || a.status == 'error';
                          final pending = a.status == 'pending';
                          return Glass(
                            padding: const EdgeInsets.all(12),
                            radius: 18,
                            onTap: a.predictionId == null ? null : () => _open(a),
                            child: Row(children: [
                              Container(
                                width: 34,
                                height: 34,
                                decoration: BoxDecoration(shape: BoxShape.circle, color: Aero.aqua.withValues(alpha: .3), border: Border.all(color: Colors.white)),
                                child: Icon(_icon(a), size: 18, color: Aero.skyDeep),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(a.text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                  Text(_time(a.at), style: const TextStyle(fontSize: 11, color: Aero.inkSoft)),
                                ]),
                              ),
                              if (bad || pending) Pill(bad ? 'Failed' : 'Pending', color: bad ? Aero.orange : Aero.skyDeep),
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
