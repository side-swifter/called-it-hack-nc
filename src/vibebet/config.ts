export interface Player {
  alias: string;
  handle: string;
  nessieAccountId?: string;
}

// Optional nicknames for known numbers. Anyone not listed still plays;
// they just show up by the last 4 digits of their number.
export const ROSTER: Player[] = [{ alias: "Akshay", handle: "+19843303521" }];

export function aliasFor(handle: string): string {
  return ROSTER.find((p) => p.handle === handle)?.alias ?? `…${handle.replace(/\D/g, "").slice(-4)}`;
}

export function realBetFor(targetAlias: string): string {
  return `🎯 the bet: will ${targetAlias} show up in a red jacket today? reply "in" to throw 2 chips in. winner takes the pot.`;
}

export const PLACEBO_BET =
  `🎯 the bet: will someone say "you too" to a waiter today? reply "in" to throw 2 chips in. winner takes the pot.`;

export const ENTRY_FEE_CHIPS = 2;
