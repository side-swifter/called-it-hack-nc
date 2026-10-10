import assert from "node:assert/strict";
import test from "node:test";
import {
  createMockFinanceProvider,
  createNessieFinanceProvider,
} from "../src/integrations/finance/index.js";
import { identifyFinanceIntent } from "../src/messaging/index.js";

test("classifies balance and spending questions", () => {
  assert.equal(identifyFinanceIntent("What's my balance?"), "balance");
  assert.equal(identifyFinanceIntent("How much have I spent this month?"), "recent-spending");
  assert.equal(identifyFinanceIntent("Tell me a joke"), undefined);
});

test("mock provider returns seeded demo finance data", async () => {
  const summary = await createMockFinanceProvider().getSummary({
    asOf: new Date("2026-10-10T12:00:00.000Z"),
  });

  assert.equal(summary.customerName, "Alex Morgan (demo)");
  assert.equal(summary.totalBalance, 10586.37);
  assert.equal(summary.recentSpending, 215.23);
  assert.equal(summary.recentPurchases.length, 5);
});

test("Nessie provider reads sandbox accounts and purchases only", async () => {
  const calls: Array<{ url: URL; method: string | undefined }> = [];
  const payloads = [
    [{ _id: "demo-account", nickname: "Checking", type: "Checking", balance: 50 }],
    [{ _id: "demo-purchase", purchase_date: "2026-10-09T12:00:00.000Z", amount: 12.5, description: "Demo Cafe" }],
  ];
  const provider = createNessieFinanceProvider({
    apiKey: "test-key",
    customerId: "demo-customer",
    fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), method: init?.method });
      return new Response(JSON.stringify(payloads[calls.length - 1]), { status: 200 });
    },
  });
  const summary = await provider.getSummary({
    asOf: new Date("2026-10-10T12:00:00.000Z"),
  });

  assert.equal(summary.totalBalance, 50);
  assert.equal(summary.recentSpending, 12.5);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET"]);
  assert.deepEqual(calls.map((call) => call.url.searchParams.get("key")), ["test-key", "test-key"]);
});
