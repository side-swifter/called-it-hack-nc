import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { telegram } from "spectrum-ts/providers/telegram";
import type { Message, Space } from "spectrum-ts";
import { ENTRY_FEE_CHIPS, PLACEBO_BET, aliasFor } from "../vibebet/config.js";
import { HOUSE, transfer } from "../vibebet/chips.js";
import { logMessage, logOutcome, writeBet } from "../vibebet/brain.js";
import {
  enter,
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

async function handleGroupMessage(
  app: Awaited<ReturnType<typeof Spectrum>>,
  space: Space,
  text: string | undefined,
  message: Message,
): Promise<void> {
  const state = getState();
  const botPhone = message.platform === "telegram" ? "" : imessage(space).phone;
  if (message.sender?.id) known.add(message.sender.id);
  if (text && message.sender?.id) logMessage(message.sender.id, text);

  // Dedicated lines deliver an "addMember" event when the bot is added; shared
  // lines don't, so the first message in the group is the fallback trigger.
  const content = message.content;
  const botWasAdded = content.type === "addMember" && content.members.includes(botPhone);
  if (content.type === "addMember" && !botWasAdded) return;

  const isBetCommand = content.type === "text" && /^\s*\/?bet\b/i.test(content.text);
  if (state.phase !== "idle" && isBetCommand) {
    await replyIn(space, "a bet is already live 👀 check ur dms, or say 'payday' once it happens.");
    return;
  }

  if (state.phase === "idle") {
    if (!isBetCommand && !botWasAdded) return; // only /bet starts a game
    startReading();
    await replyIn(space, "alr guys creating a bet 🎲 lemme read the gc rq...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    let players = await groupPlayers(space, botPhone);
    // If member lookup fails (shared line), fall back to whoever just spoke.
    const speaker = message.sender?.id;
    if (players.length === 0 && speaker) players = [speaker];
    if (players.length === 0) {
      await replyIn(space, "hm i can't see who's in here yet, someone say smth");
      resetState();
      return;
    }
    const target = players[Math.floor(Math.random() * players.length)];
    openBet(aliasFor(target), space, players);

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
  const state = getState();
  const enough = addProof(sender);
  if (!isGroupSpace(space, message)) {
    await replyIn(space, `got it 📸 (${state.proofs.size}/${PROOFS_NEEDED} confirmations)`);
  }
  if (enough) await announceResult();
}

async function announceResult(): Promise<void> {
  const state = getState();
  const group = state.groupSpace;
  if (state.phase !== "open") return;
  settle();
  const target = state.targetAlias ?? "someone";
  const winners = [...state.entries.values()];
  const handles = [...state.entries.keys()];
  const share = handles.length ? Math.floor(state.pot / handles.length) : 0;
  for (const h of handles) await transfer(HOUSE, h, share);
  logOutcome(target, "red jacket", true);
  const names = winners.length ? winners.join(", ") : "nobody (nobody bet, cowards)";
  const players = [...state.players];
  await say(
    group,
    `🚨 CALLED IT. ${target} really did it. ${state.proofs.size} people confirmed. ${names} split the ${state.pot}-chip pot. everyone else... pay up 💀`,
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

const known = new Set<string>();
const pendingBets = new Map<string, string>();
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
  openBet(aliasFor(target), null, players);
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
  const realBet = await writeBet(aliasFor(target), ENTRY_FEE_CHIPS);

  for (const handle of players) {
    const bet = handle === target ? PLACEBO_BET : realBet;
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
  if (me) known.add(me);
  if (me && pendingBets.has(me)) {
    const bet = pendingBets.get(me)!;
    pendingBets.delete(me);
    await replyIn(space, bet);
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

  if (state.phase === "open" && wantsIn(t)) {
    const senderId = message.sender?.id;
    if (!senderId) return;
    const before = state.entries.size;
    enter(senderId, aliasFor(senderId));
    if (state.entries.size > before) await transfer(senderId, HOUSE, ENTRY_FEE_CHIPS);
    await replyIn(space, `You're in. Pot is now ${state.pot} chips.`);
    return;
  }

  if (t.includes("proof") || t.includes("caught") || t.includes("happened")) {
    await recordProof(space, message);
    return;
  }

  await replyIn(space, "bet is open — reply 'in' to enter, or send proof when it happens.");
}

function wantsIn(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length < 60 && /(^|\s)!?(in|im in|i'm in|count me in|i'm|yes|yeah|bet)\b/.test(t) && !t.startsWith("no");
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
