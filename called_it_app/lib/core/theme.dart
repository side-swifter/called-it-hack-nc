import 'package:flutter/material.dart';

// Frutiger Aero tokens.
class Aero {
  static const ink = Color(0xFF16405F);
  static const inkSoft = Color(0xFF4E7691);
  static const sky = Color(0xFF1E9BE8);
  static const skyDeep = Color(0xFF0B6FC2);
  static const aqua = Color(0xFF45D0F0);
  static const grass = Color(0xFF2FB44A);
  static const orange = Color(0xFFF07B1D);
  static const gold = Color(0xFFFFC857);
  static const glass = Color(0xB8FFFFFF);
  static const glassEdge = Color(0xE6FFFFFF);

  static const yes = grass;
  static const no = orange;
}

ThemeData aeroTheme() => ThemeData(
      useMaterial3: true,
      fontFamily: 'PlusJakarta',
      scaffoldBackgroundColor: const Color(0xFF8FD3F4),
      colorScheme: ColorScheme.fromSeed(seedColor: Aero.sky),
      textTheme: ThemeData.light().textTheme.apply(fontFamily: 'PlusJakarta', bodyColor: Aero.ink, displayColor: Aero.ink),
    );
