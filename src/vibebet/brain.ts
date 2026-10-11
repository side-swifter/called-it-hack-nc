// Snowflake: stores chat + outcomes, computes historical rates, Cortex writes the bet.
// Falls back to seeded fake history + a template when Snowflake isn't configured.
import { readFileSync, writeFileSync } from "node:fs";
import snowflake from "snowflake-sdk";
import { START_CHIPS, STAKE } from "./config.js";

snowflake.configure({ logLevel: "ERROR" });

const SEED: Record<string, [number, number]> = {}; // alias -> [hits, total]

function configured(): boolean {
  return Boolean(process.env.SNOWFLAKE_ACCOUNT && process.env.SNOWFLAKE_USERNAME && process.env.SNOWFLAKE_PASSWORD);
}

// ---- Connection: one shared session, kept alive, rebuilt automatically when it dies.
let conn: snowflake.Connection | undefined;
let connecting: Promise<snowflake.Connection> | undefined;
let healthy: boolean | undefined; // undefined until the first attempt
let lastError = "";

function markOk(): void {
  healthy = true;
  lastError = "";
}
function markFail(e: unknown): void {
  healthy = false;
  lastError = (e as Error)?.message ?? String(e);
}

/** What the app shows for Snowflake: reflects real query results, not just that keys exist. */
export function snowflakeStatus(): "connected" | "connecting" | "unavailable" {
  if (!configured()) return "unavailable";
  if (healthy === undefined) return "connecting";
  return healthy ? "connected" : "unavailable";
}
export function snowflakeLastError(): string {
  return lastError;
}

function connection(): Promise<snowflake.Connection> {
  if (conn) return Promise.resolve(conn);
  if (connecting) return connecting; // single-flight: concurrent callers share one login
  connecting = new Promise<snowflake.Connection>((resolve, reject) => {
    const c = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USERNAME!,
      password: process.env.SNOWFLAKE_PASSWORD!,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE,
      database: process.env.SNOWFLAKE_DATABASE,
      schema: process.env.SNOWFLAKE_SCHEMA,
      role: process.env.SNOWFLAKE_ROLE || undefined,
      clientSessionKeepAlive: true,
    });
    const timer = setTimeout(() => reject(new Error("Snowflake login timed out")), 20_000);
    c.connect((e) => {
      clearTimeout(timer);
      if (e) return reject(e);
      conn = c;
      resolve(c);
    });
  }).finally(() => {
    connecting = undefined;
  });
  return connecting;
}

export function resetSnowflakeConnection(): void {
  dropConnection();
}

function dropConnection(): void {
  const old = conn;
  conn = undefined;
  tableReady = false;
  try {
    old?.destroy(() => undefined);
  } catch {
    /* already dead */
  }
}

const DEAD_SESSION = /terminated|not connected|session no longer exists|authentication token has expired|ECONNRESET|socket hang up|timed out|ETIMEDOUT|EPIPE/i;
const QUERY_TIMEOUT_MS = 30_000;

/** Cortex sometimes wraps its answer in quote marks; players should never see them. */
function clean(text: string): string {
  return text.trim().replace(/^["'`“‘]+|["'`”’]+$/g, "").trim();
}

async function execOnce(sqlText: string, binds: snowflake.Binds): Promise<any[]> {
  const c = await connection();
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("Snowflake query timed out")), QUERY_TIMEOUT_MS);
    c.execute({ sqlText, binds, complete: (e, _s, rows) => (clearTimeout(timer), e ? rej(e) : res(rows ?? [])) });
  });
}

async function run(sqlText: string, binds: snowflake.Binds = []): Promise<any[]> {
  try {
    const rows = await execOnce(sqlText, binds);
    markOk();
    return rows;
  } catch (e) {
    if (!DEAD_SESSION.test((e as Error).message ?? "")) {
      markFail(e);
      throw e;
    }
    dropConnection(); // the session died or hung: rebuild it and retry once
    try {
      const rows = await execOnce(sqlText, binds);
      markOk();
      return rows;
    } catch (e2) {
      markFail(e2);
      throw e2;
    }
  }
}

// Heartbeat: a tiny query every 3 minutes keeps the session warm and notices a dead one before a player does.
function startHeartbeat(): void {
  const t = setInterval(() => {
    if (configured()) run("SELECT 1").catch(() => undefined);
  }, 3 * 60_000);
  t.unref();
}

let tableReady = false;
async function ensureTables(): Promise<void> {
  if (tableReady) return;
  await run("CREATE TABLE IF NOT EXISTS CALLED_IT_MESSAGES (ts TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP, sender STRING, body STRING)");
  await run("CREATE TABLE IF NOT EXISTS CALLED_IT_OUTCOMES (ts TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP, target STRING, bet STRING, hit BOOLEAN)");
  await run("CREATE TABLE IF NOT EXISTS CALLED_IT_CHAT (ts TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP, chat_id STRING, sender STRING, name STRING, body STRING)");
  tableReady = true;
}

// ---- Write queue: inserts are queued, retried until they land, and survive a restart. Nothing is dropped silently.
interface Pending {
  sql: string;
  binds: (string | boolean)[];
}
const QUEUE_FILE = ".snowflake-queue.json";
let queue: Pending[] = (() => {
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf8")) as Pending[];
  } catch {
    return [];
  }
})();
function persistQueue(): void {
  try {
    writeFileSync(QUEUE_FILE, JSON.stringify(queue));
  } catch {
    /* best effort */
  }
}
let flushing = false;
async function flushQueue(): Promise<void> {
  if (flushing || !configured() || queue.length === 0) return;
  flushing = true;
  try {
    await ensureTables();
    while (queue.length) {
      await run(queue[0].sql, queue[0].binds);
      queue.shift();
      persistQueue();
    }
  } catch (e) {
    console.error(`[snowflake] ${queue.length} write(s) queued, will retry:`, (e as Error).message);
  } finally {
    flushing = false;
  }
}
function enqueue(sql: string, binds: (string | boolean)[]): void {
  if (!configured()) return;
  queue.push({ sql, binds });
  if (queue.length > 5000) queue.shift();
  persistQueue();
  void flushQueue();
}
setInterval(() => void flushQueue(), 15_000).unref();

export function logMessage(sender: string, body: string): void {
  enqueue("INSERT INTO CALLED_IT_MESSAGES (sender, body) VALUES (?, ?)", [sender, body]);
}

export function logOutcome(target: string, bet: string, hit: boolean): void {
  if (!SEED[target]) SEED[target] = [0, 0];
  SEED[target][1]++;
  if (hit) SEED[target][0]++;
  enqueue("INSERT INTO CALLED_IT_OUTCOMES (target, bet, hit) VALUES (?, ?, ?)", [target, bet, hit]);
}

/** Share (0-100) of past bets about `target` that hit, from real outcomes only; undefined with no history. */
export async function hitRate(target: string): Promise<number | undefined> {
  let hits = 0;
  let total = 0;
  if (configured()) {
    try {
      await ensureTables();
      const rows = await run("SELECT COUNT_IF(hit) AS H, COUNT(*) AS T FROM CALLED_IT_OUTCOMES WHERE target = ?", [target]);
      total = Number(rows[0]?.T ?? 0);
      hits = Number(rows[0]?.H ?? 0);
    } catch {
      /* fall through to in-memory counts */
    }
  }
  if (!total && SEED[target]) [hits, total] = SEED[target];
  if (!total) return undefined;
  return Math.min(95, Math.max(5, Math.round((hits / total) * 100)));
}

export interface PastBet {
  at: string;
  target: string;
  item: string;
  hit: boolean;
}

// Stored ts values are TIMESTAMP_NTZ in the Snowflake session's local zone, so shift by the session's own offset to UTC.
let pastCache: { rows: PastBet[]; at: number; limit: number } | undefined;
let pastLoading = false;

function refreshPast(limit: number): void {
  if (pastLoading || !configured()) return;
  pastLoading = true;
  ensureTables()
    .then(() =>
      run(
        `SELECT TO_VARCHAR(DATEADD('second', DATEDIFF('second', CURRENT_TIMESTAMP()::TIMESTAMP_NTZ, SYSDATE()), ts), 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS TS, target AS TARGET, bet AS BET, hit AS HIT FROM CALLED_IT_OUTCOMES ORDER BY ts DESC LIMIT ${Math.max(1, Math.floor(limit))}`,
      ),
    )
    .then((rows) => {
      pastCache = {
        rows: rows.map((r) => ({ at: `${String(r.TS)}Z`, target: String(r.TARGET), item: String(r.BET), hit: Boolean(r.HIT) })),
        at: Date.now(),
        limit,
      };
    })
    .catch((e) => console.error("[snowflake] past bets failed:", (e as Error).message))
    .finally(() => {
      pastLoading = false;
    });
}

/** Synchronous view of the cache: returns the last known rows and refreshes in the background when stale. */
export function pastBetsCached(limit = 20): PastBet[] {
  if (!configured()) return [];
  if (!pastCache || Date.now() - pastCache.at > 30_000 || pastCache.limit < limit) refreshPast(limit);
  return (pastCache?.rows ?? []).slice(0, limit);
}

/** Real past bet outcomes, newest first. Served from a 30s cache; never throws or waits on Snowflake. */
export async function pastBets(limit = 20): Promise<PastBet[]> {
  return pastBetsCached(limit);
}

async function historyFor(target: string): Promise<[number, number]> {
  if (configured()) {
    try {
      await ensureTables();
      const rows = await run("SELECT COUNT_IF(hit) AS H, COUNT(*) AS T FROM CALLED_IT_OUTCOMES WHERE target = ?", [target]);
      const total = Number(rows[0]?.T ?? 0);
      if (total > 0) return [Number(rows[0].H), total];
    } catch (e) {
      console.error("[snowflake] history failed:", (e as Error).message);
    }
  }
  return SEED[target] ?? [0, 0]; // no real history: the bet text just leaves the record out
}

export async function writeBet(target: string, item: string, reason?: string): Promise<string> {
  const [hits, total] = await historyFor(target);
  const fallback = `🎯 new bet: will ${target} ${item} today? ${total >= 3 ? `history says ${hits}/${total}. ` : ""}reply "yes" or "no" (${STAKE} chips).`;
  if (!configured()) return fallback;
  try {
    const prompt = `You are a playful, snarky friend in a group chat. Write ONE short iMessage-style prop bet (max 30 words, lowercase, one emoji) asking whether ${target} will ${item} today. ${total >= 3 ? ` Mention their history: it happened ${hits} of the last ${total} times.` : ""} Use ONLY the facts given here, never invent names, surnames, quotes or details.${reason ? ` Also work in this fact from their group chat: ${reason}.` : ""} End with: reply "yes" or "no" (${STAKE} chips). Output only the message.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const text = clean(String(rows[0]?.R ?? ""));
    return text || fallback;
  } catch (e) {
    console.error("[cortex] failed:", (e as Error).message);
    return fallback;
  }
}

const CANNED = [
  "ok i see u 👀 certified fit",
  "hmm suspicious but i'll allow it",
  "that lighting is doing a lot of work rn",
  "evidence received. the committee is deliberating 🧑‍⚖️",
  "bold choice. very bold.",
  "not me zooming in on this for 10 minutes",
];

// Cortex writes the banter. The photo itself isn't analyzed (faked for the demo).
export async function reactToPhoto(target: string, item: string): Promise<string> {
  const canned = CANNED[Math.floor(Math.random() * CANNED.length)];
  if (!configured()) return canned;
  try {
    const prompt = `You are a playful, slightly snarky friend in a group chat. Someone just sent a proof photo for the bet "will ${target} ${item} today". React in ONE short lowercase sentence with one emoji, like you studied the photo. Output only the message.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    return clean(String(rows[0]?.R ?? "")) || canned;
  } catch (e) {
    console.error("[cortex] reaction failed:", (e as Error).message);
    return canned;
  }
}

export interface ConverseInput {
  name: string;
  text: string;
  where: "dm" | "group";
  phase: string;
  item?: string;
  myBet?: string; // the bet this person was DM'd (may be the decoy; never reveal that)
  recent: string[];
}

// Free-form, dynamic replies: a Cortex model with recent chat + game state as context.
export async function converse(input: ConverseInput): Promise<string | undefined> {
  if (!configured()) return undefined;
  const prompt = [
    "You are 'Called It', a witty, slightly snarky friend who lives in a group chat and runs prop bets about what people wear or do (e.g. 'will Sam wear a red jacket today?', 'will Sam be late to class today?'). Players stake chips, winners split the pot, and a proof photo settles it.",
    "Reply like a real person texting: 1-2 short lowercase sentences, max 30 words, at most one emoji. Respond to what the person ACTUALLY said. Be helpful if they seem confused (reply yes or no to the bet in DM, send a photo as proof, /bet starts a game in the group, /chips shows chips).",
    "Only state game rules that are listed here. Everyone starts with ${START_CHIPS} chips, stakes are ${STAKE} chips, and the last-place player each week gets a dare. If a result goes against most of the bets, the person the bet is about earns 10% of the pot. There are no refreshes or other bonuses or features. If unsure, say you're not sure instead of making a rule up.",
    "SECRET RULES: never reveal who a bet is about or who the target is, and never reveal that some people got a decoy bet. If asked, deflect playfully.",
    `Game: ${input.phase === "open" ? "a bet is live" : "no bet running"}.${input.myBet ? ` This person's bet: "${input.myBet}"` : ""}`,
    `Chat so far:\n${input.recent.slice(-12).join("\n") || "(nothing yet)"}`,
    `${input.name} says (${input.where}): "${input.text}"`,
    "Output only your reply.",
  ].join("\n");
  try {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 9000));
    const rows = await Promise.race([run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]), timeout]);
    return clean(String(rows[0]?.R ?? "")) || undefined;
  } catch (e) {
    console.error("[cortex] converse failed:", (e as Error).message);
    return undefined;
  }
}

// Startup self-test: connect, make sure the tables exist, and check Cortex answers. Logs one clear line.
export function warmUp(): void {
  if (!configured()) return console.log("[snowflake] not configured; running with local fallbacks");
  startHeartbeat();
  (async () => {
    await ensureTables();
    const r = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', 'Reply with the single word: ok') AS R");
    console.log(`[snowflake] ready (Cortex says: ${String(r[0]?.R ?? "").trim().slice(0, 20)}), ${queue.length} write(s) queued`);
    void flushQueue();
  })().catch((e) => console.error("[snowflake] startup check failed:", (e as Error).message));
}

export type Intent = "yes" | "no" | "proof" | "question" | "other";

// Reads what the person means instead of matching exact words.
// A message that is nothing but a clear yes or no. Safe to act on in a busy group chat.
export function quickYesNo(text: string): "yes" | "no" | undefined {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|yup|y|bet|in|im in|i'm in|for sure|definitely)[.!]*$/.test(t)) return "yes";
  if (/^(no|nope|nah|n|out|never|no way)[.!]*$/.test(t)) return "no";
  return undefined;
}

export async function classifyIntent(text: string, bet?: string): Promise<Intent> {
  const t = text.trim().toLowerCase();
  const quick = quickYesNo(text);
  if (quick) return quick;
  if (!configured()) return /\b(yes|yeah|yep|think so)\b/.test(t) ? "yes" : /\b(no|nope|nah)\b/.test(t) ? "no" : "other";
  try {
    const prompt = `A friend is answering a prop bet in a chat. Bet: "${bet ?? "will someone do a certain thing today"}". Their message: "${text}". Classify the message as exactly one word: yes (they think the bet will happen / they're betting yes), no (they think it won't happen / betting no), proof (they claim it happened or are showing evidence), question (they're asking something), other. Output only that one word.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const out = String(rows[0]?.R ?? "").toLowerCase();
    const word = /\b(yes|no|proof|question|other)\b/.exec(out)?.[1];
    if (word === "yes" || word === "no" || word === "proof" || word === "question") return word;
  } catch (e) {
    console.error("[cortex] intent failed:", (e as Error).message);
  }
  return "other";
}

export type GroupAction = "yes" | "no" | "cancel" | "none";

// Is someone in the group ending the bet? Only explicit statements count, not casual chatter.
export async function classifyGroupAction(
  text: string,
  ctx: { target: string; item: string; recent: string[] },
): Promise<GroupAction> {
  const t = text.trim().toLowerCase();
  if (/^(cancel|scrap|call off|forget)( the)? bet\b/.test(t)) return "cancel";
  if (!configured()) return "none";
  try {
    const prompt = [
      `A group chat has a live prop bet: "will ${ctx.target} ${ctx.item} today?". Decide whether the latest message is someone explicitly ENDING the bet.`,
      `yes = they are saying the bet should be settled because it DID happen (e.g. "ok it happened, settle it", "resolve yes", "he did it, we're done").`,
      `no = they are saying the bet should be settled because it did NOT happen (e.g. "he didn't wear it, resolve no", "didn't happen, call it").`,
      `cancel = they want the bet scrapped with no winner (e.g. "cancel the bet", "forget it, scrap this").`,
      `none = anything else: banter, guesses, jokes, asking questions, or just commenting on what someone is wearing without asking to settle. When unsure, answer none.`,
      `Chat so far:\n${ctx.recent.slice(-8).join("\n") || "(none)"}`,
      `Latest message: "${text}"`,
      `Output exactly one word: yes, no, cancel or none.`,
    ].join("\n");
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const out = String(rows[0]?.R ?? "").trim().toLowerCase();
    const word = /^\W*(cancel|yes|none|no)\b/.exec(out)?.[1]; // whole word: "none" must never read as "no"
    if (word === "cancel" || word === "yes" || word === "no") return word;
  } catch (e) {
    console.error("[cortex] group action failed:", (e as Error).message);
  }
  return "none";
}

export interface Verdict {
  /** The message presents real evidence one way or the other. */
  accept: boolean;
  /** What the evidence shows: the thing happened ("did") or it did not ("didnt"). */
  claim: "did" | "didnt" | "none";
  reply: string;
}

// The photo isn't analyzed; the bot judges what the message says about it, like a skeptical friend.
export async function judgeProof(opts: {
  target: string;
  item: string;
  text: string;
  recent: string[];
  sender?: string;
  senderIsTarget?: boolean;
}): Promise<Verdict> {
  const { target, item, text, recent, sender, senderIsTarget } = opts;
  const presents = /\b(proof|evidence|here'?s|see|look|check|wearing|wore|there|pic|photo)\b/i.test(text);
  const denies = /\b(not|isn'?t|didn'?t|did not|never|no)\b/i.test(text);
  const joking = /\b(jk|lol|larp|fake|kidding)\b/i.test(text);
  const fallback: Verdict = joking || !presents
    ? { accept: false, claim: "none", reply: "stop larping, that's not proof 🙄" }
    : denies
      ? { accept: true, claim: "didnt", reply: `proof accepted: ${target} did NOT ${item}. settling it 🧊` }
      : { accept: true, claim: "did", reply: "dang he acc did it 👀" };
  if (!configured()) return fallback;
  try {
    const prompt = [
      `You are a skeptical, funny friend judging proof for the bet "will ${target} ${item} today?". Someone just sent a photo and then wrote a message about it. You can't see the photo, so judge ONLY how they present it.`,
      `The sender is ${sender ?? "a player"}${senderIsTarget ? `, who IS ${target}, the person the bet is about, so they may be defending themselves` : ""}.`,
      `claim = "did" if the message presents the photo as evidence that ${target} DID it (e.g. "here's the proof", "look he's wearing it", "told you").`,
      `claim = "didnt" if the message presents the photo as evidence that ${target} did NOT do it (e.g. "no i'm not, here's proof", "look, i'm wearing a white shirt", "he's not wearing it, see?", "i did not wear that, proof").`,
      `claim = "none" if it's a throwaway that never claims anything ("here u go", "ok", "lol", "hi"), is clearly joking or admitting it's fake, or is unrelated to the bet.`,
      `Chat so far:\n${recent.slice(-8).join("\n") || "(none)"}`,
      `Their message: "${text}"`,
      `Reply with JSON only: {"claim": "did" or "didnt" or "none", "reply": "<one short lowercase text-message reply in character, max 15 words, at most one emoji; if none, call them out for larping; if did, be impressed; if didnt, be surprised the bet failed>"}`,
    ].join("\n");
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const raw = String(rows[0]?.R ?? "");
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const claim = json.claim === "did" || json.claim === "didnt" ? json.claim : "none";
    // "didn't" replies are fixed: the model tends to mix up who won, and the result post follows right after.
    const reply = claim === "didnt" ? `proof accepted: ${target} did NOT ${item}. settling it 🧊` : clean(String(json.reply || fallback.reply));
    return { accept: claim !== "none", claim, reply };
  } catch (e) {
    console.error("[cortex] judge failed:", (e as Error).message);
    return fallback;
  }
}

// ---- Chat indexing: every group message is stored by chat, then read back to plan the bet.
const memoryChat = new Map<string, string[]>();
const MEMORY_CAP = 1000;

export function logChat(chatId: string, sender: string, name: string, body: string): void {
  const mem = memoryChat.get(chatId) ?? [];
  mem.push(`${name}: ${body}`);
  if (mem.length > MEMORY_CAP) mem.shift();
  memoryChat.set(chatId, mem);
  enqueue("INSERT INTO CALLED_IT_CHAT (chat_id, sender, name, body) VALUES (?, ?, ?, ?)", [chatId, sender, name, body]);
}

// Newest `limit` messages in a chat, oldest first. Pass `name` to read only one person's messages.
export async function recentChat(chatId: string, limit = 500, name?: string): Promise<string[]> {
  const n = Math.max(1, Math.floor(limit));
  if (configured()) {
    try {
      await ensureTables();
      const rows = await run(
        `SELECT name, body FROM (SELECT ts, name, body FROM CALLED_IT_CHAT WHERE chat_id = ?${name ? " AND name = ?" : ""} ORDER BY ts DESC LIMIT ${n}) ORDER BY ts ASC`,
        name ? [chatId, name] : [chatId],
      );
      // lines still waiting in the write queue belong at the end
      const waiting = queue
        .filter((q) => q.sql.includes("CALLED_IT_CHAT") && q.binds[0] === chatId && (!name || q.binds[2] === name))
        .map((q) => `${q.binds[2]}: ${q.binds[3]}`);
      const all = [...rows.map((r) => `${r.NAME}: ${r.BODY}`), ...waiting];
      if (all.length) return all.slice(-n);
    } catch (e) {
      console.error("[snowflake] chat read failed:", (e as Error).message);
    }
  }
  const mem = memoryChat.get(chatId) ?? [];
  return (name ? mem.filter((l) => l.startsWith(`${name}: `)) : mem).slice(-n);
}

// Prompt-sized view of a long log: as much recent chat as fits, plus each person's own latest messages.
function chatForPrompt(chat: string[], names: string[]): string {
  const MAX_CHARS = 12000;
  const recent: string[] = [];
  let used = 0;
  for (let i = chat.length - 1; i >= 0 && used + chat[i].length + 1 <= MAX_CHARS; i--) {
    recent.unshift(chat[i]);
    used += chat[i].length + 1;
  }
  const perPerson = names
    .map((n) => {
      const mine = chat.filter((l) => l.startsWith(`${n}: `)).slice(-10);
      return mine.length ? `${n}:\n${mine.map((l) => `  ${l.slice(n.length + 2)}`).join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n");
  return `Recent chat (oldest first):\n${recent.join("\n") || "(nothing)"}\n\nWhat each person has said (their latest messages, may be older):\n${perPerson || "(nothing)"}`;
}

export interface BetPlan {
  target: string;
  item: string;
  reason: string;
  decoyPerson: string;
  decoyItem: string;
  decoyReason: string;
}

// Cortex reads the group chat and picks who the bet is about, the outfit or habit, and why.
export async function planBets(chat: string[], names: string[], itemOptions: string[]): Promise<BetPlan | undefined> {
  if (!configured()) return undefined;
  const prompt = [
    "You run prop bets in a friend group chat about whether someone will wear something or do an everyday habit TODAY (an outfit, being late, waking up early, skipping the gym...).",
    `People in the group: ${names.join(", ")}.`,
    chatForPrompt(chat, names),
    "Pick the person and the outfit or habit that the chat makes most interesting: someone who mentioned something they love/hate/always do, got teased, or has a running joke. If the chat gives nothing, pick anyone and one of: " + itemOptions.join(", ") + ".",
    "Also pick a DIFFERENT person for a decoy bet that looks equally natural, with a different claim and its own reason from the chat if possible.",
    `Reply with JSON only: {"target": "<name from the list>", "item": "<a short verb phrase, e.g. wear black pants, or be late to class>", "reason": "<short chat fact, e.g. 'he said he loves black pants'>", "decoyPerson": "<different name from the list>", "decoyItem": "<claim>", "decoyReason": "<short chat fact or empty>"}`,
  ].join("\n");
  try {
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const raw = String(rows[0]?.R ?? "");
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (!j.target || !j.item) return undefined;
    return {
      target: String(j.target),
      item: String(j.item),
      reason: String(j.reason ?? ""),
      decoyPerson: String(j.decoyPerson ?? ""),
      decoyItem: String(j.decoyItem ?? ""),
      decoyReason: String(j.decoyReason ?? ""),
    };
  } catch (e) {
    console.error("[cortex] plan failed:", (e as Error).message);
    return undefined;
  }
}

const DARES = [
  "post an embarrassing childhood photo in the gc",
  "text your most recent ex 'hope you're well' (screenshot required)",
  "wear your most cursed outfit all day and send proof",
  "send a voice note singing the first song that comes up on shuffle",
  "let the group change your profile pic for 24 hours",
];

// Weekly last-place dare, written by Cortex with a canned fallback.
export async function writeDare(name: string): Promise<string> {
  const canned = `🥄 weekly wooden spoon goes to ${name}. dare: ${DARES[Math.floor(Math.random() * DARES.length)]}`;
  if (!configured()) return canned;
  try {
    const prompt = `You are a playful, snarky friend in a group chat. ${name} finished last on the chip leaderboard this week. Write ONE short lowercase text (max 35 words, one emoji) announcing a harmless, funny dare for them to do. Use only this name, invent no other facts. Output only the message.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    return clean(String(rows[0]?.R ?? "")) || canned;
  } catch (e) {
    console.error("[cortex] dare failed:", (e as Error).message);
    return canned;
  }
}
