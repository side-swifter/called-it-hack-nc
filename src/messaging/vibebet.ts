import { readFileSync, writeFileSync } from "node:fs";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { telegram } from "spectrum-ts/providers/telegram";
import type { Message, Space } from "spectrum-ts";
import { ITEMS, NAMES, aliasFor } from "../vibebet/config.js";
import { POT, balanceOf, leaderboard, transfer } from "../vibebet/chips.js";
import { logMessage, logOutcome, reactToPhoto, writeBet } from "../vibebet/brain.js";
import {
  pick,
  getState,
  openBet,
  resetState,
  settle,
  startReading,
  addProof,
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

async function replyIn(space: Space, text: string): Promise<void> {
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

async function handleGroupMessage(
  app: Awaited<ReturnType<typeof Spectrum>>,
  space: Space,
  text: string | undefined,
  message: Message,
): Promise<void> {
  const state = getState();
  const botPhone = message.platform === "telegram" ? "" : imessage(space).phone;
  if (message.sender?.id) remember(message.sender.id);
  if (text && message.sender?.id) logMessage(message.sender.id, text);

  // Dedicated lines deliver an "addMember" event when the bot is added; shared
  // lines don't, so the first message in the group is the fallback trigger.
  const content = message.content;
  const botWasAdded = content.type === "addMember" && content.members.includes(botPhone);
  if (content.type === "addMember" && !botWasAdded) return;

  if (text && /^\s*\/?(chips|balance|bank)\b/i.test(text)) {
    await replyIn(space, standings());
    return;
  }

  const isBetCommand = content.type === "text" && /^\s*\/?bet\b/i.test(content.text);
  // /bet always starts a fresh game, dropping whatever was running.
  if (isBetCommand) {
    resetState();
    pendingBets.clear();
    gameGen++;
  }
  const myGame = gameGen;

  if (getState().phase === "idle") {
    if (!isBetCommand && !botWasAdded) return; // only /bet starts a game
    startReading();
    await replyIn(space, "alr guys creating a bet 🎲 lemme read the gc rq...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (myGame !== gameGen) return; // a newer /bet replaced this one

    let players = await groupPlayers(space, botPhone);
    // If member lookup fails (shared line), fall back to whoever just spoke.
    const speaker = message.sender?.id;
    if (players.length === 0 && speaker) players = [speaker];
    if (space.id.startsWith("-")) {
      await resolveNames(space.id, players);
      const count = await tgApi("getChatMemberCount", { chat_id: space.id });
      const humans = typeof count === "number" ? count - 1 : players.length;
      if (humans > players.length) {
        await replyIn(
          space,
          `heads up: i only know ${players.length} of ${humans} of u. everyone else send ANY msg here (or /start in my dm) then type /bet again.`,
        );
        resetState();
        return;
      }
    }
    if (players.length === 0) {
      await replyIn(space, "hm i can't see who's in here yet, someone say smth");
      resetState();
      return;
    }
    const target = players[Math.floor(Math.random() * players.length)];
    const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    openBet(aliasFor(target), item, space, players);

    await replyIn(
      space,
      "alr everyone the bets are on, check ur dm's for it. say a msg here if u don't get it.",
    );
    await sendPrivateBets(app, players, target);
    return;
  }

  if (state.phase === "open" && content.type === "attachment") {
    await recordProof(space, message);
    return;
  }

  if (text === undefined) return;
  const t = text.trim().toLowerCase();

  if (state.phase === "open" && wantsResolve(t)) {
    await announceResult();
  }
}

// Image understanding is faked: any photo (or "it happened") counts as proof.
async function recordProof(space: Space, message: Message): Promise<void> {
  const sender = message.sender?.id;
  if (!sender) return;
  const enough = addProof(sender);
  if (!isGroupSpace(space, message)) {
    const reaction = await reactToPhoto(getState().targetAlias ?? "someone", getState().item);
    await replyIn(space, reaction);
  }
  if (enough) await announceResult();
}

async function announceResult(): Promise<void> {
  const state = getState();
  const group = state.groupSpace;
  if (state.phase !== "open") return;
  settle();
  const target = state.targetAlias ?? "someone";
  const winnerIds = [...state.picks].filter(([, side]) => side === "yes").map(([h]) => h);
  const loserIds = [...state.picks].filter(([, side]) => side === "no").map(([h]) => h);
  const winners = winnerIds.map(aliasFor);
  const losers = loserIds.map(aliasFor);
  // Everyone's stakes are in the pot. Winners split it; if nobody won, everyone is refunded.
  const potSize = state.picks.size * STAKE;
  const bonus = winnerIds.length ? Math.floor(potSize / winnerIds.length) : 0;
  if (winnerIds.length) {
    for (const h of winnerIds) await transfer(POT, h, bonus);
  } else {
    for (const h of loserIds) await transfer(POT, h, STAKE);
  }
  logOutcome(target, state.item, true);
  const players = [...state.players];
  await say(
    group,
    `🚨 ${target} CALLED IT. ${state.item} confirmed 📸\n` +
      (winners.length ? `w for ${winners.join(", ")} 🏆 +${bonus} chips each\n` : "nobody bet yes lol, everyone gets their chips back\n") +
      (losers.length ? `L for ${losers.join(", ")} 💀 -${STAKE} chips each\n` : "") +
      `pot was ${potSize} chips.\n🏦 ` +
      leaderboard([...state.picks.keys()]).map(([h, c]) => `${aliasFor(h)} ${c}`).join(" · "),
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
const STAKE = 5;

function standings(): string {
  const rows = leaderboard([...known]).map(([h, c], i) => `${i + 1}. ${aliasFor(h)} — ${c} chips`);
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
  await say(null, "alr the bets are on, check the next msg 👇", players);
  await sendPrivateBets(app, players, target);
}

async function groupPlayers(space: Space, botPhone: string): Promise<string[]> {
  try {
    if (space.id.startsWith("-")) return [...known]; // Telegram can't list members
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
  const realBet = await writeBet(aliasFor(target), state.item);
  // Decoy: the target gets a bet about someone else, same format, so it looks real.
  const others = players.filter((p) => p !== target);
  const decoyPerson = others.length ? others[Math.floor(Math.random() * others.length)] : target;
  const decoyItem = ITEMS.filter((i) => i !== state.item)[Math.floor(Math.random() * (ITEMS.length - 1))];
  const decoyBet = await writeBet(aliasFor(decoyPerson), decoyItem);

  for (const handle of players) {
    const bet = handle === target ? decoyBet : realBet;
    try {
      const dmSpace = await openDm(app, handle);
      await replyIn(dmSpace, bet);
    } catch (err) {
      // Telegram: bot can't DM until the user taps Start. Hold it for later.
      pendingBets.set(handle, bet);
      console.error(`Could not DM ${handle} yet, holding bet.`);
    }
  }
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
    await replyIn(space, standings());
    return;
  }
  if (state.phase === "idle" && text && !text.startsWith("/") && /\b(start|go|bet|play)\b/i.test(text)) {
    await startDmGame(theApp!, space);
    return;
  }

  if (state.phase === "open" && message.content.type === "attachment") {
    await recordProof(space, message);
    return;
  }

  if (state.phase === "idle" || text === undefined) {
    await replyIn(
      space,
      "yo, called it here 👋 once 2+ friends have texted me, say \"start\" and i'll run a bet on one of u.",
    );
    return;
  }

  const t = text.trim().toLowerCase();

  if (state.phase === "open" && (wantsYes(t) || wantsNo(t))) {
    const senderId = message.sender?.id;
    if (!senderId) return;
    const firstTime = !state.picks.has(senderId);
    pick(senderId, wantsYes(t) ? "yes" : "no");
    if (firstTime) await transfer(senderId, POT, STAKE);
    await replyIn(
      space,
      `locked in: ${wantsYes(t) ? "yes" : "no"} 🔒 ${STAKE} chips into the pot (pot: ${state.picks.size * STAKE} chips, you have ${balanceOf(senderId)})`,
    );
    return;
  }

  if (t.includes("proof") || t.includes("caught") || t.includes("happened")) {
    await recordProof(space, message);
    return;
  }

  await replyIn(space, "reply yes or no on the bet (5 chips), or send a photo as proof when it happens.");
}

function wantsYes(text: string): boolean {
  return text.length < 60 && /(^|\s)(yes|yeah|yep|in|im in|i'm in|bet)\b/.test(text) && !wantsNo(text);
}

function wantsNo(text: string): boolean {
  return text.length < 60 && /^(no|nope|nah|never|out)\b/.test(text);
}

function wantsResolve(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "!resolve" ||
    t.includes("resolve") ||
    t.includes("settle") ||
    t.includes("it happened") ||
    t.includes("payday")
  );
}
