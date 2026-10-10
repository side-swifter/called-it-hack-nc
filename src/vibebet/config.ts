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

export const ITEMS = [
  "a red jacket",
  "a black t-shirt",
  "a white hoodie",
  "a blue shirt",
  "a green jacket",
  "a gray sweatshirt",
];
