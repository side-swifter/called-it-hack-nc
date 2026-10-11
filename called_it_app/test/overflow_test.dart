import 'dart:convert';
import 'dart:io';

import 'package:called_it_app/app.dart';
import 'package:called_it_app/core/api.dart';
import 'package:called_it_app/core/models.dart';
import 'package:called_it_app/screens/host_screen.dart';
import 'package:called_it_app/screens/result_screen.dart';
import 'package:called_it_app/screens/secondary_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUpAll(() async {
    final l = FontLoader('PlusJakarta')..addFont(Future.value(ByteData.sublistView(File('assets/fonts/PlusJakartaSans.ttf').readAsBytesSync())));
    await l.load();
  });
  final seeded = jsonDecode(File('test/seeded.json').readAsStringSync()) as Map<String, dynamic>;
  final settled = Map<String, dynamic>.from(seeded)
    ..['result'] = {
      'predictionId': 'P001', 'outcome': 'YES', 'headline': "Sam said 'ship it' before the demo ended!", 'pool': 6,
      'announcement': 'Confirmed.', 'announcementStatus': 'delivered', 'snowflakeOk': true, 'nessieOk': true, 'photonOk': true,
      'rows': [
        {'name': 'Akshay', 'choice': 'YES', 'correct': true, 'contributed': 2, 'payout': 3, 'balance': 21},
        {'name': 'Maya', 'choice': 'YES', 'correct': true, 'contributed': 2, 'payout': 3, 'balance': 21},
        {'name': 'Jordan', 'choice': 'NO', 'correct': false, 'contributed': 2, 'payout': 0, 'balance': 18},
      ],
    };

  final empty = Map<String, dynamic>.from(seeded)..remove('prediction')..['messages'] = []..['activity'] = []..['hostStage'] = 'ready'..['picksLogged'] = 0;

  Future<void> check(WidgetTester t, Widget w, Map<String, dynamic> data, double width, double height) async {
    t.view.physicalSize = Size(width * 3, height * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    appState.snap = Snapshot.fromJson(data);
    await t.pumpWidget(MaterialApp(theme: ThemeData(fontFamily: 'PlusJakarta'), home: w, onGenerateRoute: (s) => MaterialPageRoute(builder: (_) => const SizedBox())));
    await t.pump(const Duration(milliseconds: 300));
  }

  for (final size in const [(390.0, 844.0), (375.0, 667.0), (430.0, 932.0)]) {
    for (var tab = 0; tab < 4; tab++) {
      testWidgets('EMPTY tab $tab @${size.$1}', (t) async {
        await check(t, const Shell(), empty, size.$1, size.$2);
        t.state<ShellState>(find.byType(Shell)).go(tab);
        await t.pump(const Duration(milliseconds: 300));
        expect(t.takeException(), isNull);
      });
    }
    testWidgets('EMPTY host @${size.$1}', (t) async {
      await check(t, const HostScreen(), empty, size.$1, size.$2);
      expect(t.takeException(), isNull);
    });
    for (var tab = 0; tab < 4; tab++) {
      testWidgets('tab $tab @${size.$1}', (t) async {
        await check(t, const Shell(), seeded, size.$1, size.$2);
        final s = t.state<ShellState>(find.byType(Shell));
        s.go(tab);
        await t.pump(const Duration(milliseconds: 300));
        expect(t.takeException(), isNull);
      });
    }
    final others = <String, Widget>{'host': const HostScreen(), 'result': const ResultScreen(), 'insights': const InsightsScreen(), 'prediction': const PredictionDetailsScreen(), 'settings': const SettingsScreen(), 'green': const GreenMomentsScreen()};
    for (final e in others.entries) {
      testWidgets('${e.key} @${size.$1}', (t) async {
        await check(t, e.value, e.key == 'result' ? settled : seeded, size.$1, size.$2);
        expect(t.takeException(), isNull);
      });
    }
  }
}
