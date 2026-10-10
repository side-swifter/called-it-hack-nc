import type {
  FinanceProvider,
  FinancePurchase,
  FinanceSummary,
  FinanceSummaryOptions,
} from "./index.js";

const SEEDED_ACCOUNTS = [
  {
    id: "demo-checking",
    name: "Everyday Checking",
    type: "Checking",
    balance: 2486.37,
  },
  {
    id: "demo-savings",
    name: "Rainy Day Savings",
    type: "Savings",
    balance: 8100,
  },
] as const;

const SEEDED_PURCHASES = [
  {
    daysAgo: 1,
    description: "Groceries · Green Market",
    amount: 64.28,
    accountId: "demo-checking",
  },
  {
    daysAgo: 2,
    description: "Coffee · Northstar Cafe",
    amount: 8.75,
    accountId: "demo-checking",
  },
  { daysAgo: 4, description: "Transit pass", amount: 25, accountId: "demo-checking" },
  {
    daysAgo: 8,
    description: "Dinner · Nori House",
    amount: 48.6,
    accountId: "demo-checking",
  },
  {
    daysAgo: 12,
    description: "Streaming subscription",
    amount: 14.99,
    accountId: "demo-checking",
  },
  { daysAgo: 18, description: "Pharmacy", amount: 22.41, accountId: "demo-checking" },
  { daysAgo: 25, description: "Bookshop", amount: 31.2, accountId: "demo-checking" },
  {
    daysAgo: 40,
    description: "Hardware store",
    amount: 56.13,
    accountId: "demo-checking",
  },
] as const;

function dateDaysAgo(asOf: Date, daysAgo: number): string {
  return new Date(asOf.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

export function createMockFinanceProvider(): FinanceProvider {
  return {
    async getSummary(options: FinanceSummaryOptions = {}): Promise<FinanceSummary> {
      const asOf = options.asOf ?? new Date();
      const windowDays = options.windowDays ?? 30;
      const purchaseLimit = options.purchaseLimit ?? 5;
      const windowStart = asOf.getTime() - windowDays * 24 * 60 * 60 * 1000;
      const accounts = SEEDED_ACCOUNTS.map((account) => ({
        ...account,
        currency: "USD",
      }));
      const accountNames = new Map(
        accounts.map((account) => [account.id, account.name] as const),
      );
      const purchases: FinancePurchase[] = SEEDED_PURCHASES.map((purchase, index) => ({
        id: `demo-purchase-${index + 1}`,
        date: dateDaysAgo(asOf, purchase.daysAgo),
        description: purchase.description,
        amount: purchase.amount,
        currency: "USD",
        accountName: accountNames.get(purchase.accountId) ?? "Account",
      }));
      const inWindow = purchases.filter((purchase) => {
        const date = Date.parse(purchase.date);
        return date >= windowStart && date <= asOf.getTime();
      });

      return {
        customerName: "Alex Morgan (demo)",
        generatedAt: asOf.toISOString(),
        currency: "USD",
        totalBalance: roundCurrency(
          accounts.reduce((sum, account) => sum + account.balance, 0),
        ),
        accounts,
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

function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
