export type Outcome = "yes" | "no";

export interface Settlement {
  winnerIds: string[];
  loserIds: string[];
  pot: number;
  /** Chips paid to each winner (0 when nobody won). */
  payout: number;
  /** Chips paid to the person the bet is about for beating the majority. */
  targetBonus: number;
  /** True when nobody was on the winning side: every player gets their stake back. */
  refundAll: boolean;
}

/**
 * Pure payout math. pot = picks x stake, split evenly among the players whose
 * pick equals the outcome (floored). With `targetCut` > 0, the person the bet is
 * about also earns that share of the pot when the outcome went against most bets.
 */
export function computeSettlement(
  picks: ReadonlyMap<string, Outcome>,
  outcome: Outcome,
  stake: number,
  targetCut = 0,
): Settlement {
  const winnerIds = [...picks].filter(([, side]) => side === outcome).map(([h]) => h);
  const loserIds = [...picks].filter(([, side]) => side !== outcome).map(([h]) => h);
  const pot = picks.size * stake;
  const againstCrowd = winnerIds.length > 0 && winnerIds.length < loserIds.length;
  const targetBonus = againstCrowd && targetCut > 0 ? Math.max(1, Math.floor(pot * targetCut)) : 0;
  const payout = winnerIds.length ? Math.floor((pot - targetBonus) / winnerIds.length) : 0;
  return { winnerIds, loserIds, pot, payout, targetBonus, refundAll: winnerIds.length === 0 };
}
