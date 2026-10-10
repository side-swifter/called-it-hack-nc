// Snowflake: stores chat + outcomes, computes historical rates, Cortex writes the bet.
// Falls back to seeded fake history + a template when Snowflake isn't configured.
import snowflake from "snowflake-sdk";

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

export async function writeBet(target: string, entryFee: number): Promise<string> {
  const [hits, total] = await historyFor(target);
  const fallback = `🎯 the bet: will ${target} show up in a red jacket today? history says ${hits}/${total}. reply "in" to throw ${entryFee} chips in. winner takes the pot.`;
  if (!configured()) return fallback;
  try {
    const prompt = `You are a playful, snarky friend in a group chat. Write ONE short iMessage-style prop bet (max 35 words, lowercase, one emoji) asking whether ${target} will wear a red jacket today. Mention their history: it happened ${hits} of the last ${total} times. End with: reply "in" to throw ${entryFee} chips in. Output only the message.`;
    const rows = await run("SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large2', ?) AS R", [prompt]);
    const text = String(rows[0]?.R ?? "").trim();
    return text || fallback;
  } catch (e) {
    console.error("[cortex] failed:", (e as Error).message);
    return fallback;
  }
}
