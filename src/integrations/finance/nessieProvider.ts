import type {
  FinanceAccount,
  FinanceProvider,
  FinancePurchase,
  FinanceSummary,
  FinanceSummaryOptions,
} from "./index.js";

export type NessieFinanceProviderOptions = {
  apiKey: string;
  customerId: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

type JsonRecord = Record<string, unknown>;

type NessieAccount = {
  id: string;
  name: string;
  type: string;
  balance: number;
};

const DEFAULT_BASE_URL = "https://api.nessieisreal.com";
const DEFAULT_CURRENCY = "USD";

/**
 * Read-only adapter for Nessie's customer account and account purchase GET
 * endpoints. This module intentionally contains no mutation operations.
 */
export function createNessieFinanceProvider(
  options: NessieFinanceProviderOptions,
): FinanceProvider {
  const apiKey = options.apiKey;
  const customerId = options.customerId;
  if (!apiKey.trim() || !customerId.trim()) {
    throw new Error("Nessie requires NESSIE_API_KEY and NESSIE_CUSTOMER_ID.");
  }
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const request = options.fetch ?? globalThis.fetch;

  if (!request) {
    throw new Error("This runtime does not provide fetch for the Nessie provider.");
  }

  async function getJson(path: string): Promise<unknown> {
    const url = new URL(`${baseUrl}${path}`);
    // Nessie documents its API key as the `key` query parameter. Never include
    // the URL, request error, or response body in errors (all may leak the key).
    url.searchParams.set("key", apiKey);
    let response: Response;
    try {
      response = await request(url.toString(), { method: "GET" });
    } catch {
      throw new Error("Nessie request failed before a response was received.");
    }

    if (!response.ok) {
      throw new Error(`Nessie request failed (HTTP ${response.status}).`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error("Nessie returned an invalid JSON response.");
    }
  }

  return {
    async getSummary(summaryOptions: FinanceSummaryOptions = {}): Promise<FinanceSummary> {
      const asOf = summaryOptions.asOf ?? new Date();
      const windowDays = summaryOptions.windowDays ?? 30;
      const purchaseLimit = summaryOptions.purchaseLimit ?? 5;
      const since = asOf.getTime() - windowDays * 24 * 60 * 60 * 1000;
      const accountsPayload = await getJson(
        `/customers/${encodeURIComponent(customerId)}/accounts`,
      );
      if (!Array.isArray(accountsPayload)) {
        throw new Error("Nessie returned an unexpected accounts response.");
      }

      const accounts = accountsPayload
        .map((raw, index) => toAccount(raw, index))
        .filter((account): account is NessieAccount => account !== null);
      const purchasesByAccount = await Promise.all(
        accounts.map(async (account) => ({
          account,
          purchases: await getJson(
            `/accounts/${encodeURIComponent(account.id)}/purchases`,
          ),
        })),
      );

      const purchases = purchasesByAccount.flatMap(({ account, purchases: payload }) => {
        if (!Array.isArray(payload)) {
          throw new Error("Nessie returned an unexpected purchases response.");
        }
        return payload
          .map((raw, index) => toPurchase(raw, account, index))
          .filter((purchase): purchase is FinancePurchase => purchase !== null);
      });
      const inWindow = purchases.filter((purchase) => {
        const date = Date.parse(purchase.date);
        return date >= since && date <= asOf.getTime();
      });
      const summaryAccounts: FinanceAccount[] = accounts.map((account) => ({
        ...account,
        currency: DEFAULT_CURRENCY,
      }));

      return {
        customerName: "Sandbox customer",
        generatedAt: asOf.toISOString(),
        currency: DEFAULT_CURRENCY,
        totalBalance: roundCurrency(
          summaryAccounts.reduce((sum, account) => sum + account.balance, 0),
        ),
        accounts: summaryAccounts,
        spendingWindowDays: windowDays,
        recentSpending: roundCurrency(
          inWindow.reduce((sum, purchase) => sum + purchase.amount, 0),
        ),
        recentPurchases: inWindow
          .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
          .slice(0, purchaseLimit),
      };
    },
  };
}

function toAccount(raw: unknown, index: number): NessieAccount | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw._id) ?? asString(raw.id);
  const balance = asFiniteNumber(raw.balance);
  if (!id || balance === null) return null;

  return {
    id,
    name: asString(raw.nickname) ?? asString(raw.name) ?? `Account ${index + 1}`,
    type: asString(raw.type) ?? "Account",
    balance,
  };
}

function toPurchase(
  raw: unknown,
  account: NessieAccount,
  index: number,
): FinancePurchase | null {
  if (!isRecord(raw)) return null;
  const dateValue = asString(raw.purchase_date) ?? asString(raw.date);
  const amount = asFiniteNumber(raw.amount);
  if (!dateValue || amount === null || amount < 0) return null;
  const parsedDate = Date.parse(dateValue);
  if (!Number.isFinite(parsedDate)) return null;
  const status = (asString(raw.status) ?? "").toLowerCase();
  if (status === "declined" || status === "cancelled" || status === "canceled") return null;

  const id = asString(raw._id) ?? asString(raw.id) ?? `${account.id}-purchase-${index + 1}`;
  const description =
    asString(raw.description) ?? asString(raw.merchant) ?? "Card purchase";

  return {
    id,
    date: new Date(parsedDate).toISOString(),
    description,
    amount,
    currency: DEFAULT_CURRENCY,
    accountName: account.name,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
