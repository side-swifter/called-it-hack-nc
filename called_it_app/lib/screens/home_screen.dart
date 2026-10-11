import 'package:flutter/material.dart';

import '../app.dart';
import '../core/api.dart';
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
                    GestureDetector(onTap: () => goTab(context, 0), child: const Text('CalledIt', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF1B4766)))),
                    const SizedBox(height: 4),
                    Row(children: [
                      Flexible(child: Text(s.room.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                      const SizedBox(width: 6),
                      Pill('AI ${s.room.photon}', color: _c(s.room.photon), dot: true),
                    ]),
                  ]),
                ),
                const SizedBox(width: 6),
                ChipsBadge(s.me.balance, onTap: () => goTab(context, 3)),
                const SizedBox(width: 6),
                GestureDetector(onTap: () => Navigator.pushNamed(context, '/settings'), child: const Icon(Icons.account_circle_outlined, color: Aero.skyDeep, size: 26)),
              ]),
            ),
            if (appState.error != null) const Padding(padding: EdgeInsets.only(top: 8), child: Pill('Showing last confirmed data', color: Aero.orange)),
            const SizedBox(height: 12),
            if (p == null)
              const Glass(child: Center(child: Padding(padding: EdgeInsets.all(12), child: Text('Your AI companion is waiting for the next moment.', textAlign: TextAlign.center))))
            else
              PredictionCard(
                prediction: p,
                me: s.me,
                onPool: () => goTab(context, 3),
                onWhy: () => Navigator.pushNamed(context, '/insights', arguments: p.id),
                onTap: null,
              ),
            const SizedBox(height: 12),
            GlossyButton(label: 'View Room', icon: Icons.chat_bubble_outline, onPressed: () => goTab(context, 1)),
            if (s.me.isHost) ...[
              const SizedBox(height: 10),
              GlossyButton(label: 'Host Controls', icon: Icons.tune, color: Aero.skyDeep, onPressed: () => Navigator.pushNamed(context, '/host')),
            ],
          ]);
        },
      );
}
