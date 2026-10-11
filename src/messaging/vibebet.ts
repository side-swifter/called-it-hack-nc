import { readFileSync, writeFileSync } from "node:fs";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { telegram } from "spectrum-ts/providers/telegram";
import type { Message, Space } from "spectrum-ts";
import { IMPOSSIBLE_ITEMS, ITEMS, NAMES, STAKE, aliasFor } from "../vibebet/config.js";
import { recordResult, startApi } from "../vibebet/api.js";
import { addMessage, logEvent, registerSender } from "../vibebet/events.js";
import { noteGroup } from "../vibebet/snapshot.js";
import { computeSettlement, type Outcome } from "../vibebet/settle.js";
import { POT, balanceOf, leaderboard, transfer } from "../vibebet/chips.js";
import { classifyIntent, converse, judgeProof, logChat, planBets, writeDare, recentChat, warmUp, logOutcome, reactToPhoto, writeBet } from "../vibebet/brain.js";
import {
  pick,
  getState,
  openBet,
  resetState,
  settle,
  startReading,
  addProof,
  setDeadline,
  PROOFS_NEEDED,
} from "../vibebet/state.js";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function messageText(message: Message): string | undefined {
  const content = message.content;
  if (content.type === "text") return content.text;
  if (content.type === "markdown") return content.markdown;
  return undefined;
}

// Prevent the bot from replying to its own messages or rapid-firing.
const sentMessageIds = new Set<string>();
const lastReplyAt = new Map<string, number>();

const history = new Map<string, string[]>();
function note(spaceId: string, line: string): void {
  const h = history.get(spaceId) ?? [];
  h.push(line.slice(0, 300));
  if (h.length > 30) h.shift();
  history.set(spaceId, h);
}

const betsSent = new Map<string, string>();
// The target holds a decoy bet, so nothing they send can settle the real one.
let decoyHolder: string | undefined;
let targetId: string | undefined;
const DECOY_REJECTS = [
  "lol nice try, that's not it 🙄",
  "that's not proof of anything, stop larping",
  "hmm i'm gonna need way more than that 👀",
  "sure bud. not buying it",
];
let lastGroup: Space | undefined;

async function replyIn(space: Space, text: string): Promise<void> {
  note(space.id, `bot: ${text}`);
  if (space.id === lastGroup?.id) addMessage("Photon AI", text, true);
  const sent = await space.send(text);
  lastReplyAt.set(space.id, Date.now());
  if (sent?.id) {
    sentMessageIds.add(sent.id);
  }
}

export async function startVibeBetMessaging(): Promise<{ stop(): Promise<void> }> {
  const app = await Spectrum({
    projectId: requiredEnvironmentValue("SPECTRUM_PROJECT_ID"),
    projectSecret: requiredEnvironmentValue("SPECTRUM_PROJECT_SECRET"),
    providers: [
      ...(process.env.DISABLE_IMESSAGE ? [] : [imessage.config()]),
      ...(process.env.TELEGRAM_BOT_TOKEN ? [telegram.config({ botToken: process.env.TELEGRAM_BOT_TOKEN })] : []),
    ],
    options: { logLevel: "error" },
  });

  theApp = app;
  registerSender(async (text) => {
    if (!lastGroup) throw new Error("no group chat seen yet");
    await replyIn(lastGroup, text);
  });
  warmUp();
  startWeeklyDare();
  startApi(() => [...known]);
  const loop = consumeMessages(app);
  void loop.catch(() => undefined);

  console.log("VibeBet iMessage agent is running.");

  return {
    stop: async () => {
      await app.stop();
      await loop;
    },
  };
}

async function consumeMessages(
  app: Awaited<ReturnType<typeof Spectrum>>,
): Promise<void> {
  for await (const [space, message] of app.messages) {
    if (message.platform !== "imessage" && message.platform !== "telegram") continue;

    const isTelegram = message.platform === "telegram";
    const imessageMessage = (isTelegram ? {} : imessage(message)) as {
      itemType?: string;
      direction?: "inbound" | "outbound";
    };
    const text = messageText(message);
    const imessageSpace = { type: isGroupSpace(space, message) ? "group" : "dm" };

    // Skip the bot's own outbound echoes, known sent ids, and rapid-fire windows.
    if (imessageMessage.direction === "outbound") continue;
    if (sentMessageIds.has(message.id)) continue;
    const last = lastReplyAt.get(space.id);
    if (last !== undefined && Date.now() - last < 2000) continue;

    console.log("[RAW]", {
      spaceType: imessageSpace.type,
      spaceId: space.id,
      sender: message.sender?.id,
      direction: imessageMessage.direction,
      contentType: message.content.type,
      text,
      itemType: imessageMessage.itemType,
    });

    if (text && message.sender?.id) note(space.id, `${aliasFor(message.sender.id)}: ${text}`);

    try {
      if (imessageSpace.type === "group") {
        await handleGroupMessage(app, space, text, message);
      } else {
        await handleDM(space, text, message);
      }
    } catch (err) {
      console.error("Message handling error:", err);
    }
  }
}

function isGroupSpace(space: Space, message: Message): boolean {
  if (message.platform === "telegram") return space.id.startsWith("-");
  return imessage(space).type === "group";
}

// Telegram user ids are plain digits; iMessage handles are +E.164 or emails.
async function openDm(app: Awaited<ReturnType<typeof Spectrum>>, handle: string): Promise<Space> {
  const platform = /^\d+$/.test(handle) ? (telegram(app) as any) : (imessage(app) as any);
  return platform.space.create(handle);
}

async function tgApi(method: string, params: Record<string, string>): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return undefined;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}?${new URLSearchParams(params)}`);
    return (await res.json()).result;
  } catch {
    return undefined;
  }
}

// Telegram only gives us numeric ids; ask the Bot API for real first names.
async function resolveNames(chatId: string, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      if (NAMES.has(id) || !/^\d+$/.test(id)) return;
      const m = await tgApi("getChatMember", { chat_id: chatId, user_id: id });
      const name = m?.user?.first_name ?? m?.user?.username;
      if (name) NAMES.set(id, name);
    }),
  );
}

// Dynamic reply via Snowflake Cortex; falls back to a canned line.
async function smartReply(space: Space, message: Message, text: string, fallback: string, myBet?: string): Promise<void> {
  const sender = message.sender?.id;
  if (sender && /^\d+$/.test(sender) && !NAMES.has(sender)) {
    const chat = await tgApi("getChat", { chat_id: sender });
    if (chat?.first_name) NAMES.set(sender, chat.first_name);
  }
  const reply = await converse({
    name: sender ? aliasFor(sender) : "someone",
    text,
    where: isGroupSpace(space, message) ? "group" : "dm",
    phase: getState().phase,
    item: getState().item,
    myBet,
    recent: history.get(space.id) ?? [],
  });
  await replyIn(space, reply ?? fallback);
}

async function handleGroupMessage(
  app: Awaited<ReturnType<typeof Spectrum>>,
  space: Space,
  text: string | undefined,
  message: Message,
): Promise<void> {
  const state = getState();
  const botPhone = message.platform === "telegram" ? "" : imessage(space).phone;
  if (message.sender?.id) {
    remember(message.sender.id);
    addToGroup(space.id, message.sender.id);
  }
  if (text && message.sender?.id && !text.trim().startsWith("/")) {
    await resolveNames(space.id, [message.sender.id]);
    logChat(space.id, message.sender.id, aliasFor(message.sender.id), text);
    if (isGroupSpace(space, message)) {
      lastGroup = space;
      noteGroup(space.id);
      addMessage(aliasFor(message.sender.id), text);
    }
  }

  // Dedicated lines deliver an "addMember" event when the bot is added; shared
  // lines don't, so the first message in the group is the fallback trigger.
  const content = message.content;
  const botWasAdded = content.type === "addMember" && content.members.includes(botPhone);
  if (content.type === "addMember" && !botWasAdded) return;

  if (text && /^\s*\/(chips|balance|bank)\b/i.test(text)) {
    await replyIn(space, standings(isGroupSpace(space, message) ? space.id : undefined));
    return;
  }

  const isBetCommand = content.type === "text" && /^\s*\/bet\b/i.test(content.text);
  // /bet always starts a fresh game, dropping whatever was running.
  if (isBetCommand) {
    resetState();
    pendingBets.clear();
    gameGen++;
  }
  const myGame = gameGen;

  const poster = message.sender?.id;
  const live = getState();
  if (live.phase === "open" && poster && live.groupSpace?.id === space.id && !live.players.includes(poster)) {
    live.players.push(poster);
    const bet = currentRealBet;
    betsSent.set(poster, bet);
    try {
      await replyIn(await openDm(app, poster), bet);
    } catch {
      pendingBets.set(poster, bet);
    }
  }

  if (!isBetCommand && text && /called.?it|@called_it_ai_bot|\bbot\b/i.test(text)) {
    await smartReply(space, message, text, "i'm here 👀 type /bet to start a bet");
    return;
  }

  if (getState().phase === "idle") {
    if (!isBetCommand && !botWasAdded) return; // only /bet starts a game
    startReading();
    await replyIn(space, "alr guys creating a bet 🎲 lemme read the gc rq...");
    if (myGame !== gameGen) return; // a newer /bet replaced this one

    let players = await groupPlayers(space, botPhone);
    const speaker = message.sender?.id;
    if (players.length === 0 && speaker) players = [speaker];
    if (space.id.startsWith("-")) {
      await resolveNames(space.id, players);
      const count = await tgApi("getChatMemberCount", { chat_id: space.id });
      const humans = typeof count === "number" ? count - 1 : players.length;
      if (humans < 2) {
        await replyIn(space, "this needs at least 2 ppl in the gc. add a friend and /bet again 🎲");
        resetState();
        return;
      }
    }
    if (players.length < 2) {
      await replyIn(
        space,
        `i've only seen ${players.length} of u talk in here. i need 2+ to run it, get everyone to say something and /bet again 👀`,
      );
      resetState();
      return;
    }

    // Read the indexed chat from Snowflake and let Cortex pick the bet.
    const chatLines = await recentChat(space.id);
    const names = players.map(aliasFor);
    const plan = await planBets(chatLines, names, ITEMS);
    const byName = (n?: string) => players.find((p) => aliasFor(p).toLowerCase() === (n ?? "").trim().toLowerCase());
    const target = byName(plan?.target) ?? players[Math.floor(Math.random() * players.length)];
    const item = plan?.item ?? ITEMS[Math.floor(Math.random() * ITEMS.length)];
    pendingPlan = plan && byName(plan.target) ? plan : undefined;
    openBet(aliasFor(target), item, space, players);
    armDeadline();
    logEvent("prediction", `Bet opened for ${players.length} players`);

    await replyIn(
      space,
      "alr everyone the bets are on, check ur dm's for it. say a msg here if u don't get it.",
    );
    await sendPrivateBets(app, players, target);
    return;
  }

  if (state.phase === "open" && content.type === "attachment") {
    recordPhoto(message);
    return;
  }

  if (text === undefined) return;
  if (!isBetCommand && (await judgeIfPhotoPending(space, message, text))) return;
  const t = text.trim().toLowerCase();

  const resolveAs = state.phase === "open" ? parseResolve(t) : undefined;
  if (resolveAs) await announceResult(resolveAs);
}

// A photo alone proves nothing: stay quiet and wait for the sender's next text.
function recordPhoto(message: Message): void {
  const sender = message.sender?.id;
  if (sender) getState().photoFrom.add(sender);
}

// Judge the text that follows a photo. Returns true if it handled the message.
async function judgeIfPhotoPending(space: Space, message: Message, text: string): Promise<boolean> {
  const sender = message.sender?.id;
  const state = getState();
  if (!sender || state.phase !== "open" || !state.photoFrom.has(sender)) return false;
  if (sender === decoyHolder) {
    state.photoFrom.delete(sender);
    await replyIn(space, DECOY_REJECTS[Math.floor(Math.random() * DECOY_REJECTS.length)]);
    return true;
  }
  const verdict = await judgeProof({
    target: state.targetAlias ?? "someone",
    item: state.item,
    text,
    recent: history.get(space.id) ?? [],
  });
  await replyIn(space, verdict.reply);
  if (verdict.accept) {
    state.photoFrom.delete(sender);
    if (addProof(sender)) await announceResult();
  }
  return true;
}

const REBEL_CUT = 0.1; // share of the pot the target earns for going against the majority

// Auto-settles "no" if nobody proves it before the deadline. The captured state
// object guards against a timer from an earlier game settling a later one.
function armDeadline(): void {
  const game = getState();
  const minutes = Number(process.env.BET_MINUTES);
  const ms = (minutes > 0 ? minutes : 10) * 60_000;
  const timer = setTimeout(() => {
    if (getState() !== game) return;
    void announceResult("no").catch((err) => console.error("Deadline settle failed:", err));
  }, ms);
  timer.unref();
  setDeadline(timer, Date.now() + ms);
}

async function announceResult(outcome: Outcome = "yes"): Promise<void> {
  const state = getState();
  const group = state.groupSpace;
  if (state.phase !== "open") return;
  settle();
  const target = state.targetAlias ?? "someone";
  // The decoy holder bet on a different question: refund them and keep them out of the real pot.
  if (decoyHolder && state.picks.has(decoyHolder)) {
    await transfer(POT, decoyHolder, STAKE);
    state.picks.delete(decoyHolder);
  }
  decoyHolder = undefined;
  // Everyone's stakes are in the pot. Winners split it; if nobody won, everyone is refunded.
  const s = computeSettlement(state.picks, outcome, STAKE, targetId ? REBEL_CUT : 0);
  const winners = s.winnerIds.map(aliasFor);
  const losers = s.loserIds.map(aliasFor);
  if (s.targetBonus) await transfer(POT, targetId!, s.targetBonus);
  if (s.refundAll) {
    for (const h of s.loserIds) await transfer(POT, h, STAKE);
  } else {
    for (const h of s.winnerIds) await transfer(POT, h, s.payout);
  }
  logOutcome(target, state.item, outcome === "yes");
  recordResult({ target, item: state.item, winners, losers, pot: s.pot, outcome });
  const players = [...state.players];
  const headline =
    outcome === "yes" ? `🚨 ${target} CALLED IT. ${state.item} confirmed 📸` : `🧊 ${target} did not ${state.item}. no show.`;
  await say(
    group,
    `${headline}\n` +
      (winners.length ? `w for ${winners.join(", ")} 🏆 +${s.payout} chips each\n` : `nobody bet ${outcome} lol, everyone gets their chips back\n`) +
      (losers.length && winners.length ? `L for ${losers.join(", ")} 💀 -${STAKE} chips each\n` : "") +
      (s.targetBonus ? `${target} went against the crowd and walked off with ${s.targetBonus} chips 😈\n` : "") +
      `pot was ${s.pot} chips.\n🏦 ` +
      leaderboard([...state.picks.keys(), ...(s.targetBonus && targetId ? [targetId] : [])]).map(([h, c]) => `${aliasFor(h)} ${c}`).join(" · "),
    players,
  );
  pendingBets.clear();
  resetState();
}

// Post in the group if there is one; otherwise DM every player (free shared line).
async function say(group: Space | null, text: string, players: string[]): Promise<void> {
  if (group) return replyIn(group, text);
  for (const h of players) {
    try {
      await replyIn(await openDm(theApp!, h), text);
    } catch (err) {
      console.error(`Failed to DM ${h}:`, err);
    }
  }
}

const KNOWN_FILE = ".known-players.json";
const known = new Set<string>(
  (() => {
    try {
      return JSON.parse(readFileSync(KNOWN_FILE, "utf8")) as string[];
    } catch {
      return [];
    }
  })(),
);
function remember(id: string): void {
  if (known.has(id)) return;
  known.add(id);
  try {
    writeFileSync(KNOWN_FILE, JSON.stringify([...known]));
  } catch {}
}
const GROUPS_FILE = ".groups.json";
const groups = new Map<string, Set<string>>(
  (() => {
    try {
      return Object.entries(JSON.parse(readFileSync(GROUPS_FILE, "utf8")) as Record<string, string[]>).map(
        ([k, v]) => [k, new Set(v)] as [string, Set<string>],
      );
    } catch {
      return [];
    }
  })(),
);
function addToGroup(groupId: string, id: string): void {
  const set = groups.get(groupId) ?? new Set<string>();
  if (set.has(id)) return;
  set.add(id);
  groups.set(groupId, set);
  try {
    writeFileSync(GROUPS_FILE, JSON.stringify(Object.fromEntries([...groups].map(([k, v]) => [k, [...v]]))));
  } catch {}
}
let currentRealBet = "";
let pendingPlan: import("../vibebet/brain.js").BetPlan | undefined;

function standings(groupId?: string): string {
  const ids = groupId && groups.has(groupId) ? [...groups.get(groupId)!] : [...known];
  const rows = leaderboard(ids).map(([h, c], i) => `${i + 1}. ${aliasFor(h)} — ${c} chips`);
  return rows.length ? `🏦 chip leaderboard\n${rows.join("\n")}` : "nobody has chips yet, type /bet";
}
const pendingBets = new Map<string, string>();
let gameGen = 0;
let theApp: Awaited<ReturnType<typeof Spectrum>> | undefined;

// DM-only mode: everyone who texted the bot is a player.
async function startDmGame(app: Awaited<ReturnType<typeof Spectrum>>, space: Space): Promise<void> {
  const players = [...known];
  if (players.length < 2) {
    await replyIn(space, `need at least 2 ppl. get a friend to text me anything, then say "start" again. (${players.length}/2)`);
    return;
  }
  startReading();
  for (const h of players) {
    try {
      await replyIn(await openDm(app, h), "wsp guys 👀 called it here. lemme read the gc rq...");
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 3000));
  const target = players[Math.floor(Math.random() * players.length)];
  openBet(aliasFor(target), ITEMS[Math.floor(Math.random() * ITEMS.length)], null, players);
  armDeadline();
  await say(null, "alr the bets are on, check the next msg 👇", players);
  await sendPrivateBets(app, players, target);
}

async function groupPlayers(space: Space, botPhone: string): Promise<string[]> {
  try {
    if (space.id.startsWith("-")) return [...(groups.get(space.id) ?? [])]; // Telegram can't list members; use who has spoken here
    const members = await space.getMembers();
    return members.map((m) => m.id).filter((id) => id !== botPhone);
  } catch (err) {
    console.error("Could not read group members:", err);
    return [];
  }
}

async function sendPrivateBets(
  app: Awaited<ReturnType<typeof Spectrum>>,
  players: string[],
  target: string,
): Promise<void> {
  const state = getState();
  // Decoy: the target gets a bet about someone else, same format, so it looks real.
  const others = players.filter((p) => p !== target);
  const planned = pendingPlan ? others.find((p) => aliasFor(p).toLowerCase() === pendingPlan!.decoyPerson.trim().toLowerCase()) : undefined;
  const decoyPerson = planned ?? (others.length ? others[Math.floor(Math.random() * others.length)] : target);
  const decoyItem = IMPOSSIBLE_ITEMS[Math.floor(Math.random() * IMPOSSIBLE_ITEMS.length)];
  decoyHolder = target;
  targetId = target;
  const [realBet, decoyBet] = await Promise.all([
    writeBet(aliasFor(target), state.item, pendingPlan?.reason),
    writeBet(aliasFor(decoyPerson), decoyItem),
  ]);
  currentRealBet = realBet;
  console.log("[BETS]", { target: aliasFor(target), real: realBet, decoyFor: aliasFor(decoyPerson), decoy: decoyBet });

  await Promise.all(
    players.map(async (handle) => {
      const bet = handle === target ? decoyBet : realBet;
      betsSent.set(handle, bet);
      try {
        await replyIn(await openDm(app, handle), bet);
      } catch {
        // Telegram: bot can't DM until the user taps Start. Hold it for later.
        pendingBets.set(handle, bet);
        console.error(`Could not DM ${handle} yet, holding bet.`);
      }
    }),
  );
  if (pendingBets.size > 0 && getState().groupSpace) {
    await replyIn(
      getState().groupSpace!,
      `${pendingBets.size} of u haven't opened a chat with me yet 👀 tap t.me/Called_it_ai_bot → hit START and i'll send ur bet instantly.`,
    );
  }
}

async function handleDM(
  space: Space,
  text: string | undefined,
  message: Message,
): Promise<void> {
  const state = getState();
  const me = message.sender?.id;
  if (me) remember(me);
  if (me && pendingBets.has(me)) {
    const bet = pendingBets.get(me)!;
    pendingBets.delete(me);
    await replyIn(space, bet);
    return;
  }
  if (text && /^\s*\/?(chips|balance|bank)\b/i.test(text)) {
    await replyIn(space, standings(isGroupSpace(space, message) ? space.id : undefined));
    return;
  }
  if (state.phase === "idle" && text && !text.startsWith("/") && /\b(start|go|bet|play)\b/i.test(text)) {
    await startDmGame(theApp!, space);
    return;
  }

  if (state.phase === "open" && message.content.type === "attachment") {
    recordPhoto(message);
    return;
  }
  if (text && !text.startsWith("/") && (await judgeIfPhotoPending(space, message, text))) return;

  const GREETING = "yo, called it here 👋 ur all set. go type /bet in the group chat and i'll send everyone a bet in here.";
  if (text === undefined || text.trim().startsWith("/")) {
    await replyIn(space, GREETING);
    return;
  }
  if (state.phase === "idle") {
    await smartReply(space, message, text, GREETING);
    return;
  }

  const t = text.trim().toLowerCase();

  if (state.phase === "open") {
    const intent = await classifyIntent(text, me ? betsSent.get(me) : undefined);
    if ((intent === "yes" || intent === "no") && me) {
      const firstTime = !state.picks.has(me);
      if (firstTime && balanceOf(me) < STAKE) {
        await replyIn(space, `not enough chips for this one (${balanceOf(me)} left, need ${STAKE}) 💸`);
        return;
      }
      pick(me, intent);
      if (firstTime) await transfer(me, POT, STAKE);
      if (firstTime) logEvent("chips", `${aliasFor(me)} locked in ${intent.toUpperCase()}`);
      await replyIn(
        space,
        `locked in: ${intent} 🔒 ${STAKE} chips into the pot (pot: ${state.picks.size * STAKE} chips, you have ${balanceOf(me)})`,
      );
      return;
    }
    if (intent === "proof") {
      await replyIn(space, "ok then send the photo first 📸");
      return;
    }
  }

  await smartReply(
    space,
    message,
    text,
    `reply yes or no on the bet (${STAKE} chips), or send a photo as proof when it happens.`,
    message.sender?.id ? betsSent.get(message.sender.id) : undefined,
  );
}

function wantsYes(text: string): boolean {
  return text.length < 60 && /(^|\s)(yes|yeah|yep|in|im in|i'm in|bet)\b/.test(text) && !wantsNo(text);
}

function wantsNo(text: string): boolean {
  return text.length < 60 && /^(no|nope|nah|never|out)\b/.test(text);
}

// "/resolve", "/resolve yes", "/resolve no", "!resolve ..." (also "/resolve@botname"). Bare = yes.
// "/end" is kept as a shortcut for "/resolve no". Must be the whole message, not a mention of the word.
function parseResolve(text: string): Outcome | undefined {
  const m = /^[/!]resolve(?:@\w+)?(?:\s+(yes|no))?$/.exec(text.trim().toLowerCase());
  if (m) return (m[1] as Outcome | undefined) ?? "yes";
  if (/^\/end(?:@\w+)?$/.test(text.trim().toLowerCase())) return "no";
  return undefined;
}

// Every 7 days the last-place player in each Telegram group gets a dare.
const DARE_FILE = ".dare.json";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function startWeeklyDare(): void {
  const check = async () => {
    let last = Date.now();
    try {
      last = (JSON.parse(readFileSync(DARE_FILE, "utf8")) as { last: number }).last;
    } catch {
      writeFileSync(DARE_FILE, JSON.stringify({ last }));
      return; // first run: the week starts now
    }
    if (Date.now() - last < WEEK_MS) return;
    writeFileSync(DARE_FILE, JSON.stringify({ last: Date.now() }));
    for (const [groupId, members] of groups) {
      if (!groupId.startsWith("-") || members.size < 2) continue;
      const board = leaderboard([...members]);
      const loser = board[board.length - 1];
      if (board[0][1] === loser[1]) continue; // nobody has played yet
      await tgApi("sendMessage", { chat_id: groupId, text: await writeDare(aliasFor(loser[0])) });
    }
  };
  void check().catch(() => undefined);
  setInterval(() => void check().catch(() => undefined), 60 * 60 * 1000).unref();
}
