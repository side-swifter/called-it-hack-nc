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
    if (!await _confirm('Reset the demo session?', 'Starts a fresh session with baseline balances and an empty pool.', 'Reset Demo')) return;
    await _run('reset', '/api/demo/reset', ok: 'Demo reset to baseline.');
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
              return ListView(padding: const EdgeInsets.all(14), children: [
                Glass(
                  child: Row(children: [
                    IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.arrow_back_ios_new, size: 18)),
                    const Avatar('', agent: true, size: 38),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Demo Mode & Controls', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                        Text('Hackathon Live Host Tools', style: TextStyle(color: Aero.inkSoft, fontSize: 12)),
                      ]),
                    ),
                    if (s.me.isHost) const Pill('Stage Host'),
                  ]),
                ),
                if (appState.error != null) const Padding(padding: EdgeInsets.only(top: 8), child: Pill('Showing last confirmed data', color: Aero.orange)),
                const SizedBox(height: 12),
                if (!s.me.isHost)
                  const Glass(child: Center(child: Padding(padding: EdgeInsets.all(20), child: Text('Host access required', style: TextStyle(fontWeight: FontWeight.w800)))))
                else ...[
                  Glass(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('CURRENT SIMULATION STATE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Aero.inkSoft)),
                        Pill(st == 'error' ? 'Integration issue' : 'Demo Ready', color: st == 'error' ? Aero.orange : Aero.grass, dot: true),
                      ]),
                      const SizedBox(height: 10),
                      Row(children: [
                        _stat('Stage', _stageLabel(st)),
                        const SizedBox(width: 8),
                        _stat('Picks Logged', '${s.picksLogged} / ${s.picksExpected}'),
                        const SizedBox(width: 8),
                        _stat('Pool Staked', '${s.prediction?.pool ?? 0} chips'),
                      ]),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  Glass(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('ONE-TAP STAGE TRIGGERS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Aero.inkSoft)),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                          child: GlossyButton(
                            label: 'Start Demo',
                            icon: Icons.play_arrow,
                            loading: b.contains('start'),
                            onPressed: settling ? null : () => _run('start', '/api/demo/start', ok: 'Demo session started.', fail: "Demo couldn't start. Check the integration status."),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: GlossyButton(
                            label: 'Gen Predict',
                            icon: Icons.auto_awesome,
                            loading: b.contains('gen'),
                            onPressed: (hasPred && !settled) || settling ? null : () => _run('gen', '/api/demo/generate', start: 'Analyzing group context...', ok: 'Prediction created.', fail: 'Prediction generation failed. Try again.'),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 10),
                      GlossyButton(
                        label: allPicked ? '${s.picksLogged}/${s.picksExpected} Picks Recorded' : 'Simulate Participant Picks (${s.picksLogged}/${s.picksExpected})',
                        icon: Icons.groups,
                        color: Aero.skyDeep,
                        loading: b.contains('sim'),
                        onPressed: !picksOpen || allPicked ? null : () => _run('sim', '/api/demo/simulate-picks', ok: 'Demo selections confirmed.'),
                      ),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(child: GlossyButton(label: 'Resolve YES', icon: Icons.check, color: Aero.yes, loading: b.contains('resolve'), onPressed: canResolve ? () => _resolve('YES') : null)),
                        const SizedBox(width: 10),
                        Expanded(child: GlossyButton(label: 'Resolve NO', icon: Icons.close, color: Aero.no, loading: b.contains('resolve'), onPressed: canResolve ? () => _resolve('NO') : null)),
                      ]),
                      const SizedBox(height: 10),
                      GlossyButton(label: 'Reset Demo to Baseline', icon: Icons.refresh, color: Aero.inkSoft, loading: b.contains('reset'), onPressed: settling ? null : _reset),
                      if (settling) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Processing demo chip transfers...', style: TextStyle(fontSize: 12, color: Aero.inkSoft))),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  _progress(st),
                ],
              ]);
            },
          ),
        ),
      );

  Widget _stat(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .55), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white)),
          child: Column(children: [
            Text(label, style: const TextStyle(fontSize: 10, color: Aero.inkSoft, fontWeight: FontWeight.w700)),
            const SizedBox(height: 3),
            FittedBox(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14))),
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
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Demo Progression Map', style: TextStyle(fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        Row(children: [
          for (var i = 0; i < 3; i++)
            Expanded(
              child: Container(
                margin: EdgeInsets.only(right: i < 2 ? 6 : 0),
                padding: const EdgeInsets.symmetric(vertical: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: (i < step ? Aero.grass : (i == step ? Aero.aqua : Colors.white)).withValues(alpha: i <= step ? .35 : .5),
                  border: Border.all(color: Colors.white),
                ),
                child: Text(names[i], style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
              ),
            ),
        ]),
      ]),
    );
  }
}
