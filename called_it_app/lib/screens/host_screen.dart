import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/theme.dart';
import '../widgets/aero.dart';

class HostScreen extends StatefulWidget {
  const HostScreen({super.key});
  @override
  State<HostScreen> createState() => _HostScreenState();
}

class _HostScreenState extends State<HostScreen> {
  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m), duration: const Duration(seconds: 2)));

  Future<void> _run(String key, String path, {Map<String, dynamic>? body, String? start, String? ok, String? fail}) async {
    if (start != null) _toast(start);
    final err = await appState.post(key, path, body);
    if (!mounted) return;
    _toast(err == null ? (ok ?? 'Done.') : (fail != null ? '$fail ($err)' : err));
  }

  Future<bool> _confirm(String title, String body, String yes) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(c, true), child: Text(yes)),
          ],
        ),
      ) ??
      false;

  Future<void> _resolve(String outcome) async {
    if (!await _confirm('Resolve $outcome?', 'Confirm $outcome as the real outcome. Chips are paid out once and cannot be undone.', 'Resolve $outcome')) return;
    final err = await appState.post('resolve', '/api/demo/resolve', {'outcome': outcome});
    if (!mounted) return;
    if (err != null) {
      _toast('Settlement incomplete. Review transfers. ($err)');
      return;
    }
    _toast('Settlement complete.');
    Navigator.pushNamed(context, '/result', arguments: appState.snap?.result?.predictionId);
  }

  Future<void> _reset() async {
    if (!await _confirm('Reset the round?', 'Clears the current round and refunds any stakes.', 'Reset Demo')) return;
    await _run('reset', '/api/demo/reset', ok: 'Round reset.');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: AeroBackground(
          variant: 1,
          child: ListenableBuilder(
            listenable: appState,
            builder: (context, _) {
              final s = appState.snap;
              if (s == null) return const Center(child: CircularProgressIndicator());
              final b = appState.busy;
              final st = s.hostStage;
              final settled = st == 'settled';
              final settling = st == 'settling';
              final hasPred = s.prediction != null;
              final picksOpen = st == 'picks_open';
              final allPicked = s.picksExpected > 0 && s.picksLogged >= s.picksExpected;
              final canResolve = hasPred && !settled && !settling && allPicked && (picksOpen || st == 'picks_locked' || st == 'awaiting_result');
              final live = s.room.photon == 'connected' && s.room.snowflake == 'connected' && s.room.nessie == 'connected';
              final head = <Widget>[
                Glass(
                  radius: 24,
                  padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
                  child: Row(children: [
                    GestureDetector(
                      onTap: () => Navigator.maybePop(context),
                      behavior: HitTestBehavior.opaque,
                      child: const Padding(padding: EdgeInsets.symmetric(horizontal: 4), child: Icon(Icons.arrow_back_ios_new, size: 15, color: _ink)),
                    ),
                    const _RoundIcon(Icons.explore),
                    const SizedBox(width: 11),
                    const Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Host Controls', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: _ink)),
                        SizedBox(height: 2),
                        Text('Round tools', style: TextStyle(color: _muted, fontSize: 11, fontWeight: FontWeight.w500)),
                      ]),
                    ),
                    if (s.me.isHost)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), color: Colors.white.withValues(alpha: .55), border: Border.all(color: Aero.sky.withValues(alpha: .45))),
                        child: const Text('Stage Host', style: TextStyle(color: Aero.skyDeep, fontWeight: FontWeight.w800, fontSize: 11)),
                      ),
                  ]),
                ),
                if (appState.error != null) const Padding(padding: EdgeInsets.only(top: 8), child: Pill('Showing last confirmed data', color: Aero.orange)),
                const SizedBox(height: 12),
                if (!s.me.isHost)
                  const Glass(child: Center(child: Padding(padding: EdgeInsets.all(20), child: Text('Host access required', style: TextStyle(fontWeight: FontWeight.w800)))))
                else
                  Glass(
                    radius: 24,
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('CURRENT ROUND', style: _caps),
                        st == 'error'
                            ? const _Live('INTEGRATION ISSUE', Aero.orange)
                            : live
                                ? const _Live('LIVE READY', Aero.grass)
                                : const _Live('READY', Aero.skyDeep),
                      ]),
                      const SizedBox(height: 10),
                      Row(children: [
                        _stat('Stage', _stageLabel(st)),
                        const SizedBox(width: 8),
                        _stat('Picks Logged', '${s.picksLogged} / ${s.picksExpected}', color: Aero.skyDeep),
                        const SizedBox(width: 8),
                        _stat('Pool Staked', '${s.prediction?.pool ?? 0} chips', coin: true),
                      ]),
                    ]),
                  ),
              ];
              final tail = <Widget>[
                if (s.me.isHost) ...[
                  Glass(
                    radius: 24,
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('ONE-TAP STAGE TRIGGERS', style: _caps),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                          child: _Gloss(
                            label: 'Start Round',
                            icon: Icons.play_arrow_rounded,
                            loading: b.contains('start'),
                            onPressed: settling ? null : () => _run('start', '/api/demo/start', ok: 'Round started.', fail: "Demo couldn't start. Check the integration status."),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _Gloss(
                            label: 'Gen Predict',
                            icon: Icons.auto_awesome,
                            loading: b.contains('gen'),
                            onPressed: (hasPred && !settled) || settling ? null : () => _run('gen', '/api/demo/generate', start: 'Analyzing group context...', ok: 'Prediction created.', fail: 'Prediction generation failed. Try again.'),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 9),
                      _Light(
                        label: allPicked ? '${s.picksLogged}/${s.picksExpected} Picks Recorded' : 'Add Test Picks (${s.picksLogged}/${s.picksExpected})',
                        icon: Icons.groups,
                        color: Aero.skyDeep,
                        loading: b.contains('sim'),
                        onPressed: !picksOpen || allPicked ? null : () => _run('sim', '/api/demo/simulate-picks', ok: 'Test picks added.'),
                      ),
                      const SizedBox(height: 9),
                      Row(children: [
                        Expanded(child: _Gloss(label: 'Resolve YES', icon: Icons.check_rounded, color: const Color(0xFF22B24C), loading: b.contains('resolve'), onPressed: canResolve ? () => _resolve('YES') : null)),
                        const SizedBox(width: 10),
                        Expanded(child: _Gloss(label: 'Resolve NO', icon: Icons.close_rounded, color: const Color(0xFFF07B1D), loading: b.contains('resolve'), onPressed: canResolve ? () => _resolve('NO') : null)),
                      ]),
                      const SizedBox(height: 9),
                      _Light(label: 'Reset Round', icon: Icons.refresh, color: _muted, loading: b.contains('reset'), onPressed: settling ? null : _reset),
                      if (settling) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Processing chip transfers...', style: TextStyle(fontSize: 12, color: _muted))),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  _progress(st),
                ],
              ];
              // Header + state card pinned top, triggers + map pinned bottom (wallpaper shows between), as in the design.
              return LayoutBuilder(
                builder: (context, c) => SingleChildScrollView(
                  padding: const EdgeInsets.all(14),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: c.maxHeight - 28),
                    child: IntrinsicHeight(
                      child: Column(children: [...head, const Spacer(), const SizedBox(height: 14), ...tail]),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      );

  Widget _stat(String label, String value, {Color color = _ink, bool coin = false}) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 6),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .62), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white.withValues(alpha: .9))),
          child: Column(children: [
            Text(label, style: const TextStyle(fontSize: 10, color: _muted, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Flexible(child: FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: color)))),
              if (coin) ...[
                const SizedBox(width: 4),
                Container(width: 13, height: 13, decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFE9A8), Color(0xFFF2A93B)]))),
              ],
            ]),
          ]),
        ),
      );

  String _stageLabel(String st) => switch (st) {
        'ready' => 'Ready',
        'generating' => 'Generating',
        'picks_open' => 'Picks Open',
        'picks_locked' => 'Picks Locked',
        'awaiting_result' => 'Awaiting Result',
        'settling' => 'Settling',
        'settled' => 'Settled',
        'error' => 'Error',
        _ => st,
      };

  // Highlight is derived only from the backend stage.
  Widget _progress(String st) {
    final step = switch (st) {
      'ready' || 'generating' => 0,
      'picks_open' || 'picks_locked' || 'awaiting_result' => 1,
      'settling' => 2,
      'settled' => 3,
      _ => 0,
    };
    const names = ['1. Observe', '2. Predict', '3. Settle'];
    return Glass(
      radius: 22,
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Round Progress', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Aero.skyDeep)),
          Text('90s flow', style: TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, fontSize: 10, color: Aero.skyDeep)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          for (var i = 0; i < 3; i++)
            Expanded(
              child: Container(
                margin: EdgeInsets.only(right: i < 2 ? 7 : 0),
                padding: const EdgeInsets.symmetric(vertical: 9),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(11),
                  color: i == step || i < step ? const Color(0xFFCFF3D6).withValues(alpha: i == step ? .95 : .7) : Colors.white.withValues(alpha: .6),
                  border: Border.all(color: i == step || i < step ? const Color(0xFF8ED9A0) : Aero.sky.withValues(alpha: .28)),
                ),
                child: Text(names[i], style: TextStyle(fontWeight: FontWeight.w700, fontSize: 11.5, color: i <= step && step > 0 ? const Color(0xFF1E7A38) : Aero.skyDeep)),
              ),
            ),
        ]),
      ]),
    );
  }
}

const _ink = Color(0xFF1B3A57);
const _muted = Color(0xFF7A97AD);
const _caps = TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _muted, letterSpacing: .6);

class _Live extends StatelessWidget {
  const _Live(this.text, this.color);
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color, letterSpacing: .4)),
      ]);
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon(this.icon);
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const RadialGradient(center: Alignment(-.3, -.4), colors: [Color(0xFF7FD2FF), Aero.sky, Aero.skyDeep]),
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: const [BoxShadow(color: Color(0x5545D0F0), blurRadius: 8)],
        ),
        child: Icon(icon, color: Aero.orange, size: 20),
      );
}

/// Compact glossy pill button (blue/green/orange) as in the design.
class _Gloss extends StatelessWidget {
  const _Gloss({required this.label, required this.icon, this.onPressed, this.color = Aero.sky, this.loading = false});
  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final Color color;
  final bool loading;
  @override
  Widget build(BuildContext context) {
    final on = onPressed != null && !loading;
    final base = on ? color : Colors.grey.shade400;
    return Opacity(
      opacity: on ? 1 : .72,
      child: GestureDetector(
        onTap: on ? onPressed : null,
        child: Container(
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color.lerp(base, Colors.white, .32)!, base, Color.lerp(base, Colors.black, .14)!], stops: const [0, .5, 1]),
            border: Border.all(color: Colors.white.withValues(alpha: .75)),
            boxShadow: [BoxShadow(color: base.withValues(alpha: .35), blurRadius: 8, offset: const Offset(0, 3))],
          ),
          child: loading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, color: Colors.white, size: 16),
                  const SizedBox(width: 5),
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12.5))),
                ]),
        ),
      ),
    );
  }
}

/// Pale full-width button (Simulate Picks / Reset).
class _Light extends StatelessWidget {
  const _Light({required this.label, required this.icon, required this.color, this.onPressed, this.loading = false});
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onPressed;
  final bool loading;
  @override
  Widget build(BuildContext context) {
    final on = onPressed != null && !loading;
    return Opacity(
      opacity: on ? 1 : .6,
      child: GestureDetector(
        onTap: on ? onPressed : null,
        child: Container(
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: Colors.white.withValues(alpha: .6),
            border: Border.all(color: Aero.sky.withValues(alpha: .25)),
          ),
          child: loading
              ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: color))
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, color: color, size: 15),
                  const SizedBox(width: 6),
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(color: color == _muted ? _muted : Aero.skyDeep, fontWeight: FontWeight.w700, fontSize: 12.5))),
                ]),
        ),
      ),
    );
  }
}
