// Play-chip ledger. Uses Capital One Nessie (sandbox) when NESSIE_API_KEY is set;
// local balances are always updated first so the demo never waits on the API.
const BASE = "https://api.nessieisreal.com";
const balances = new Map<string, number>();
const accountIds = new Map<string, string>(); // handle -> nessie account id
const START_CHIPS = 20;

function key(): string | undefined {
  return process.env.NESSIE_API_KEY || undefined;
}

async function nessie(method: string, path: string, body?: unknown): Promise<any> {
  const url = new URL(BASE + path);
  url.searchParams.set("key", key()!);
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Nessie ${method} ${path.split("/")[1]} failed (HTTP ${res.status})`);
  return res.json();
}

async function ensureAccount(handle: string): Promise<string | undefined> {
  if (!key()) return undefined;
  if (accountIds.has(handle)) return accountIds.get(handle);
  const cust = await nessie("POST", "/customers", {
    first_name: "Chip",
    last_name: handle.replace(/\D/g, "").slice(-6) || "House",
    address: { street_number: "1", street_name: "Main St", city: "Durham", state: "NC", zip: "27701" },
  });
  const customerId = cust.objectCreated?._id;
  const acct = await nessie("POST", `/customers/${customerId}/accounts`, {
    type: "Checking",
    nickname: `chips-${handle.slice(-4)}`,
    rewards: 0,
    balance: START_CHIPS,
  });
  const id = acct.objectCreated?._id as string;
  accountIds.set(handle, id);
  return id;
}

export function balanceOf(handle: string): number {
  if (!balances.has(handle)) balances.set(handle, START_CHIPS);
  return balances.get(handle)!;
}

async function mirror(from: string, to: string, amount: number): Promise<void> {
  try {
    const [a, b] = await Promise.all([ensureAccount(from), ensureAccount(to)]);
    if (a && b) await nessie("POST", `/accounts/${a}/transfers`, { medium: "balance", payee_id: b, amount });
  } catch (err) {
    console.error("[nessie] transfer skipped:", (err as Error).message);
  }
}

export const HOUSE = "house";

export async function transfer(from: string, to: string, amount: number): Promise<void> {
  balances.set(from, (from === HOUSE ? (balances.get(HOUSE) ?? 1000) : balanceOf(from)) - amount);
  balances.set(to, (to === HOUSE ? (balances.get(HOUSE) ?? 1000) : balanceOf(to)) + amount);
  void mirror(from, to, amount);
}
