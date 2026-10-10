// Snowflake: stores chat + outcomes, computes historical rates, Cortex writes the bet.
// Falls back to seeded fake history + a template when Snowflake isn't configured.
import snowflake from "snowflake-sdk";

snowflake.configure({ logLevel: "ERROR" });

const SEED: Record<string, [number, number]> = {}; // alias -> [hits, total]

function configured(): boolean {
  return Boolean(process.env.SNOWFLAKE_ACCOUNT && process.env.SNOWFLAKE_USERNAME && process.env.SNOWFLAKE_PASSWORD);
}

let conn: snowflake.Connection | undefined;
async function connection(): Promise<snowflake.Connection> {
  if (conn) return conn;
  const c = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USERNAME!,
    password: process.env.SNOWFLAKE_PASSWORD!,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    role: process.env.SNOWFLAKE_ROLE || undefined,
  });
  await new Promise<void>((res, rej) => c.connect((e) => (e ? rej(e) : res())));
  conn = c;
  return c;
}

async function run(sqlText: string, binds: snowflake.Binds = []): Promise<any[]> {
  const c = await connection();
  return new Promise((res, rej) =>
    c.execute({ sqlText, binds, complete: (e, _s, rows) => (e ? rej(e) : res(rows ?? [])) }),
  );
}

let tableReady = false;
async function ensureTables(): Promise<void> {
  if (tableReady) return;
  await run("CREATE TABLE IF NOT EXISTS CALLED_IT_MESSAGES (ts TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP, sender STRING, body STRING)");
  await run("CREATE TABLE IF NOT EXISTS CALLED_IT_OUTCOMES (ts TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP, target STRING, bet STRING, hit BOOLEAN)");
  tableReady = true;
}

export function logMessage(sender: string, body: string): void {
  if (!configured()) return;
  ensureTables().then(() => run("INSERT INTO CALLED_IT_MESSAGES (sender, body) VALUES (?, ?)", [sender, body])).catch((e) => console.error("[snowflake] log failed:", e.message));
}

export function logOutcome(target: string, bet: string, hit: boolean): void {
  if (!SEED[target]) SEED[target] = [0, 0];
  SEED[target][1]++;
  if (hit) SEED[target][0]++;
  if (!configured()) return;
  ensureTables().then(() => run("INSERT INTO CALLED_IT_OUTCOMES (target, bet, hit) VALUES (?, ?, ?)", [target, bet, hit])).catch((e) => console.error("[snowflake] outcome failed:", e.message));
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
  if (!SEED[target]) SEED[target] = [3, 4]; // fake history so the demo always has odds
  return SEED[target];
}

export async function writeBet(target: string, item: string): Promise<string> {
  const [hits, total] = await historyFor(target);
  const fallback = `🎯 new bet: will ${target} wear ${item} today? history says ${hits}/${total}. reply "yes" or "no" (5 chips).`;
  if (!configured()) return fallback;
  try {
    const prompt = `You are a playful, snarky friend in a group chat. Write ONE short iMessage-style prop bet (max 30 words, lowercase, one emoji) asking whether ${target} will wear ${item} today. Mention their history: it happened ${hits} of the last ${total} times. End with: reply "yes" or "no" (5 chips). Output only the message.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const text = String(rows[0]?.R ?? "").trim();
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
    const prompt = `You are a playful, slightly snarky friend in a group chat. Someone just sent a proof photo for the bet "will ${target} wear ${item} today". React in ONE short lowercase sentence with one emoji, like you studied the photo. Output only the message.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    return String(rows[0]?.R ?? "").trim() || canned;
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
    "You are 'Called It', a witty, slightly snarky friend who lives in a group chat and runs prop bets about what people wear (e.g. 'will Sam wear a red jacket today?'). Players stake chips, winners split the pot, and a proof photo settles it.",
    "Reply like a real person texting: 1-2 short lowercase sentences, max 30 words, at most one emoji. Respond to what the person ACTUALLY said. Be helpful if they seem confused (reply yes or no to the bet in DM, send a photo as proof, /bet starts a game in the group, /chips shows chips).",
    "Only state game rules that are listed here. Everyone starts with 20 chips, stakes are 5 chips, there are no refreshes, bonuses or extra features. If unsure, say you're not sure instead of making a rule up.",
    "SECRET RULES: never reveal who a bet is about or who the target is, and never reveal that some people got a decoy bet. If asked, deflect playfully.",
    `Game: ${input.phase === "open" ? "a bet is live" : "no bet running"}.${input.myBet ? ` This person's bet: "${input.myBet}"` : ""}`,
    `Chat so far:\n${input.recent.slice(-12).join("\n") || "(nothing yet)"}`,
    `${input.name} says (${input.where}): "${input.text}"`,
    "Output only your reply.",
  ].join("\n");
  try {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 9000));
    const rows = await Promise.race([run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]), timeout]);
    return String(rows[0]?.R ?? "").trim().replace(/^"|"$/g, "") || undefined;
  } catch (e) {
    console.error("[cortex] converse failed:", (e as Error).message);
    return undefined;
  }
}

// Connect to Snowflake at startup so the first reply isn't slow.
export function warmUp(): void {
  if (configured()) connection().then(ensureTables).catch((e) => console.error("[snowflake] warmup failed:", e.message));
}

export type Intent = "yes" | "no" | "proof" | "question" | "other";

// Reads what the person means instead of matching exact words.
export async function classifyIntent(text: string, bet?: string): Promise<Intent> {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|yup|y|bet|in|im in|i'm in|for sure|definitely)[.!]*$/.test(t)) return "yes";
  if (/^(no|nope|nah|n|out|never|no way)[.!]*$/.test(t)) return "no";
  if (!configured()) return /\b(yes|yeah|yep|think so)\b/.test(t) ? "yes" : /\b(no|nope|nah)\b/.test(t) ? "no" : "other";
  try {
    const prompt = `A friend is answering a prop bet in a chat. Bet: "${bet ?? "will someone wear a certain clothing item today"}". Their message: "${text}". Classify the message as exactly one word: yes (they think the bet will happen / they're betting yes), no (they think it won't happen / betting no), proof (they claim it happened or are showing evidence), question (they're asking something), other. Output only that one word.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const out = String(rows[0]?.R ?? "").toLowerCase();
    for (const i of ["yes", "no", "proof", "question"] as const) if (out.includes(i)) return i;
  } catch (e) {
    console.error("[cortex] intent failed:", (e as Error).message);
  }
  return "other";
}

export interface Verdict {
  accept: boolean;
  reply: string;
}

// The photo isn't analyzed; the bot judges the message sent right after it, like a skeptical friend.
export async function judgeProof(opts: { target: string; item: string; text: string; recent: string[] }): Promise<Verdict> {
  const { target, item, text, recent } = opts;
  const fallbackAccept = /\b(proof|here'?s|see|look|did|wearing|wore|there)\b/i.test(text) && !/\b(jk|lol|larp|fake|not)\b/i.test(text);
  const fallback: Verdict = fallbackAccept
    ? { accept: true, reply: "dang he acc did it 👀" }
    : { accept: false, reply: "stop larping, that's not proof 🙄" };
  if (!configured()) return fallback;
  try {
    const prompt = [
      `You are a skeptical, funny friend judging proof for the bet "will ${target} wear ${item} today?". Someone just sent a photo and then wrote a message about it. You can't see the photo, so judge ONLY how they present it.`,
      `ACCEPT if the message presents the photo as evidence that it happened: it says "proof", "evidence", "here's the proof", "look", "see", "he did it", "told you", or describes ${target} in ${item}. Being brief is fine. REJECT only if it's a throwaway that never claims anything ("here u go", "ok", "lol", "idk", "hi"), is clearly joking or admitting it's fake, or is unrelated to the bet.`,
      `Chat so far:\n${recent.slice(-8).join("\n") || "(none)"}`,
      `Their message: "${text}"`,
      `Reply with JSON only: {"accept": true or false, "reply": "<one short lowercase text-message reply in character, max 15 words, at most one emoji; if rejecting, call them out for larping; if accepting, be impressed, like 'dang he acc did it'>"}`,
    ].join("\n");
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large3', ?) AS R", [prompt]);
    const raw = String(rows[0]?.R ?? "");
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return { accept: json.accept === true, reply: String(json.reply || fallback.reply) };
  } catch (e) {
    console.error("[cortex] judge failed:", (e as Error).message);
    return fallback;
  }
}
