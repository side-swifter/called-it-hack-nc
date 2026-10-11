import 'package:flutter/material.dart';

import 'core/api.dart';
import 'core/theme.dart';
import 'screens/activity_screen.dart';
import 'screens/chips_screen.dart';
import 'screens/home_screen.dart';
import 'screens/host_screen.dart';
import 'screens/result_screen.dart';
import 'screens/room_screen.dart';
import 'screens/secondary_screens.dart';
import 'widgets/aero.dart';

class CalledItApp extends StatelessWidget {
  const CalledItApp({super.key});
  @override
  Widget build(BuildContext context) {
    appState.start();
    return MaterialApp(
      title: 'CalledIt',
      debugShowCheckedModeBanner: false,
      theme: aeroTheme(),
      home: const Shell(),
      // Secondary screens are pushed on top of the shell (no tab of their own).
      onGenerateRoute: (s) {
        final Widget? w = switch (s.name) {
          '/host' => const HostScreen(),
          '/result' => ResultScreen(predictionId: s.arguments as String?),
          '/insights' => InsightsScreen(predictionId: s.arguments as String?),
          '/prediction' => PredictionDetailsScreen(predictionId: s.arguments as String?),
          '/settings' => const SettingsScreen(),
          '/green' => const GreenMomentsScreen(),
          _ => null,
        };
        return w == null ? null : MaterialPageRoute(builder: (_) => w, settings: s);
      },
    );
  }
}

/// Tab shell. Other screens switch tabs with `ShellTabs.of(context).go(i)`.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => ShellState();
}

class ShellState extends State<Shell> {
  int index = 0; // 0 Home, 1 Room, 2 Activity, 3 Chips
  void go(int i) => setState(() => index = i);

  @override
  Widget build(BuildContext context) {
    const pages = [HomeScreen(), RoomScreen(), ActivityScreen(), ChipsScreen()];
    return Scaffold(
      body: AeroBackground(
        variant: index == 2 ? 1 : 0,
        child: Column(children: [
          Expanded(child: IndexedStack(index: index, children: pages)),
          _NavBar(index: index, onTap: go),
        ]),
      ),
    );
  }
}

class _NavBar extends StatelessWidget {
  const _NavBar({required this.index, required this.onTap});
  final int index;
  final ValueChanged<int> onTap;
  @override
  Widget build(BuildContext context) {
    const items = [(Icons.home_outlined, 'Home'), (Icons.chat_bubble_outline, 'Room'), (Icons.bolt_outlined, 'Activity'), (Icons.attach_money, 'Chips')];
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Glass(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
        radius: 26,
        child: Row(children: [
          for (var i = 0; i < items.length; i++)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onTap(i),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: i == index ? BoxDecoration(borderRadius: BorderRadius.circular(18), color: Aero.aqua.withValues(alpha: .35), border: Border.all(color: Colors.white)) : null,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(items[i].$1, color: i == index ? Aero.skyDeep : Aero.inkSoft),
                    Text(items[i].$2, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: i == index ? Aero.skyDeep : Aero.inkSoft)),
                  ]),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}

/// Helper for screens: `goTab(context, 3)` jumps to Chips.
void goTab(BuildContext context, int i) {
  final s = context.findAncestorStateOfType<ShellState>();
  if (s != null) {
    s.go(i);
  } else {
    Navigator.of(context).popUntil((r) => r.isFirst);
  }
}
