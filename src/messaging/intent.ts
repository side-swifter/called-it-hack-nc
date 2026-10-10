export type FinanceIntent = "balance" | "recent-spending";

/** Classify supported finance questions; the finance provider receives only the intent. */
export function identifyFinanceIntent(text: string): FinanceIntent | undefined {
  const normalized = text.toLowerCase();

  // Prefer spending when a message mentions both topics (for example,
  // "what was my balance after this month's spending?").
  if (/\b(spend(?:ing)?|spent|transactions?|purchases?|charges?)\b/.test(normalized)) {
    return "recent-spending";
  }

  if (/\b(balance|available funds|how much (?:money|cash))\b/.test(normalized)) {
    return "balance";
  }

  return undefined;
}
