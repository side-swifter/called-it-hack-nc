// App-facing game model: one prediction at a time, chips moved through chips.ts, state served as Snapshot.
import { POT, balanceOf, setBalance, transfer } from "./chips.js";
import { NAMES, aliasFor } from "./config.js";
import { planBets, recentChat } from "./brain.js";
import { ITEMS } from "./config.js";
import { addMessage as addMsg, getActivity, getMessages, hasSender, logEvent as logEv, removeDemoEntries, sendToGroup } from "./events.js";

const ENTRY = 2;
const INITIAL = 20;
const DEMO_PADS: [string, string][] = [["demo-alex", "Alex"], ["demo-maya", "Maya"], ["demo-jordan", "Jordan"]];

type Stage = "open" | "locked" | "settling" | "settled";
interface Pick {
  choice: "YES" | "NO";
  amount: number;
}
interface Pred {
  id: string;
  question: string;
  yesPct: number;
  reasoning: string;
  source: "snowflake" | "scripted" | "demo";
  stage: Stage;
  picks: Map<string, Pick>;
  groupId?: string;
}
let pred: Pred | undefined;
let result: any;
let started = false;
let generating = false;
let counter = 0;
let seeded = false; // demo seed active: "me" is Alex and the roster is the three demo players
let knownIds: () => string[] = () => [];
let groupHint = ""; // most recent group chat id

// While the demo seed is active, everything logged is tagged so reset can remove it.
type Opts = { at?: Date; demo?: boolean };
const ev = (kind: Parameters<typeof logEv>[0], text: string, predictionId?: string, status: Parameters<typeof logEv>[3] = "ok", opts: Opts = {}): void => logEv(kind, text, predictionId, status, { demo: seeded, ...opts });
const msg = (sender: string, text: string, isAgent = false, opts: Opts = {}): void => addMsg(sender, text, isAgent, { demo: seeded, ...opts });

export function bindKnown(fn: () => string[]): void {
  knownIds = fn;
}
export function noteGroup(id: string): void {
  groupHint = id;
}

const nameOf = (id: string): string => DEMO_PADS.find(([i]) => i === id)?.[1] ?? aliasFor(id);
const realPlayers = (): string[] => (seeded ? DEMO_PADS.map(([i]) => i) : knownIds().filter((h) => NAMES.has(h)));
export const hostId = (): string | undefined => (seeded ? "demo-alex" : process.env.HOST_ID || realPlayers()[0] || knownIds()[0]);
const status = (v: unknown): string => (v ? "connected" : "unavailable");

export function snapshot(): any {
  const me = hostId() ?? "host";
  const mine = pred?.picks.get(me);
  const players = realPlayers();
  const picks = pred ? [...pred.picks] : [];
  const expected = Math.max(players.length, pred?.picks.size ?? 0);
  const stage = pred?.stage;
  const hostStage = generating
    ? "generating"
    : !pred
      ? "ready"
      : stage === "open"
        ? "picks_open"
        : stage === "locked"
          ? "awaiting_result"
          : stage === "settling"
            ? "settling"
            : "settled";
  return {
    room: {
      name: "The Build Crew",
      membersOnline: players.length,
      photon: status(hasSender() || process.env.TELEGRAM_BOT_TOKEN),
      snowflake: status(process.env.SNOWFLAKE_ACCOUNT),
      nessie: status(process.env.NESSIE_API_KEY),
    },
    me: {
      id: me,
      name: nameOf(me),
      balance: balanceOf(me),
      initial: INITIAL,
      staked: mine?.amount ?? 0,
      isHost: true,
      myPick: mine?.choice ?? null,
    },
    prediction: pred && {
      id: pred.id,
      question: pred.question,
      yesPct: pred.yesPct,
      noPct: 100 - pred.yesPct,
      stage: pred.stage,
      entryAmount: ENTRY,
      pool: picks.reduce((s, [, p]) => s + p.amount, 0),
      reasoning: pred.reasoning,
      source: pred.source,
      picks: picks.map(([id, p]) => ({ name: nameOf(id), choice: p.choice, amount: p.amount, status: "confirmed" })),
    },
    players: players.map((id) => ({ id, name: nameOf(id), balance: balanceOf(id) })),
    messages: getMessages(),
    activity: getActivity(),
    result: result ?? null,
    hostStage,
    picksLogged: pred?.picks.size ?? 0,
    picksExpected: expected,
    session: started,
  };
}

type Out = { status: number; body: any };
const ok = (extra: object = {}): Out => ({ status: 200, body: { ok: true, ...extra } });
const fail = (status: number, error: string): Out => ({ status, body: { error } });

export function startDemo(): Out {
  if (pred?.stage === "settling") return fail(409, "Settlement is still processing.");
  started = true;
  ev("agent", "Demo session started");
  return ok();
}

export async function generate(): Promise<Out> {
  if (generating) return fail(409, "Already generating.");
  if (pred && pred.stage !== "settled") return fail(409, "A prediction is already live. Resolve or reset it first.");
  generating = true;
  started = true;
  try {
    const players = realPlayers();
    const names = players.map(nameOf);
    const chatLines = groupHint ? await recentChat(groupHint) : [];
    const plan = chatLines.length && names.length >= 2 ? await planBets(chatLines, names, ITEMS) : undefined;
    const real = plan && names.some((n) => n.toLowerCase() === plan.target.trim().toLowerCase());
    const who = real ? plan!.target : (names[0] ?? "Sam");
    const question = real ? `Will ${who} wear ${plan!.item} today?` : `Will ${who} say "ship it" before the demo ends?`;
    pred = {
      id: `P${String(++counter).padStart(3, "0")}`,
      question,
      yesPct: 40 + Math.floor(Math.random() * 33), // illustrative estimate, not a calibrated probability
      reasoning: real ? plan!.reason || "Pattern found in the group chat." : "No usable group chat yet, so this is a sample question.",
      source: real ? "snowflake" : "scripted",
      stage: "open",
      picks: new Map(),
      groupId: groupHint || undefined,
    };
    result = undefined;
    ev("prediction", `${real ? "Snowflake" : "Sample"} prediction created: ${question}`, pred.id);
    const text = `New prediction! ${question} Reply YES or NO in the app. ${ENTRY} demo chips per pick.`;
    msg("Photon AI", text, true);
    const sent = await sendToGroup(text);
    ev("agent", sent ? "Photon announcement sent" : "Photon announcement not sent (no live group)", pred.id, sent ? "ok" : "failed");
    return ok({ predictionId: pred.id, source: pred.source });
  } finally {
    generating = false;
  }
}

async function addPick(id: string, choice: "YES" | "NO"): Promise<Out> {
  if (!pred || pred.stage !== "open") return fail(409, "Picks are closed.");
  const existing = pred.picks.get(id);
  if (existing) return existing.choice === choice ? ok({ duplicate: true }) : fail(409, "Your pick is already recorded.");
  if (balanceOf(id) < ENTRY) return fail(400, "Not enough demo chips.");
  pred.picks.set(id, { choice, amount: ENTRY }); // claimed synchronously so double taps can't double-charge
  await transfer(id, POT, ENTRY);
  ev("chips", `${nameOf(id)} selected ${choice}`, pred.id);
  ev("chips", `Pool reached ${[...pred.picks.values()].reduce((s, p) => s + p.amount, 0)} chips`, pred.id);
  return ok();
}

export function select(predictionId: string, choice: unknown): Promise<Out> | Out {
  if (choice !== "YES" && choice !== "NO") return fail(400, "Choice must be YES or NO.");
  if (!pred || pred.id !== predictionId) return fail(404, "Prediction not found.");
  return addPick(hostId() ?? "host", choice);
}

export async function simulatePicks(): Promise<Out> {
  if (!pred || pred.stage !== "open") return fail(409, "No open prediction.");
  const ids = [...realPlayers().filter((p) => p !== hostId()), ...DEMO_PADS.map(([i]) => i)].slice(0, 3);
  const choices: ("YES" | "NO")[] = ["YES", "YES", "NO"];
  let added = 0;
  for (const [i, id] of ids.entries()) {
    if (pred.picks.has(id)) continue;
    if ((await addPick(id, choices[i])).status === 200) added++;
  }
  return ok({ added });
}

export function lock(): Out {
  if (!pred || pred.stage !== "open") return fail(409, "Nothing to lock.");
  pred.stage = "locked";
  ev("prediction", "Picks locked", pred.id);
  return ok();
}

export async function resolve(outcome: unknown): Promise<Out> {
  if (outcome !== "YES" && outcome !== "NO") return fail(400, "Outcome must be YES or NO.");
  if (!pred) return fail(409, "No prediction.");
  if (pred.stage === "settled") return ok({ already: true, result });
  if (pred.stage === "settling") return fail(409, "Settlement already in progress.");
  if (!pred.picks.size) return fail(409, "Nobody has picked yet.");
  pred.stage = "settling"; // guards against a second resolve
  const p = pred;
  ev("prediction", `Outcome confirmed: ${outcome}`, p.id);
  const entries = [...p.picks];
  const pool = entries.reduce((s, [, x]) => s + x.amount, 0);
  const winners = entries.filter(([, x]) => x.choice === outcome);
  const payouts = new Map<string, number>();
  if (winners.length) {
    const share = Math.floor(pool / winners.length);
    winners.forEach(([id], i) => payouts.set(id, share + (i === 0 ? pool - share * winners.length : 0)));
  } else {
    entries.forEach(([id, x]) => payouts.set(id, x.amount)); // nobody right: refund
  }
  for (const [id, amt] of payouts) await transfer(POT, id, amt);
  ev("chips", `Settlement completed: ${pool} chips distributed`, p.id);
  const winNames = winners.map(([id]) => nameOf(id));
  const announcement = winners.length
    ? `Confirmed! ${outcome} was right. ${winNames.join(" and ")} called it!`
    : `${outcome} was right but nobody called it. Everyone gets their chips back.`;
  const r = {
    predictionId: p.id,
    outcome,
    headline: `${outcome === "YES" ? "Yes" : "No"}: ${p.question}`,
    pool,
    announcement,
    announcementStatus: "sending",
    snowflakeOk: p.source === "snowflake",
    nessieOk: Boolean(process.env.NESSIE_API_KEY),
    photonOk: false,
    rows: entries.map(([id, x]) => ({
      name: nameOf(id),
      choice: x.choice,
      correct: x.choice === outcome,
      contributed: x.amount,
      payout: payouts.get(id) ?? 0,
      balance: balanceOf(id),
    })),
  };
  result = r;
  p.stage = "settled";
  msg("Photon AI", announcement, true);
  const sent = await sendToGroup(announcement);
  r.announcementStatus = sent ? "delivered" : "failed";
  r.photonOk = sent;
  ev("agent", sent ? "Photon result announcement delivered" : "Photon result announcement failed", p.id, sent ? "ok" : "failed");
  return ok({ result: r });
}

export async function reset(): Promise<Out> {
  if (pred?.stage === "settling") return fail(409, "Settlement is processing. Try again in a moment.");
  if (pred && (pred.stage === "open" || pred.stage === "locked")) {
    for (const [id, p] of pred.picks) await transfer(POT, id, p.amount); // give unsettled stakes back
  }
  if (seeded) {
    for (const [id] of DEMO_PADS) setBalance(id, INITIAL);
    setBalance(POT, 0);
    removeDemoEntries();
    seeded = false;
  }
  pred = undefined;
  result = undefined;
  started = false;
  ev("agent", "Demo reset to baseline");
  return ok();
}

// Puts the app in the populated state from the design mockups: three picks, pool of 6, chat feed filled in.
export async function seed(): Promise<Out> {
  if (seeded && pred) return ok({ already: true, predictionId: pred.id });
  if (generating) return fail(409, "Already generating.");
  if (pred && pred.stage !== "settled") return fail(409, "A prediction is already live. Resolve or reset it first.");
  seeded = true;
  started = true;
  result = undefined;
  for (const [id] of DEMO_PADS) setBalance(id, INITIAL);
  pred = {
    id: `P${String(++counter).padStart(3, "0")}`,
    question: "Will Sam say 'ship it' before the demo ends?",
    yesPct: 68,
    reasoning: "Sam has repeated the phrase 'ship it' several times in recent project discussions, so a repeat before the demo ends is likely.",
    source: "demo",
    stage: "open",
    picks: new Map(),
  };
  const id = pred.id;
  const ago = (min: number): Date => new Date(Date.now() - min * 60_000);
  ev("prediction", "Demo prediction loaded: Will Sam say 'ship it' before the demo ends?", id, "ok", { at: ago(5), demo: true });
  ev("agent", "Photon announcement shown in the room", id, "ok", { at: ago(4), demo: true });
  msg("Alex", "He's definitely going to say it again.", false, { at: ago(3), demo: true });
  msg("Maya", "I'm taking YES. Sam loves that line right before demos.", false, { at: ago(2), demo: true });
  msg("Jordan", "No way. He knows everyone is waiting for it.", false, { at: ago(1), demo: true });
  msg("Photon AI Agent", "Prediction is live! 2 demo chips per pick. Group pool: 6 chips.", true, { at: new Date(), demo: true });
  for (const [pid, choice] of [["demo-alex", "YES"], ["demo-maya", "YES"], ["demo-jordan", "NO"]] as const) {
    if ((await addPick(pid, choice)).status !== 200) return fail(500, "Seeding failed.");
  }
  return ok({ predictionId: id });
}

export async function postMessage(text: unknown): Promise<Out> {
  if (typeof text !== "string" || !text.trim()) return fail(400, "Message is empty.");
  const sent = await sendToGroup(text.trim());
  if (!sent) return fail(503, "Couldn't deliver: no live group chat yet.");
  msg(nameOf(hostId() ?? "host"), text.trim());
  return ok({ delivered: true });
}
