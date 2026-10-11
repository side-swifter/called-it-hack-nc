// App-facing game model: one prediction at a time, chips moved through chips.ts, state served as Snapshot.
import { POT, balanceOf, setBalance, transfer } from "./chips.js";
import { ITEMS, NAMES, START_CHIPS, STAKE, aliasFor } from "./config.js";
import { hitRate, planBets, recentChat } from "./brain.js";
import { addMessage as addMsg, getActivity, hasSender, latestResult, logEvent as logEv, removeDemoEntries, sendToGroup } from "./events.js";
import { getState } from "./state.js";

const ENTRY = 2;
const INITIAL = 20;
const DEMO_PADS: [string, string][] = [["demo-alex", "Akshay"], ["demo-maya", "Maya"], ["demo-jordan", "Jordan"]];

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
let seeded = false; // demo seed active: "me" is Akshay and the roster is the three demo players
const DEFAULT_ME = "8862566495"; // Akshay's Telegram id; HOST_ID overrides
let knownIds: () => string[] = () => [];
let groupHint = ""; // most recent group chat id

// Everything the demo routes log is tagged: it is never persisted and reset removes it.
type Opts = { at?: Date; demo?: boolean };
const ev = (kind: Parameters<typeof logEv>[0], text: string, predictionId?: string, status: Parameters<typeof logEv>[3] = "ok", opts: Opts = {}): void => logEv(kind, text, predictionId, status, { demo: true, ...opts });
const msg = (sender: string, text: string, isAgent = false, opts: Opts = {}): void => addMsg(sender, text, isAgent, { demo: true, ...opts });

// The bot registers how to act on the real game (pick, resolve, who is in the group).
export interface BotHooks {
  resolve(outcome: "yes" | "no"): Promise<boolean>;
  pick(handle: string, side: "yes" | "no"): Promise<{ ok: boolean; reason?: "closed" | "funds" | "not_player"; duplicate?: boolean }>;
  members(): string[];
}
let bot: BotHooks | undefined;
export function bindBot(h: BotHooks): void {
  bot = h;
}
let groupTitle = "";
export function setGroupTitle(t: string): void {
  groupTitle = t;
}

export function bindKnown(fn: () => string[]): void {
  knownIds = fn;
}
export function noteGroup(id: string): void {
  groupHint = id;
}

const nameOf = (id: string): string => DEMO_PADS.find(([i]) => i === id)?.[1] ?? aliasFor(id);
const realPlayers = (): string[] => {
  if (seeded) return DEMO_PADS.map(([i]) => i);
  const group = (bot?.members() ?? []).filter((h) => NAMES.has(h));
  const ids = group.length ? group : knownIds().filter((h) => NAMES.has(h));
  const me = hostId();
  return me && !ids.includes(me) ? [me, ...ids] : ids;
};
export const hostId = (): string | undefined => (seeded ? "demo-alex" : process.env.HOST_ID || DEFAULT_ME);

// Historical hit rate for a person, cached for a minute. Falls back to 50/50 when there is no real history.
const odds = new Map<string, { v: number | null; at: number }>();
function oddsFor(alias: string): number {
  const c = odds.get(alias);
  if (!c || Date.now() - c.at > 60_000) {
    odds.set(alias, { v: c?.v ?? null, at: Date.now() });
    void hitRate(alias).then((v) => odds.set(alias, { v: v ?? null, at: Date.now() })).catch(() => undefined);
  }
  return c?.v ?? 50;
}
const status = (v: unknown): string => (v ? "connected" : "unavailable");

export function snapshot(): any {
  const me = hostId() ?? DEFAULT_ME;
  const players = realPlayers();
  const g = getState();
  const live = g.phase === "open" ? g : undefined;
  const room = {
    name: groupTitle || "The Build Crew",
    membersOnline: players.length,
    photon: status(hasSender() || process.env.TELEGRAM_BOT_TOKEN),
    snowflake: status(process.env.SNOWFLAKE_ACCOUNT),
    nessie: status(process.env.NESSIE_API_KEY),
  };
  const base = { room, players: players.map((id) => ({ id, name: nameOf(id), balance: balanceOf(id) })), messages: [], activity: getActivity(), session: started };

  // 1. A real bet is running in the Telegram group.
  if (live) {
    const entries = [...live.picks];
    const isTarget = me === live.targetId;
    const decoyReady = Boolean(live.decoyPerson && live.decoyItem);
    // The target holds a decoy bet: they only ever see the decoy question and their own pick, never the real bet.
    const visible = isTarget ? entries.filter(([h]) => h === me) : entries.filter(([h]) => h !== live.targetId);
    const mine = live.picks.get(me);
    const subject = isTarget ? live.decoyPerson ?? "" : live.targetAlias ?? "";
    const prediction =
      isTarget && !decoyReady
        ? undefined
        : {
            id: live.betId,
            question: isTarget ? `Will ${live.decoyPerson} ${live.decoyItem} today?` : `Will ${live.targetAlias} ${live.item} today?`,
            yesPct: oddsFor(subject),
            noPct: 100 - oddsFor(subject),
            stage: "open",
            entryAmount: STAKE,
            pool: (isTarget ? entries.length : visible.length) * STAKE,
            reasoning: !isTarget && live.reason ? live.reason : "Picked from recent group chat activity.",
            source: live.planned ? "snowflake" : "scripted",
            picks: visible.map(([id, side]) => ({ name: nameOf(id), choice: side.toUpperCase(), amount: STAKE, status: "confirmed" })),
          };
    return {
      ...base,
      me: { id: me, name: nameOf(me), balance: balanceOf(me), initial: START_CHIPS, staked: mine ? STAKE : 0, isHost: true, myPick: mine ? mine.toUpperCase() : null },
      prediction,
      result: latestResult() ?? null,
      hostStage: "picks_open",
      picksLogged: visible.length,
      picksExpected: isTarget ? live.players.length : Math.max(live.players.length - 1, visible.length),
    };
  }

  // 2. No real bet: show the demo prediction if a host started one, otherwise the idle state with the last real result.
  const mine = pred?.picks.get(me);
  const picks = pred ? [...pred.picks] : [];
  const stage = pred?.stage;
  const hostStage =
    generating || g.phase === "reading"
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
    ...base,
    me: { id: me, name: nameOf(me), balance: balanceOf(me), initial: seeded ? INITIAL : START_CHIPS, staked: mine?.amount ?? 0, isHost: true, myPick: mine?.choice ?? null },
    prediction: pred && {
      id: pred.id,
      question: pred.question,
      yesPct: pred.yesPct,
      noPct: 100 - pred.yesPct,
      stage: pred.stage,
      entryAmount: ENTRY,
      pool: picks.reduce((t, [, p]) => t + p.amount, 0),
      reasoning: pred.reasoning,
      source: pred.source,
      picks: picks.map(([id, p]) => ({ name: nameOf(id), choice: p.choice, amount: p.amount, status: "confirmed" })),
    },
    result: pred ? (result ?? null) : (latestResult() ?? null),
    hostStage,
    picksLogged: pred?.picks.size ?? 0,
    picksExpected: Math.max(players.length, pred?.picks.size ?? 0),
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

const realBetRunning = (): boolean => getState().phase !== "idle";

export async function generate(): Promise<Out> {
  if (realBetRunning()) return fail(409, "A real bet is running in the group. Resolve it first.");
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

export async function select(predictionId: string, choice: unknown): Promise<Out> {
  if (choice !== "YES" && choice !== "NO") return fail(400, "Choice must be YES or NO.");
  const live = getState();
  if (live.phase === "open") {
    // Real bet: same code path as a pick sent to the bot in a DM.
    if (predictionId !== live.betId) return fail(404, "Prediction not found.");
    if (!bot) return fail(503, "The bot is still starting.");
    const r = await bot.pick(hostId() ?? DEFAULT_ME, choice === "YES" ? "yes" : "no");
    if (r.ok) return ok(r.duplicate ? { duplicate: true } : {});
    return r.reason === "funds" ? fail(400, "Not enough chips.") : r.reason === "not_player" ? fail(403, "You're not part of this bet.") : fail(409, "Picks are closed.");
  }
  if (!pred || pred.id !== predictionId) return fail(404, "Prediction not found.");
  return addPick(hostId() ?? "host", choice);
}

export async function simulatePicks(): Promise<Out> {
  if (realBetRunning()) return fail(409, "A real bet is live. Demo controls are paused.");
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
  if (realBetRunning()) return fail(409, "A real bet is live. Demo controls are paused.");
  if (!pred || pred.stage !== "open") return fail(409, "Nothing to lock.");
  pred.stage = "locked";
  ev("prediction", "Picks locked", pred.id);
  return ok();
}

export async function resolve(outcome: unknown): Promise<Out> {
  if (outcome !== "YES" && outcome !== "NO") return fail(400, "Outcome must be YES or NO.");
  if (getState().phase === "open") {
    // Real bet: settle it through the bot, so chips, the group announcement and the result record all match.
    if (!bot) return fail(503, "The bot is still starting.");
    const done = await bot.resolve(outcome === "YES" ? "yes" : "no");
    return done ? ok({ result: latestResult() }) : fail(409, "This bet was already settled.");
  }
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

// Undo everything the demo routes created: refund open stakes, restore seeded players, drop demo log entries.
async function clearDemo(): Promise<void> {
  if (pred && (pred.stage === "open" || pred.stage === "locked")) {
    for (const [id, p] of pred.picks) await transfer(POT, id, p.amount); // give unsettled stakes back
  }
  if (seeded) {
    for (const [id] of DEMO_PADS) setBalance(id, INITIAL);
    setBalance(POT, 0);
    seeded = false;
  }
  removeDemoEntries();
  pred = undefined;
  result = undefined;
  started = false;
}

export async function reset(): Promise<Out> {
  if (pred?.stage === "settling") return fail(409, "Settlement is processing. Try again in a moment.");
  if (realBetRunning()) return fail(409, "A real bet is running in the group. Resolve it first.");
  await clearDemo();
  return ok();
}

// The bot calls this when a real bet opens, so no demo prediction can linger behind it.
export async function onRealBetOpened(): Promise<void> {
  if (pred?.stage === "settling") return;
  await clearDemo();
}

// Puts the app in the populated state from the design mockups: three picks, pool of 6, chat feed filled in.
export async function seed(): Promise<Out> {
  if (realBetRunning()) return fail(409, "A real bet is running in the group.");
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
  msg("Akshay", "He's definitely going to say it again.", false, { at: ago(3), demo: true });
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
