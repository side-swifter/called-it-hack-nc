// Play-chip ledger. Uses Capital One Nessie (sandbox) when NESSIE_API_KEY is set;
// local balances are always updated first so the demo never waits on the API.
const BASE = "https://api.nessieisreal.com";
const balances = new Map<string, number>();
const accountIds = new Map<string, Promise<string>>(); // handle -> nessie account id
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
  if (!res.ok) throw new Error(`Nessie ${method} ${path.split("/").pop()} failed (HTTP ${res.status}) ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

async function createAccount(handle: string): Promise<string> {
  const cust = await nessie("POST", "/customers", {
    first_name: "Chip",
    last_name: handle.replace(/\D/g, "").slice(-6) || "House",
    address: { street_number: "1", street_name: "Main St", city: "Durham", state: "NC", zip: "27701" },
  });
  const acct = await nessie("POST", `/customers/${cust.objectCreated?._id}/accounts`, {
    type: "Checking",
    nickname: `called-it-${handle.slice(-4)}`,
    rewards: 0,
    balance: START_CHIPS,
  });
  return acct.objectCreated?._id as string;
}

function ensureAccount(handle: string): Promise<string | undefined> {
  if (!key()) return Promise.resolve(undefined);
  if (!accountIds.has(handle)) {
    const p = createAccount(handle);
    p.catch(() => accountIds.delete(handle)); // allow retry after a failure
    accountIds.set(handle, p);
  }
  return accountIds.get(handle)!;
}

export function balanceOf(handle: string): number {
  if (!balances.has(handle)) balances.set(handle, START_CHIPS);
  return balances.get(handle)!;
}

// This Nessie has no payee transfers, so a transfer = withdrawal + deposit.
async function mirror(from: string, to: string, amount: number): Promise<void> {
  try {
    const [a, b] = await Promise.all([ensureAccount(from), ensureAccount(to)]);
    if (!a || !b) return;
    const body = {
      medium: "balance",
      transaction_date: new Date().toISOString().slice(0, 10),
      status: "pending",
      amount,
      description: "called it stake",
    };
    await Promise.all([
      nessie("POST", `/accounts/${a}/withdrawals`, body),
      nessie("POST", `/accounts/${b}/deposits`, body),
    ]);
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
