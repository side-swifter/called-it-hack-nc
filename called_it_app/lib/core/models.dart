// Mirrors GET /api/state. See PLAN.md for the contract.
int _i(dynamic v) => (v as num?)?.toInt() ?? 0;

class Pick {
  Pick.fromJson(Map<String, dynamic> j)
      : name = j['name'] ?? '',
        choice = j['choice'] ?? '',
        amount = _i(j['amount']),
        status = j['status'] ?? 'confirmed';
  final String name;
  final String choice; // YES | NO
  final int amount;
  final String status; // pending | confirmed | failed
}

class Prediction {
  Prediction.fromJson(Map<String, dynamic> j)
      : id = j['id'] ?? '',
        question = j['question'] ?? '',
        yesPct = _i(j['yesPct']),
        noPct = _i(j['noPct']),
        stage = j['stage'] ?? '',
        entryAmount = _i(j['entryAmount']),
        pool = _i(j['pool']),
        reasoning = j['reasoning'] ?? '',
        source = j['source'] ?? '',
        picks = [for (final p in (j['picks'] as List? ?? [])) Pick.fromJson(p)];
  final String id, question, stage, reasoning, source;
  // stage: draft|awaiting_approval|open|locked|awaiting_outcome|settling|settled|settlement_error|cancelled
  final int yesPct, noPct, entryAmount, pool;
  final List<Pick> picks;
  bool get isOpen => stage == 'open';
}

class Me {
  Me.fromJson(Map<String, dynamic> j)
      : id = j['id'] ?? '',
        name = j['name'] ?? '',
        balance = _i(j['balance']),
        initial = _i(j['initial']),
        staked = _i(j['staked']),
        isHost = j['isHost'] == true,
        myPick = j['myPick'];
  final String id, name;
  final int balance, initial, staked;
  final bool isHost;
  final String? myPick; // YES | NO | null
}

class Player {
  Player.fromJson(Map<String, dynamic> j)
      : id = j['id'] ?? '',
        name = j['name'] ?? '',
        balance = _i(j['balance']),
        bets = _i(j['bets']),
        hits = _i(j['hits']);
  final String id, name;
  final int balance, bets, hits;
}

class HistoryItem {
  HistoryItem.fromJson(Map<String, dynamic> j)
      : at = DateTime.tryParse(j['at'] ?? '') ?? DateTime.now(),
        target = j['target'] ?? '',
        item = j['item'] ?? '',
        hit = j['hit'] == true;
  final DateTime at;
  final String target, item;
  final bool hit;
}

class ChatMsg {
  ChatMsg.fromJson(Map<String, dynamic> j)
      : id = '${j['id']}',
        sender = j['sender'] ?? '',
        text = j['text'] ?? '',
        at = DateTime.tryParse(j['at'] ?? '') ?? DateTime.now(),
        isAgent = j['isAgent'] == true;
  final String id, sender, text;
  final DateTime at;
  final bool isAgent;
}

class ActivityItem {
  ActivityItem.fromJson(Map<String, dynamic> j)
      : at = DateTime.tryParse(j['at'] ?? '') ?? DateTime.now(),
        kind = j['kind'] ?? 'agent',
        text = j['text'] ?? '',
        status = j['status'] ?? 'ok',
        predictionId = j['predictionId'];
  final DateTime at;
  final String kind; // prediction | chips | agent
  final String text, status;
  final String? predictionId;
}

class ResultRow {
  ResultRow.fromJson(Map<String, dynamic> j)
      : name = j['name'] ?? '',
        choice = j['choice'] ?? '',
        correct = j['correct'] == true,
        contributed = _i(j['contributed']),
        payout = _i(j['payout']),
        balance = _i(j['balance']);
  final String name, choice;
  final bool correct;
  final int contributed, payout, balance; // net = payout - contributed
}

class Result {
  Result.fromJson(Map<String, dynamic> j)
      : predictionId = j['predictionId'] ?? '',
        outcome = j['outcome'] ?? '',
        headline = j['headline'] ?? '',
        pool = _i(j['pool']),
        announcement = j['announcement'] ?? '',
        announcementStatus = j['announcementStatus'] ?? 'preparing',
        snowflakeOk = j['snowflakeOk'] == true,
        nessieOk = j['nessieOk'] == true,
        photonOk = j['photonOk'] == true,
        rows = [for (final r in (j['rows'] as List? ?? [])) ResultRow.fromJson(r)];
  final String predictionId, outcome, headline, announcement;
  final String announcementStatus; // preparing|sending|delivered|failed
  final int pool;
  final bool snowflakeOk, nessieOk, photonOk;
  final List<ResultRow> rows;
}

class Room {
  Room.fromJson(Map<String, dynamic> j)
      : name = j['name'] ?? 'The Build Crew',
        membersOnline = _i(j['membersOnline']),
        photon = j['photon'] ?? 'unavailable',
        snowflake = j['snowflake'] ?? 'unavailable',
        nessie = j['nessie'] ?? 'unavailable';
  final String name;
  final int membersOnline;
  final String photon, snowflake, nessie; // connected|connecting|unavailable
}

class Snapshot {
  Snapshot.fromJson(Map<String, dynamic> j)
      : room = Room.fromJson(j['room'] ?? {}),
        me = Me.fromJson(j['me'] ?? {}),
        prediction = j['prediction'] == null ? null : Prediction.fromJson(j['prediction']),
        players = [for (final p in (j['players'] as List? ?? [])) Player.fromJson(p)],
        messages = [for (final m in (j['messages'] as List? ?? [])) ChatMsg.fromJson(m)],
        activity = [for (final a in (j['activity'] as List? ?? [])) ActivityItem.fromJson(a)],
        history = [for (final h in (j['history'] as List? ?? [])) HistoryItem.fromJson(h)],
        result = j['result'] == null ? null : Result.fromJson(j['result']),
        hostStage = j['hostStage'] ?? 'ready',
        picksLogged = _i(j['picksLogged']),
        picksExpected = _i(j['picksExpected']);
  final Room room;
  final Me me;
  final Prediction? prediction;
  final List<Player> players;
  final List<ChatMsg> messages;
  final List<ActivityItem> activity;
  final List<HistoryItem> history;
  final Result? result;
  final String hostStage; // ready|generating|picks_open|picks_locked|awaiting_result|settling|settled|error
  final int picksLogged, picksExpected;
}
