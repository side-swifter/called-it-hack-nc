// App-facing game model: one prediction at a time, chips moved through chips.ts, state served as Snapshot.
import { POT, balanceOf, transfer } from "./chips.js";
import { NAMES, aliasFor } from "./config.js";
import { planBets, recentChat } from "./brain.js";
import { ITEMS } from "./config.js";
import { addMessage, getActivity, getMessages, hasSender, logEvent, sendToGroup } from "./events.js";

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
  source: "snowflake" | "scripted";
  stage: Stage;
  picks: Map<string, Pick>;
  groupId?: string;
}
let pred: Pred | undefined;
let result: any;
let started = false;
let generating = false;
let counter = 0;
let knownIds: () => string[] = () => [];
let groupHint = ""; // most recent group chat id

export function bindKnown(fn: () => string[]): void {
  knownIds = fn;
}
export function noteGroup(id: string): void {
  groupHint = id;
}

const nameOf = (id: string): string => DEMO_PADS.find(([i]) => i === id)?.[1] ?? aliasFor(id);
const realPlayers = (): string[] => knownIds().filter((h) => NAMES.has(h));
export const hostId = (): string | undefined => process.env.HOST_ID || realPlayers()[0] || knownIds()[0];
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
  logEvent("agent", "Demo session started");
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
    logEvent("prediction", `${real ? "Snowflake" : "Sample"} prediction created: ${question}`, pred.id);
    const msg = `New prediction! ${question} Reply YES or NO in the app. ${ENTRY} demo chips per pick.`;
    addMessage("Photon AI", msg, true);
    const sent = await sendToGroup(msg);
    logEvent("agent", sent ? "Photon announcement sent" : "Photon announcement not sent (no live group)", pred.id, sent ? "ok" : "failed");
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
  logEvent("chips", `${nameOf(id)} selected ${choice}`, pred.id);
  logEvent("chips", `Pool reached ${[...pred.picks.values()].reduce((s, p) => s + p.amount, 0)} chips`, pred.id);
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
  logEvent("prediction", "Picks locked", pred.id);
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
  logEvent("prediction", `Outcome confirmed: ${outcome}`, p.id);
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
  logEvent("chips", `Settlement completed: ${pool} chips distributed`, p.id);
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
  addMessage("Photon AI", announcement, true);
  const sent = await sendToGroup(announcement);
  r.announcementStatus = sent ? "delivered" : "failed";
  r.photonOk = sent;
  logEvent("agent", sent ? "Photon result announcement delivered" : "Photon result announcement failed", p.id, sent ? "ok" : "failed");
  return ok({ result: r });
}

export function reset(): Out {
  if (pred?.stage === "settling") return fail(409, "Settlement is processing. Try again in a moment.");
  pred = undefined;
  result = undefined;
  started = false;
  logEvent("agent", "Demo reset to baseline");
  return ok();
}

export async function postMessage(text: unknown): Promise<Out> {
  if (typeof text !== "string" || !text.trim()) return fail(400, "Message is empty.");
  const sent = await sendToGroup(text.trim());
  if (!sent) return fail(503, "Couldn't deliver: no live group chat yet.");
  addMessage(nameOf(hostId() ?? "host"), text.trim());
  return ok({ delivered: true });
}
