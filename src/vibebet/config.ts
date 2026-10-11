export interface Player {
  alias: string;
  handle: string;
  nessieAccountId?: string;
}

// Optional nicknames for known numbers. Anyone not listed still plays;
// they just show up by the last 4 digits of their number.
export const ROSTER: Player[] = [{ alias: "Akshay", handle: "+19843303521" }];

import { readFileSync, writeFileSync } from "node:fs";

export const NAMES = new Map<string, string>(
  (() => {
    try {
      return Object.entries(JSON.parse(readFileSync(".names.json", "utf8")) as Record<string, string>);
    } catch {
      return [];
    }
  })(),
);
export function saveNames(): void {
  try {
    writeFileSync(".names.json", JSON.stringify(Object.fromEntries(NAMES)));
  } catch {}
}

export function aliasFor(handle: string): string {
  return NAMES.get(handle) ?? ROSTER.find((p) => p.handle === handle)?.alias ?? `…${handle.replace(/\D/g, "").slice(-4)}`;
}

// Bets are "will <person> <claim> today?", so a claim is any outfit or habit.
export const STAKE = 30;
export const START_CHIPS = 100;

export const ITEMS = [
  "wear a red jacket",
  "wear a black t-shirt",
  "wear a white hoodie",
  "wear a blue shirt",
  "wear a green jacket",
  "wear a gray sweatshirt",
  "be late to class",
  "make it to an 8 AM class",
  "skip the gym",
  "order food delivery",
  "stay up past 2 AM",
  "wake up before 8 AM",
];

// Decoy bets use claims nobody realistically pulls off, so a decoy holder's "proof" can never be real.
export const IMPOSSIBLE_ITEMS = [
  "wear a full tuxedo",
  "wear a banana costume",
  "wear a puffy winter parka",
  "wear a bathrobe and slippers",
  "wear knight's armor",
  "show up to class in a full wetsuit",
];
