import assert from "node:assert/strict";
import test from "node:test";
import { computeSettlement, type Outcome } from "../src/vibebet/settle.js";

const picks = (entries: [string, Outcome][]) => new Map<string, Outcome>(entries);
const STAKE = 5;

test("outcome yes with mixed picks: yes-pickers split the pot", () => {
  const s = computeSettlement(picks([["a", "yes"], ["b", "yes"], ["c", "no"]]), "yes", STAKE);
  assert.deepEqual(s.winnerIds, ["a", "b"]);
  assert.deepEqual(s.loserIds, ["c"]);
  assert.equal(s.pot, 15);
  assert.equal(s.payout, 7); // floor(15 / 2)
  assert.equal(s.refundAll, false);
});

test("outcome no with mixed picks: no-pickers split the pot", () => {
  const s = computeSettlement(picks([["a", "yes"], ["b", "no"], ["c", "no"], ["d", "no"]]), "no", STAKE);
  assert.deepEqual(s.winnerIds, ["b", "c", "d"]);
  assert.deepEqual(s.loserIds, ["a"]);
  assert.equal(s.pot, 20);
  assert.equal(s.payout, 6); // floor(20 / 3)
});

test("everyone on the losing side: nobody wins, everyone is refunded", () => {
  const s = computeSettlement(picks([["a", "yes"], ["b", "yes"]]), "no", STAKE);
  assert.deepEqual(s.winnerIds, []);
  assert.deepEqual(s.loserIds, ["a", "b"]);
  assert.equal(s.refundAll, true);
  assert.equal(s.payout, 0);
  assert.equal(s.pot, 10);
});

test("single player: winning returns the stake, losing refunds it", () => {
  const won = computeSettlement(picks([["a", "no"]]), "no", STAKE);
  assert.deepEqual(won.winnerIds, ["a"]);
  assert.equal(won.payout, STAKE);
  const lost = computeSettlement(picks([["a", "no"]]), "yes", STAKE);
  assert.equal(lost.refundAll, true);
});

test("no picks at all settles to an empty pot", () => {
  const s = computeSettlement(picks([]), "yes", STAKE);
  assert.equal(s.pot, 0);
  assert.equal(s.payout, 0);
  assert.equal(s.refundAll, true);
});

test("target defends: the YES bettors' stakes go to the target and the NO bettors", () => {
  const s = computeSettlement(picks([["a", "yes"], ["b", "yes"], ["c", "no"], ["d", "no"]]), "no", 30, { refutedByTarget: true });
  assert.deepEqual(s.winnerIds, ["c", "d"]);
  assert.equal(s.pot, 120);
  assert.equal(s.defended, true);
  assert.equal(s.targetBonus, 30); // 25% of 120
  assert.equal(s.payout, 45); // (120 - 30) / 2
});

test("target defends and nobody bet NO: the target takes the whole pot", () => {
  const s = computeSettlement(picks([["a", "yes"], ["b", "yes"]]), "no", 30, { refutedByTarget: true });
  assert.equal(s.targetBonus, 60);
  assert.equal(s.payout, 0);
  assert.equal(s.refundAll, false);
});

test("no target bonus when the outcome came from anyone but the target", () => {
  const s = computeSettlement(picks([["a", "yes"], ["b", "no"]]), "no", 30);
  assert.equal(s.targetBonus, 0);
  assert.equal(s.defended, false);
  assert.equal(s.payout, 60);
});

test("target defends but everyone bet NO: nobody lost, so no target bonus", () => {
  const s = computeSettlement(picks([["a", "no"], ["b", "no"]]), "no", 30, { refutedByTarget: true });
  assert.equal(s.defended, false);
  assert.equal(s.targetBonus, 0);
  assert.equal(s.payout, 30);
});

test("a YES result never pays the target a defense bonus", () => {
  const s = computeSettlement(picks([["a", "yes"], ["b", "no"]]), "yes", 30, { refutedByTarget: true });
  assert.equal(s.targetBonus, 0);
  assert.equal(s.payout, 60);
});
