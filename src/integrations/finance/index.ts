export type FinanceAccount = {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
};

export type FinancePurchase = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  accountName: string;
};

export type FinanceSummary = {
  /** An explicitly seeded customer in the mock provider; not an authenticated user. */
  customerName: string;
  generatedAt: string;
  currency: string;
  /** Sum of the returned account balances, in the provider's reported currency. */
  totalBalance: number;
  accounts: FinanceAccount[];
  /** Purchases within the requested window; transaction list is capped separately. */
  spendingWindowDays: number;
  recentSpending: number;
  recentPurchases: FinancePurchase[];
};

export type FinanceSummaryOptions = {
  /** Clock override for deterministic callers/tests. Defaults to now. */
  asOf?: Date;
  /** Lookback for the spending total. Defaults to 30 days. */
  windowDays?: number;
  /** Maximum purchases returned, newest first. Defaults to 5. */
  purchaseLimit?: number;
};

export interface FinanceProvider {
  getSummary(options?: FinanceSummaryOptions): Promise<FinanceSummary>;
}

export type FinanceProviderOptions = {
  /** Defaults to FINANCE_PROVIDER, then "mock". */
  provider?: "mock" | "nessie";
  /** Nessie API key. Defaults to NESSIE_API_KEY when using Nessie. */
  apiKey?: string;
  /** Seeded Nessie customer ID. Defaults to NESSIE_CUSTOMER_ID when using Nessie. */
  customerId?: string;
  /** Optional Nessie API origin override; defaults to https://api.nessieisreal.com. */
  baseUrl?: string;
  /** Injectable transport; defaults to the platform's native fetch. */
  fetch?: typeof fetch;
};

export class FinanceProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceProviderError";
  }
}

export { createMockFinanceProvider } from "./mockProvider.js";
export { createNessieFinanceProvider } from "./nessieProvider.js";
export type { NessieFinanceProviderOptions } from "./nessieProvider.js";

import { createMockFinanceProvider } from "./mockProvider.js";
import { createNessieFinanceProvider } from "./nessieProvider.js";

function environment(): Record<string, string | undefined> {
  // Avoid requiring Node typings so this integration can be imported by different
  // message-handler runtimes. In browser runtimes, no process env is exposed.
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env ?? {};
}

/**
 * Creates the finance data source for the message handler. Mock is always the
 * safe default; Nessie is only selected explicitly with FINANCE_PROVIDER=nessie.
 */
export function createFinanceProvider(
  options: FinanceProviderOptions = {},
): FinanceProvider {
  const env = environment();
  const selected = options.provider ?? env.FINANCE_PROVIDER ?? "mock";

  if (selected === "mock") {
    return createMockFinanceProvider();
  }
  if (selected !== "nessie") {
    throw new FinanceProviderError(
      'Unsupported finance provider. Use "mock" or "nessie".',
    );
  }

  const apiKey = options.apiKey ?? env.NESSIE_API_KEY;
  const customerId = options.customerId ?? env.NESSIE_CUSTOMER_ID;
  if (!apiKey?.trim() || !customerId?.trim()) {
    throw new FinanceProviderError(
      "Nessie requires NESSIE_API_KEY and NESSIE_CUSTOMER_ID.",
    );
  }

  return createNessieFinanceProvider({
    apiKey,
    customerId,
    baseUrl: options.baseUrl ?? env.NESSIE_BASE_URL,
    fetch: options.fetch,
  });
}
