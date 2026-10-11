// Weekly last-place dare: schedule (Sundays 21:00 server local time) and the persisted record of past dares.
import { readFileSync, writeFileSync } from "node:fs";

export const DARE_FILE = ".dare.json";
export const CATCH_UP_MS = 12 * 60 * 60 * 1000; // a missed Sunday slot is only posted late if we're within 12h of it

export interface PostedDare {
  text: string;
  name: string;
  postedAt: string;
}
export interface DareFile {
  last: number; // ms of the last post (or of the first run, which starts the first week)
  text?: string;
  name?: string;
  groupId?: string;
  postedAt?: string;
  groups?: Record<string, PostedDare>;
}

/** Most recent Sunday 21:00 (server local time) at or before `now`. */
export function lastSlot(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(21, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
  return d;
}

/** The next Sunday 21:00 strictly after `now`. */
export function nextSlot(now = new Date()): Date {
  const d = lastSlot(now);
  d.setDate(d.getDate() + 7);
  return d;
}

/** Reads both the old `{last}` shape and the extended one. Returns undefined on first run. */
export function loadDare(): DareFile | undefined {
  try {
    const j = JSON.parse(readFileSync(DARE_FILE, "utf8")) as Partial<DareFile>;
    if (typeof j.last !== "number") return undefined;
    return { ...j, last: j.last };
  } catch {
    return undefined;
  }
}

export function saveDare(f: DareFile): void {
  try {
    writeFileSync(DARE_FILE, JSON.stringify(f));
  } catch {
    /* best effort */
  }
}
