import 'package:flutter/material.dart';

import 'core/api.dart';
import 'core/theme.dart';
import 'screens/activity_screen.dart';
import 'screens/chips_screen.dart';
import 'screens/home_screen.dart';
import 'screens/host_screen.dart';
import 'screens/result_screen.dart';
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
  int index = 0; // 0 Home, 1 Activity, 2 Chips
  void go(int i) => setState(() => index = i);

  @override
  Widget build(BuildContext context) {
    const pages = [HomeScreen(), ActivityScreen(), ChipsScreen()];
    return Scaffold(
      body: AeroBackground(
        variant: const [2, 1, 0][index],
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
    // (inactive icon, active icon, label)
    const items = [
      (Icons.home_outlined, Icons.home_rounded, 'Home'),
      (Icons.bolt_outlined, Icons.bolt_rounded, 'Activity'),
      (Icons.monetization_on_outlined, Icons.monetization_on_rounded, 'Chips'),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
      child: Glass(
        padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 8),
        radius: 28,
        child: Row(children: [
          for (var i = 0; i < items.length; i++)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onTap(i),
                child: Center(child: FittedBox(fit: BoxFit.scaleDown, child: i == index ? _active(items[i]) : _inactive(items[i]))),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _active((IconData, IconData, String) it) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFD9F1FF), Color(0xFFA9DBFA)]),
          border: Border.all(color: Colors.white, width: 1.4),
          boxShadow: const [BoxShadow(color: Color(0x330B6FC2), blurRadius: 8, offset: Offset(0, 3))],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(it.$2, size: 20, color: Aero.skyDeep),
          const SizedBox(width: 5),
          Text(it.$3, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Aero.skyDeep)),
        ]),
      );

  Widget _inactive((IconData, IconData, String) it) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(it.$1, size: 24, color: Aero.inkSoft),
          const SizedBox(height: 2),
          Text(it.$3, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Aero.inkSoft)),
        ]),
      );
}

/// Helper for screens: `goTab(context, 2)` jumps to Chips.
void goTab(BuildContext context, int i) {
  final s = context.findAncestorStateOfType<ShellState>();
  if (s != null) {
    s.go(i);
  } else {
    Navigator.of(context).popUntil((r) => r.isFirst);
  }
}
