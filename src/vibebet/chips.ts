import { readFileSync, writeFileSync } from "node:fs";
// Play-chip ledger. Uses Capital One Nessie (sandbox) when NESSIE_API_KEY is set;
// local balances are always updated first so the demo never waits on the API.
const BASE = "https://api.nessieisreal.com";
const BAL_FILE = ".chips.json";
const balances = new Map<string, number>(
  (() => {
    try {
      return Object.entries(JSON.parse(readFileSync(BAL_FILE, "utf8")) as Record<string, number>);
    } catch {
      return [];
    }
  })(),
);
function save(): void {
  try {
    writeFileSync(BAL_FILE, JSON.stringify(Object.fromEntries(balances)));
  } catch {}
}
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
  if (!balances.has(handle)) balances.set(handle, handle === POT ? 0 : START_CHIPS);
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
      status: "completed",
      amount: Math.round(amount),
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

// Stakes go into the pot; winners are paid out of it. Balances persist across restarts.
export const POT = "pot";

export async function transfer(from: string, to: string, amount: number): Promise<void> {
  balances.set(from, (balances.get(from) ?? (from === POT ? 0 : START_CHIPS)) - amount);
  balances.set(to, (balances.get(to) ?? (to === POT ? 0 : START_CHIPS)) + amount);
  save();
  void mirror(from, to, amount);
}

export function setBalance(handle: string, amount: number): void {
  balances.set(handle, amount);
  save();
}

export function leaderboard(handles: string[]): [string, number][] {
  return handles.map((h) => [h, balanceOf(h)] as [string, number]).sort((a, b) => b[1] - a[1]);
}

export function allBalances(): [string, number][] {
  return [...balances].filter(([h]) => h !== POT).sort((a, b) => b[1] - a[1]);
}
