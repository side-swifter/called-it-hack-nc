export interface Player {
  alias: string;
  handle: string;
  nessieAccountId?: string;
}

// Optional nicknames for known numbers. Anyone not listed still plays;
// they just show up by the last 4 digits of their number.
export const ROSTER: Player[] = [{ alias: "Akshay", handle: "+19843303521" }];

export const NAMES = new Map<string, string>();

export function aliasFor(handle: string): string {
  return NAMES.get(handle) ?? ROSTER.find((p) => p.handle === handle)?.alias ?? `…${handle.replace(/\D/g, "").slice(-4)}`;
}

export const ITEMS = [
  "a red jacket",
  "a black t-shirt",
  "a white hoodie",
  "a blue shirt",
  "a green jacket",
  "a gray sweatshirt",
];
