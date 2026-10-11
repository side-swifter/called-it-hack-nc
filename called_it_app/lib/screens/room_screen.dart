import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../app.dart';
import '../core/api.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/aero.dart';
import '../widgets/prediction_card.dart';

class RoomScreen extends StatefulWidget {
  const RoomScreen({super.key});
  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> {
  final _ctl = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  String? _status; // set only from the backend response

  String _time(DateTime t) {
    final l = t.toLocal();
    final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
    return '$h:${l.minute.toString().padLeft(2, '0')} ${l.hour >= 12 ? 'PM' : 'AM'}';
  }

  Future<void> _send() async {
    final text = _ctl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _status = 'Sending…';
    });
    try {
      final r = await http.post(Uri.parse('$apiBase/api/rooms/messages'), headers: {'content-type': 'application/json'}, body: jsonEncode({'text': text})).timeout(const Duration(seconds: 15));
      final j = r.body.isEmpty ? {} : jsonDecode(r.body);
      if (r.statusCode >= 400 || j['ok'] == false) {
        _status = 'Not delivered. Tap send to retry.';
      } else {
        _ctl.clear();
        _status = 'Delivered';
        appState.refresh();
      }
    } catch (_) {
      _status = 'Not delivered. Tap send to retry.';
    }
    if (mounted) setState(() => _sending = false);
  }

  @override
  void dispose() {
    _ctl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          final s = appState.snap;
          if (s == null) return Center(child: appState.error != null ? const Text('Chat temporarily unavailable.') : const CircularProgressIndicator());
          final p = s.prediction;
          final photonUp = s.room.photon == 'connected';
          return Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: [
              Glass(
                child: Row(children: [
                  const Avatar('VB'),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Flexible(child: Text(s.room.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
                        const SizedBox(width: 6),
                        Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: appState.error == null ? Aero.grass : Colors.grey)),
                      ]),
                      Text(appState.error == null ? '${s.room.membersOnline} members online · Photon AI ${photonUp ? 'Active' : 'Unavailable'}' : 'Reconnecting', style: const TextStyle(fontSize: 11, color: Aero.skyDeep)),
                    ]),
                  ),
                  ChipsBadge(s.me.balance, onTap: () => goTab(context, 3)),
                ]),
              ),
              const SizedBox(height: 8),
              Glass(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                radius: 16,
                child: Row(children: [
                  const Icon(Icons.circle, size: 9, color: Aero.sky),
                  const SizedBox(width: 6),
                  const Expanded(child: Text('Photon Spectrum™ Live Channel', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                  GestureDetector(onTap: () => goTab(context, 3), child: Pill('Room Pool: ${p?.pool ?? 0} chips')),
                ]),
              ),
              Expanded(
                child: s.messages.isEmpty && p == null
                    ? const Center(child: Glass(child: Text('Your AI companion is waiting for the next moment.', textAlign: TextAlign.center)))
                    : ListView(controller: _scroll, reverse: false, padding: const EdgeInsets.symmetric(vertical: 8), children: [
                        for (final m in s.messages) _bubble(m),
                        if (p != null) Padding(padding: const EdgeInsets.only(top: 6), child: PredictionCard(prediction: p, me: s.me, compact: true, onTap: () => goTab(context, 0), onPool: () => goTab(context, 3))),
                      ]),
              ),
              if (!photonUp)
                const Padding(padding: EdgeInsets.only(bottom: 6), child: Pill('Chat temporarily unavailable.', color: Aero.orange)),
              if (_status != null) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(_status!, style: const TextStyle(fontSize: 11, color: Aero.ink))),
              Glass(
                padding: const EdgeInsets.fromLTRB(14, 4, 6, 4),
                radius: 26,
                child: Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _ctl,
                      onSubmitted: (_) => _send(),
                      decoration: const InputDecoration(hintText: 'Message #The-Build-Crew...', border: InputBorder.none),
                    ),
                  ),
                  GestureDetector(
                    onTap: _sending ? null : _send,
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Aero.aqua, Aero.skyDeep])),
                      child: _sending ? const Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.arrow_forward, color: Colors.white),
                    ),
                  ),
                ]),
              ),
            ]),
          );
        },
      );

  Widget _bubble(ChatMsg m) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Avatar(m.sender, agent: m.isAgent),
          const SizedBox(width: 8),
          Flexible(
            child: Glass(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
              radius: 18,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.isAgent ? 'Photon AI Agent' : m.sender, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: m.isAgent ? Aero.skyDeep : Aero.grass)),
                Text(m.text),
                Align(alignment: Alignment.centerRight, child: Text(_time(m.at), style: const TextStyle(fontSize: 10, color: Aero.inkSoft))),
              ]),
            ),
          ),
        ]),
      );
}
