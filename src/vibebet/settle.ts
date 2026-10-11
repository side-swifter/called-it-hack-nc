export type Outcome = "yes" | "no";

export interface Settlement {
  winnerIds: string[];
  loserIds: string[];
  pot: number;
  /** Chips paid to each winner (0 when nobody won). */
  payout: number;
  /** Chips paid to the person the bet is about for defending themselves (see `defended`). */
  targetBonus: number;
  /** True when the target proved they did NOT do it and at least one player had bet YES against them. */
  defended: boolean;
  /** True when nobody was on the winning side and the target wasn't paid: every player gets their stake back. */
  refundAll: boolean;
}

export interface SettleOptions {
  /** The person the bet is about sent the accepted proof that they did NOT do it. */
  refutedByTarget?: boolean;
  /** Share of the pot the defending target keeps when NO-pickers also win (default 25%). */
  defenseCut?: number;
}

export const DEFENSE_CUT = 0.25;

/**
 * Pure payout math. pot = picks x stake, split evenly among the players whose pick equals the outcome (floored).
 * Defense: if the target personally proves it did NOT happen, the players who bet YES against them lose their
 * stakes to the target: the target keeps `defenseCut` of the pot and the NO-pickers split the rest. If nobody
 * bet NO, the target takes the whole pot.
 */
export function computeSettlement(
  picks: ReadonlyMap<string, Outcome>,
  outcome: Outcome,
  stake: number,
  opts: SettleOptions = {},
): Settlement {
  const winnerIds = [...picks].filter(([, side]) => side === outcome).map(([h]) => h);
  const loserIds = [...picks].filter(([, side]) => side !== outcome).map(([h]) => h);
  const pot = picks.size * stake;
  const defended = Boolean(opts.refutedByTarget) && outcome === "no" && loserIds.length > 0;
  const cut = opts.defenseCut ?? DEFENSE_CUT;
  const targetBonus = defended ? (winnerIds.length ? Math.max(1, Math.floor(pot * cut)) : pot) : 0;
  const payout = winnerIds.length ? Math.floor((pot - targetBonus) / winnerIds.length) : 0;
  return { winnerIds, loserIds, pot, payout, targetBonus, defended, refundAll: winnerIds.length === 0 && !defended };
}
