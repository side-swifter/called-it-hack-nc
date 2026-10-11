import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'models.dart';

const _apiOverride = String.fromEnvironment('API');

String get apiBase {
  if (_apiOverride.isNotEmpty) return _apiOverride;
  if (kIsWeb && Uri.base.port == 8787) return Uri.base.origin;
  return 'http://192.168.1.228:8787';
}

/// Single source of UI state. Polls GET /api/state; every mutation goes through [post]
/// and the screen re-renders from the next snapshot. The UI never edits balances itself.
class AppState extends ChangeNotifier {
  Snapshot? snap;
  String? error; // set when the backend is unreachable; snap keeps the last confirmed data
  final busy = <String>{}; // action keys currently in flight (disable buttons)
  Timer? _timer;

  void start() {
    refresh();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => refresh());
  }

  Future<void> refresh() async {
    try {
      final r = await http.get(Uri.parse('$apiBase/api/state')).timeout(const Duration(seconds: 5));
      if (r.statusCode != 200) throw 'HTTP ${r.statusCode}';
      snap = Snapshot.fromJson(jsonDecode(r.body));
      error = null;
    } catch (e) {
      error = '$e';
    }
    notifyListeners();
  }

  /// POST to the backend. Returns null on success, else a user-facing error string.
  Future<String?> post(String key, String path, [Map<String, dynamic>? body]) async {
    if (busy.contains(key)) return null;
    busy.add(key);
    notifyListeners();
    try {
      final r = await http
          .post(Uri.parse('$apiBase$path'), headers: {'content-type': 'application/json'}, body: jsonEncode(body ?? {}))
          .timeout(const Duration(seconds: 30));
      final j = r.body.isEmpty ? {} : jsonDecode(r.body);
      if (r.statusCode >= 400) return (j['error'] ?? 'Request failed') as String;
      await refresh();
      return null;
    } catch (e) {
      return 'Backend unreachable';
    } finally {
      busy.remove(key);
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

final appState = AppState();
