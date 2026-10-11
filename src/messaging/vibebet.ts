import { readFileSync, writeFileSync } from "node:fs";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { telegram } from "spectrum-ts/providers/telegram";
import type { Message, Space } from "spectrum-ts";
import { IMPOSSIBLE_ITEMS, ITEMS, NAMES, STAKE, aliasFor } from "../vibebet/config.js";
import { recordResult, startApi } from "../vibebet/api.js";
import { addMessage, addResult, logEvent, persist, registerSender, type StoredResult } from "../vibebet/events.js";
import { bindBot, noteGroup, onRealBetOpened, setGroupTitle } from "../vibebet/snapshot.js";
import { CATCH_UP_MS, lastSlot, loadDare, nextSlot, saveDare, type DareFile } from "../vibebet/dare.js";
import { computeSettlement, type Outcome } from "../vibebet/settle.js";
import { POT, balanceOf, leaderboard, mirrorSeq, nessieConfirmedSince, transfer } from "../vibebet/chips.js";
import { classifyGroupAction, classifyIntent, quickYesNo, converse, judgeProof, logChat, planBets, writeDare, recentChat, warmUp, logOutcome, reactToPhoto, writeBet, snowflakeStatus } from "../vibebet/brain.js";
import {
  pick,
  getState,
  openBet,
  resetState,
  settle,
  startReading,
  addProof,
  setDeadline,
  setBetMeta,
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

// Prevent the bot from replying to its own messages.
const sentMessageIds = new Set<string>();

const history = new Map<string, string[]>();
function note(spaceId: string, line: string): void {
  const h = history.get(spaceId) ?? [];
  h.push(line.slice(0, 300));
  if (h.length > 30) h.shift();
  history.set(spaceId, h);
}

const betsSent = new Map<string, string>();
// With decoys on, the target is DM'd a bet about someone else (their stake is refunded at settlement).
let decoyHolder: string | undefined;
let targetId: string | undefined;
// Optional extras, off unless enabled in .env: they add moving parts that are easy to trip over in a demo.
const DECOY_ON = process.env.DECOY_ENABLED === "true";
const DARE_ON = process.env.WEEKLY_DARE === "true";
let lastGroup: Space | undefined;

async function replyIn(space: Space, text: string): Promise<void> {
  note(space.id, `bot: ${text}`);
  if (space.id === lastGroup?.id) addMessage("Photon AI", text, true);
  const sent = await space.send(text);
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
  if (DARE_ON) startWeeklyDare();
  startApi(() => [...known]);
  bindBot({
    members: () => (lastGroup ? [...(groups.get(lastGroup.id) ?? [])] : []),
    pick: (handle, side) => placePick(handle, side, true),
    resolve: async (outcome) => {
      if (getState().phase !== "open") return false;
      await announceResult(outcome);
      return true;
    },
  });
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

    // Skip the bot's own outbound echoes and known sent ids.
    if (imessageMessage.direction === "outbound") continue;
    if (sentMessageIds.has(message.id)) continue;

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
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(10_000) });
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
      void ensureGroupTitle(space.id);
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

  const isBetCommand = content.type === "text" && /^\s*\/bet(?:@\w+)?\b/i.test(content.text);
  if (isBetCommand && getState().phase === "open") {
    const here = getState().groupSpace?.id === space.id;
    await replyIn(
      space,
      here
        ? "there's already a bet running 👀 tell me when it happened (or didn't) and i'll settle it, or say \"cancel the bet\" to scrap it."
        : "another group has a bet running right now, try again once it's settled.",
    );
    return;
  }
  // A new /bet replaces anything that was only being set up.
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
    console.log("[BET] reading chat for", space.id, "players:", players.length);
    const chatLines = await recentChat(space.id);
    const names = players.map(aliasFor);
    console.log("[BET] planning from", chatLines.length, "chat lines");
    const plan = await planBets(chatLines, names, ITEMS);
    console.log("[BET] plan:", plan ? `${plan.target} / ${plan.item}` : "none (fallback)");
    const byName = (n?: string) => players.find((p) => aliasFor(p).toLowerCase() === (n ?? "").trim().toLowerCase());
    const planned = byName(plan?.target);
    const snowflakeOn = Boolean(process.env.SNOWFLAKE_ACCOUNT);
    if (snowflakeOn && (!plan || !planned)) {
      // Never invent a bet: it has to come from what this group actually said.
      await replyIn(
        space,
        snowflakeStatus() === "unavailable"
          ? "my brain (snowflake) is down rn 😵 give me a minute and /bet again"
          : chatLines.length < 3
            ? "i haven't seen enough in this gc yet 👀 talk about what someone's wearing or doing today, then /bet again"
            : "couldn't find a clear bet in this chat 🤔 say what someone's wearing (or always does) a few times, then /bet again",
      );
      resetState();
      return;
    }
    const target = planned ?? players[Math.floor(Math.random() * players.length)];
    const item = plan?.item ?? ITEMS[Math.floor(Math.random() * ITEMS.length)];
    pendingPlan = plan && planned ? plan : undefined;
    openBet(aliasFor(target), item, space, players, target);
    setBetMeta({ planned: Boolean(pendingPlan), reason: pendingPlan?.reason ?? null });
    await onRealBetOpened();
    armDeadline();
    logEvent("prediction", `Bet opened for ${players.length} players`, getState().betId);

    await replyIn(
      space,
      "alr everyone the bets are on, check ur dm's for it (or just say yes or no right here). when it's over, tell me if it happened or not and i'll settle it.",
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

  if (state.phase !== "open") return;
  // A bare "yes"/"no" in the group counts as a pick; anything wordier is left to DMs so banter never costs chips.
  const groupPick = quickYesNo(text);
  if (groupPick && message.sender?.id) {
    await replyIn(space, await lockIn(message.sender.id, groupPick));
    return;
  }
  // Read normal chat: "it happened", "he didn't wear it", "cancel the bet"... (a /resolve typed out still works).
  const action = parseResolve(t) ?? (looksLikeSettle(t) ? await classifyGroupAction(text, { target: state.targetAlias ?? "someone", item: state.item, recent: history.get(space.id) ?? [] }) : "none");
  if (action === "yes" || action === "no") {
    await announceResult(action);
  } else if (action === "cancel") {
    const refunded = await cancelBet();
    await replyIn(space, `bet scrapped 🗑️ ${refunded ? `${refunded} stake${refunded === 1 ? "" : "s"} refunded.` : "nobody had bet yet."}`);
  }
}

// Cheap pre-filter so the AI only reads messages that could be about ending the bet.
function looksLikeSettle(t: string): boolean {
  return t.length < 140 && /\b(resolve|settle|settled|happened|didn'?t|did not|never|cancel|scrap|call it|called it|over|ended?|done|time'?s up|forget it|called off)\b/.test(t);
}

// A photo alone proves nothing: stay quiet and wait for the sender's next text.
function recordPhoto(message: Message): void {
  const sender = message.sender?.id;
  if (sender) {
    getState().photoFrom.add(sender);
    logEvent("agent", `${aliasFor(sender)} sent a photo as proof`, getState().betId);
  }
}

// Judge the text that follows a photo. Returns true if it handled the message.
async function judgeIfPhotoPending(space: Space, message: Message, text: string): Promise<boolean> {
  const sender = message.sender?.id;
  const state = getState();
  if (!sender || state.phase !== "open" || !state.photoFrom.has(sender)) return false;
  const isTarget = sender === targetId;
  const verdict = await judgeProof({
    target: state.targetAlias ?? "someone",
    item: state.item,
    text,
    recent: history.get(space.id) ?? [],
    sender: aliasFor(sender),
    senderIsTarget: isTarget,
  });
  await replyIn(space, verdict.reply);
  logEvent(
    "agent",
    `Proof from ${aliasFor(sender)} ${verdict.accept ? `accepted (${verdict.claim === "didnt" ? "shows it did NOT happen" : "shows it happened"})` : "rejected"}`,
    state.betId,
    verdict.accept ? "ok" : "failed",
  );
  if (verdict.accept) {
    state.photoFrom.delete(sender);
    // Claiming it with proof means you called it: lock in the side you're arguing if you never picked (the target can't bet on themselves).
    if (!isTarget && !state.picks.has(sender)) {
      const side: Outcome = verdict.claim === "didnt" ? "no" : "yes";
      const r = await placePick(sender, side, false);
      if (r.ok) await replyIn(space, `${aliasFor(sender)} u never picked, so i locked u in ${side.toUpperCase()} 🔒 ${STAKE} chips since ur calling it`);
    }
    if (verdict.claim === "didnt") {
      // Evidence that it did NOT happen settles the bet NO. If the target is the one who shows it, they defend themselves.
      await announceResult("no", { refutedByTarget: isTarget });
    } else if (addProof(sender)) {
      await announceResult("yes");
    }
  }
  return true;
}

// Auto-settles "no" if nobody proves it before the deadline. The captured state
// object guards against a timer from an earlier game settling a later one.
function armDeadline(): void {
  const game = getState();
  const minutes = Number(process.env.BET_MINUTES);
  const ms = (minutes > 0 ? minutes : 10) * 60_000;
  const timer = setTimeout(() => {
    if (getState() !== game) return;
    logEvent("agent", "Time ran out with no accepted proof: settling as NO", game.betId, "pending");
    void announceResult("no").catch((err) => console.error("Deadline settle failed:", err));
  }, ms);
  timer.unref();
  setDeadline(timer, Date.now() + ms);
}

async function announceResult(outcome: Outcome = "yes", opts: { refutedByTarget?: boolean } = {}): Promise<void> {
  const state = getState();
  const group = state.groupSpace;
  if (state.phase !== "open") return;
  settle();
  const betId = state.betId;
  const planned = state.planned;
  const seq0 = mirrorSeq(); // Nessie calls made from here on belong to this settlement
  const target = state.targetAlias ?? "someone";
  // The decoy holder bet on a different question: refund them and keep them out of the real pot.
  if (decoyHolder && state.picks.has(decoyHolder)) {
    await transfer(POT, decoyHolder, STAKE);
    logEvent("chips", `${aliasFor(decoyHolder)} refunded ${STAKE} chips`, betId);
    state.picks.delete(decoyHolder);
  }
  decoyHolder = undefined;
  // Everyone's stakes are in the pot. Winners split it; if nobody won, everyone is refunded.
  const s = computeSettlement(state.picks, outcome, STAKE, { refutedByTarget: Boolean(opts.refutedByTarget && targetId) });
  const winners = s.winnerIds.map(aliasFor);
  const losers = s.loserIds.map(aliasFor);
  if (s.targetBonus) {
    await transfer(POT, targetId!, s.targetBonus);
    logEvent("chips", `${target} earned ${s.targetBonus} chips for proving it did not happen`, betId);
  }
  if (s.refundAll) {
    for (const h of s.loserIds) await transfer(POT, h, STAKE);
    if (s.loserIds.length) logEvent("chips", `Nobody called it: ${s.loserIds.length} stakes refunded`, betId);
  } else {
    for (const h of s.winnerIds) {
      await transfer(POT, h, s.payout);
      logEvent("chips", `${aliasFor(h)} won ${s.payout} chips`, betId);
    }
  }
  logOutcome(target, state.item, outcome === "yes", group?.id);
  recordResult({ target, item: state.item, winners, losers, pot: s.pot, outcome, betId });
  const players = [...state.players];
  const callers = winners.length ? `${winners.join(" & ")} CALLED IT. ` : "";
  const headline =
    outcome === "yes"
      ? `🚨 ${callers}${target} did it: ${state.item} confirmed 📸`
      : s.defended
        ? `🛡️ ${target} shut it down. did NOT ${state.item}, proof accepted.`
        : `🧊 ${callers}${target} did not ${state.item}. no show.`;
  const announcement =
    `${headline}\n` +
    (winners.length ? `w for ${winners.join(", ")} 🏆 +${s.payout} chips each\n` : s.defended ? "" : `nobody bet ${outcome} lol, everyone gets their chips back\n`) +
    (losers.length && (winners.length || s.defended) ? `L for ${losers.join(", ")} 💀 -${STAKE} chips each\n` : "") +
    (s.targetBonus ? `${target} defended themselves and walked off with ${s.targetBonus} chips 😈\n` : "") +
    `pot was ${s.pot} chips.\n🏦 ` +
    leaderboard([...state.picks.keys(), ...(s.targetBonus && targetId ? [targetId] : [])]).map(([h, c]) => `${aliasFor(h)} ${c}`).join(" · ");

  // Real result record for the app. Delivery and Nessie flags stay false until they actually happen.
  const rows: StoredResult["rows"] = [...state.picks].map(([h, side]) => ({
    name: aliasFor(h),
    choice: side.toUpperCase(),
    correct: !s.refundAll && side === outcome,
    contributed: STAKE,
    payout: s.refundAll ? STAKE : side === outcome ? s.payout : 0,
    balance: balanceOf(h),
  }));
  if (s.targetBonus && targetId) rows.push({ name: target, choice: "—", correct: false, contributed: 0, payout: s.targetBonus, balance: balanceOf(targetId) });
  const res = addResult({
    predictionId: betId,
    outcome: outcome === "yes" ? "YES" : "NO",
    headline: outcome === "yes" ? `Confirmed. ${target} did it: '${state.item}'` : `Not today. ${target} didn't: '${state.item}'`,
    pool: s.pot,
    announcement,
    announcementStatus: "sending",
    snowflakeOk: planned,
    nessieOk: false,
    photonOk: false,
    rows,
  });
  void nessieConfirmedSince(seq0).then((ok) => {
    res.nessieOk = ok;
    persist();
  });

  const delivered = await say(group, announcement, players);
  res.photonOk = delivered;
  res.announcementStatus = delivered ? "delivered" : "failed";
  logEvent("agent", delivered ? "Result announced in the group" : "Result announcement could not be delivered", betId, delivered ? "ok" : "failed");
  persist();
  pendingBets.clear();
  resetState();
}

// Post in the group if there is one; otherwise DM every player (free shared line). True if anything was delivered.
async function say(group: Space | null, text: string, players: string[]): Promise<boolean> {
  if (group) {
    try {
      await replyIn(group, text);
      return true;
    } catch (err) {
      console.error("Failed to post result in the group:", err);
      return false;
    }
  }
  let any = false;
  for (const h of players) {
    try {
      await replyIn(await openDm(theApp!, h), text);
      any = true;
    } catch (err) {
      console.error(`Failed to DM ${h}:`, err);
    }
  }
  return any;
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
// One code path for every pick, whether it came from a DM to the bot or from the app.
async function placePick(
  handle: string,
  side: Outcome,
  requirePlayer: boolean,
): Promise<{ ok: boolean; reason?: "closed" | "funds" | "not_player"; duplicate?: boolean }> {
  const state = getState();
  if (state.phase !== "open") return { ok: false, reason: "closed" };
  if (requirePlayer && !state.players.includes(handle)) return { ok: false, reason: "not_player" };
  const previous = state.picks.get(handle);
  if (!previous && balanceOf(handle) < STAKE) return { ok: false, reason: "funds" };
  pick(handle, side);
  if (!previous) {
    await transfer(handle, POT, STAKE);
    logEvent("chips", `${aliasFor(handle)} locked in ${side.toUpperCase()}`, state.betId);
  }
  return { ok: true, duplicate: previous === side };
}

// Locks in a pick and returns the reply to send.
async function lockIn(me: string, side: Outcome): Promise<string> {
  const r = await placePick(me, side, false);
  if (!r.ok) {
    return r.reason === "funds" ? `not enough chips for this one (${balanceOf(me)} left, need ${STAKE}) 💸` : "picks are closed on this one.";
  }
  const state = getState();
  return `locked in: ${side} 🔒 ${STAKE} chips into the pot (pot: ${state.picks.size * STAKE} chips, you have ${balanceOf(me)})`;
}

// Scraps the open bet and gives every staked chip back. Returns how many stakes were refunded.
async function cancelBet(): Promise<number> {
  const state = getState();
  const staked = [...state.picks.keys()];
  const betId = state.betId;
  resetState(); // clears the deadline timer and phase first, so nothing else can settle this bet
  for (const h of staked) await transfer(POT, h, STAKE);
  logEvent("agent", `Bet cancelled, ${staked.length} stakes refunded`, betId);
  decoyHolder = undefined;
  pendingBets.clear();
  gameGen++;
  return staked.length;
}

const groupTitles = new Set<string>();
async function ensureGroupTitle(chatId: string): Promise<void> {
  if (!chatId.startsWith("-") || groupTitles.has(chatId)) return;
  groupTitles.add(chatId);
  const chat = await tgApi("getChat", { chat_id: chatId });
  if (chat?.title) setGroupTitle(chat.title);
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
  openBet(aliasFor(target), ITEMS[Math.floor(Math.random() * ITEMS.length)], null, players, target);
  await onRealBetOpened();
  armDeadline();
  logEvent("prediction", `Bet opened for ${players.length} players`, getState().betId);
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
  targetId = target;
  let decoyBet: string | undefined;
  if (DECOY_ON) {
    // Decoy: the target gets a bet about someone else, same format, so it looks real.
    const others = players.filter((p) => p !== target);
    const planned = pendingPlan ? others.find((p) => aliasFor(p).toLowerCase() === pendingPlan!.decoyPerson.trim().toLowerCase()) : undefined;
    const decoyPerson = planned ?? (others.length ? others[Math.floor(Math.random() * others.length)] : target);
    const decoyItem = IMPOSSIBLE_ITEMS[Math.floor(Math.random() * IMPOSSIBLE_ITEMS.length)];
    decoyHolder = target;
    setBetMeta({ decoyPerson: aliasFor(decoyPerson), decoyItem });
    decoyBet = await writeBet(aliasFor(decoyPerson), decoyItem, undefined, state.groupSpace?.id);
  } else {
    decoyHolder = undefined;
  }
  const realBet = await writeBet(aliasFor(target), state.item, pendingPlan?.reason, state.groupSpace?.id);
  currentRealBet = realBet;
  console.log("[BETS]", { target: aliasFor(target), real: realBet, decoy: decoyBet ?? "off" });

  await Promise.all(
    players.map(async (handle) => {
      const bet = handle === target && decoyBet ? decoyBet : realBet;
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
      await replyIn(space, await lockIn(me, intent));
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

// Every Sunday at 21:00 (server local time) the last-place player in each Telegram group gets a dare.
// Last place = lowest chip balance in the group; ties go to whoever comes first alphabetically.
function startWeeklyDare(): void {
  const check = async () => {
    const now = new Date();
    const slot = lastSlot(now);
    const saved = loadDare();
    if (!saved) {
      saveDare({ last: now.getTime() }); // first run: the first week starts now
      return;
    }
    if (saved.last >= slot.getTime()) return; // this week's slot is already handled
    // A slot we missed while the bot was down is only posted late within the catch-up window.
    if (now.getTime() - slot.getTime() > CATCH_UP_MS) {
      saveDare({ ...saved, last: now.getTime() });
      return;
    }
    const file: DareFile = { ...saved, last: now.getTime() };
    saveDare(file); // claim the slot before sending so a restart can't post twice
    for (const [groupId, members] of groups) {
      if (!groupId.startsWith("-") || members.size < 2) continue;
      const board = leaderboard([...members]);
      const low = board[board.length - 1][1];
      if (board[0][1] === low) continue; // nobody has played yet
      const loser = board
        .filter(([, chips]) => chips === low)
        .map(([id]) => ({ id, name: aliasFor(id) }))
        .sort((a, b) => a.name.localeCompare(b.name))[0];
      const text = await writeDare(loser.name);
      const sent = await tgApi("sendMessage", { chat_id: groupId, text });
      const postedAt = new Date().toISOString();
      file.groups = { ...file.groups, [groupId]: { text, name: loser.name, postedAt } };
      Object.assign(file, { text, name: loser.name, groupId, postedAt });
      saveDare(file);
      logEvent("agent", `Weekly dare for ${loser.name}: ${text}`, undefined, sent ? "ok" : "failed");
    }
  };
  void check().catch(() => undefined);
  const arm = (): void => {
    // wake right after the next Sunday 21:00; the hourly tick below is only a safety net
    const wait = Math.min(nextSlot().getTime() - Date.now() + 1000, 2 ** 31 - 1);
    setTimeout(() => {
      void check().catch(() => undefined);
      arm();
    }, wait).unref();
  };
  arm();
  setInterval(() => void check().catch(() => undefined), 60 * 60 * 1000).unref();
}

// Hooks for tests only: lets a script drive a round without Telegram.
export const __testing = {
  judgeIfPhotoPending,
  announceResult,
  placePick,
  setTarget(id: string | undefined): void {
    targetId = id;
  },
  setDecoyHolder(id: string | undefined): void {
    decoyHolder = id;
  },
};
