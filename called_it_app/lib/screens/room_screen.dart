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
          // Feed is anchored to the bottom (newest message just above the prediction card).
          final msgs = s.messages.reversed.toList();
          return Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
            child: Column(children: [
              Glass(
                padding: const EdgeInsets.fromLTRB(11, 8, 11, 8),
                radius: 22,
                child: Row(children: [
                  const VbLogo(size: 36),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Flexible(child: Text(s.room.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF1B4766)))),
                        const SizedBox(width: 6),
                        Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: appState.error == null ? const Color(0xFF3BC14A) : Colors.grey, boxShadow: appState.error == null ? const [BoxShadow(color: Color(0x803BC14A), blurRadius: 4)] : null)),
                      ]),
                      const SizedBox(height: 1),
                      Text(
                        appState.error == null ? '${s.room.membersOnline} members online  •  Photon AI ${photonUp ? 'Active' : 'Unavailable'}' : 'Reconnecting',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Aero.skyDeep),
                      ),
                    ]),
                  ),
                  const SizedBox(width: 6),
                  ChipsBadge(s.me.balance, onTap: () => goTab(context, 3)),
                ]),
              ),
              const SizedBox(height: 9),
              Glass(
                padding: const EdgeInsets.fromLTRB(11, 5, 7, 5),
                radius: 15,
                child: Row(children: [
                  Container(width: 8, height: 8, decoration: const BoxDecoration(shape: BoxShape.circle, color: Aero.sky)),
                  const SizedBox(width: 7),
                  const Expanded(child: Text('Photon Spectrum™ Live Channel', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 11.5, color: Color(0xFF1B4766)))),
                  GestureDetector(
                    onTap: () => goTab(context, 3),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(color: const Color(0xFFD7EEFB), borderRadius: BorderRadius.circular(13), border: Border.all(color: const Color(0xFFB5DDF5))),
                      child: Text('Room Pool: ${p?.pool ?? 0} chips', style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: Aero.skyDeep)),
                    ),
                  ),
                ]),
              ),
              Expanded(
                child: s.messages.isEmpty && p == null
                    ? const Center(child: Glass(child: Text('Your AI companion is waiting for the next moment.', textAlign: TextAlign.center)))
                    : ListView(controller: _scroll, reverse: true, padding: const EdgeInsets.only(top: 10, bottom: 8), children: [for (final m in msgs) _bubble(m)]),
              ),
              if (p != null) ...[
                PredictionCard(prediction: p, me: s.me, compact: true, onTap: () => goTab(context, 0), onPool: () => goTab(context, 3)),
                const SizedBox(height: 9),
              ],
              if (!photonUp)
                const Padding(padding: EdgeInsets.only(bottom: 6), child: Pill('Chat temporarily unavailable.', color: Aero.orange)),
              if (_status != null) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(_status!, style: const TextStyle(fontSize: 11, color: Aero.ink))),
              Glass(
                padding: const EdgeInsets.fromLTRB(16, 3, 6, 3),
                radius: 26,
                child: Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _ctl,
                      onSubmitted: (_) => _send(),
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
                      decoration: const InputDecoration(
                        hintText: 'Message #The-Build-Crew...',
                        hintStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Color(0xFF8AA4B8)),
                        border: InputBorder.none,
                        isDense: true,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: _sending ? null : _send,
                    child: Container(
                      width: 33,
                      height: 33,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF55C6F5), Color(0xFF0B73C9)]),
                        border: Border.all(color: Colors.white, width: 1.5),
                        boxShadow: const [BoxShadow(color: Color(0x551E9BE8), blurRadius: 8, offset: Offset(0, 3))],
                      ),
                      child: _sending ? const Padding(padding: EdgeInsets.all(9), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.arrow_forward, color: Colors.white, size: 17),
                    ),
                  ),
                ]),
              ),
            ]),
          );
        },
      );

  static const _tints = [Color(0xFFCDE9FB), Color(0xFFCFF1D9), Color(0xFFFFDCC8), Color(0xFFE3D6F7), Color(0xFFFBD3E3)];
  static const _names = [Color(0xFF1E6FB8), Color(0xFF2E8B4A), Color(0xFFA9522A), Color(0xFF7A55B8), Color(0xFFB04A78)];

  Widget _chatAvatar(ChatMsg m) {
    const size = 28.0;
    if (m.isAgent) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xFFDDF1FD), border: Border.all(color: Colors.white, width: 1.5), boxShadow: const [BoxShadow(color: Color(0x6645D0F0), blurRadius: 8)]),
        child: const Icon(Icons.auto_awesome, size: 14, color: Color(0xFFF2B233)),
      );
    }
    final i = m.sender.codeUnits.fold<int>(0, (a, b) => a + b) % _tints.length;
    final n = m.sender;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(shape: BoxShape.circle, color: _tints[i], border: Border.all(color: Colors.white, width: 1.5)),
      child: Text(n.isEmpty ? '?' : n.substring(0, n.length >= 2 ? 2 : 1).toUpperCase(), style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: _names[i])),
    );
  }

  Widget _bubble(ChatMsg m) {
    final i = m.sender.codeUnits.fold<int>(0, (a, b) => a + b) % _names.length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        _chatAvatar(m),
        const SizedBox(width: 8),
        Flexible(
          child: Align(
            alignment: Alignment.centerLeft,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .72),
              child: Glass(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                radius: 18,
                child: IntrinsicWidth(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(m.isAgent ? 'Photon AI Agent' : m.sender, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 10.5, color: m.isAgent ? Aero.skyDeep : _names[i])),
                      if (m.isAgent) ...[const SizedBox(width: 5), Container(width: 6, height: 6, decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF3BC14A)))],
                    ]),
                    const SizedBox(height: 2),
                    Text(m.text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, height: 1.3, color: Color(0xFF173B57))),
                    if (!m.isAgent) Align(alignment: Alignment.centerRight, child: Text(_time(m.at), style: const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w600, color: Aero.inkSoft))),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
