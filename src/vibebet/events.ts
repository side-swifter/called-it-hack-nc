// Activity log (persisted to .events.json) and settled results for the app. Demo-tagged entries stay in memory only.
import { readFileSync, writeFileSync } from "node:fs";

export interface ChatEntry {
  id: string;
  sender: string;
  text: string;
  at: string;
  isAgent: boolean;
}
export interface ActivityEntry {
  at: string;
  kind: "prediction" | "chips" | "agent";
  text: string;
  status: "ok" | "pending" | "failed";
  predictionId?: string;
}
export interface StoredResult {
  predictionId: string;
  outcome: "YES" | "NO";
  headline: string;
  pool: number;
  announcement: string;
  announcementStatus: "preparing" | "sending" | "delivered" | "failed";
  snowflakeOk: boolean;
  nessieOk: boolean;
  photonOk: boolean;
  rows: { name: string; choice: string; correct: boolean; contributed: number; payout: number; balance: number }[];
}

const FILE = ".events.json";
const chat: ChatEntry[] = [];
let activity: ActivityEntry[] = [];
let results: StoredResult[] = [];
let seq = 0;

try {
  const saved = JSON.parse(readFileSync(FILE, "utf8")) as { activity?: ActivityEntry[]; results?: StoredResult[] };
  activity = saved.activity ?? [];
  results = saved.results ?? [];
} catch {
  /* first run */
}

// Entries added by the demo routes, so reset can remove exactly those. They are never written to disk.
const demoChat = new Set<ChatEntry>();
const demoActivity = new Set<ActivityEntry>();

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function persist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    try {
      writeFileSync(FILE, JSON.stringify({ activity: activity.filter((a) => !demoActivity.has(a)), results }));
    } catch {
      /* best effort */
    }
  }, 150);
  saveTimer.unref();
}

export function addMessage(sender: string, text: string, isAgent = false, opts: { at?: Date; demo?: boolean } = {}): void {
  const entry = { id: `m${++seq}`, sender, text, at: (opts.at ?? new Date()).toISOString(), isAgent };
  chat.push(entry);
  if (opts.demo) demoChat.add(entry);
  if (chat.length > 80) chat.shift();
}

export function logEvent(kind: ActivityEntry["kind"], text: string, predictionId?: string, status: ActivityEntry["status"] = "ok", opts: { at?: Date; demo?: boolean } = {}): void {
  const entry = { at: (opts.at ?? new Date()).toISOString(), kind, text, status, predictionId };
  activity.unshift(entry);
  if (opts.demo) demoActivity.add(entry);
  if (activity.length > 100) activity.pop();
  if (!opts.demo) persist();
}

export function removeDemoEntries(): void {
  activity = activity.filter((a) => !demoActivity.has(a));
  demoActivity.clear();
  for (let i = chat.length - 1; i >= 0; i--) if (demoChat.has(chat[i])) chat.splice(i, 1);
  demoChat.clear();
}

export function addResult(r: StoredResult): StoredResult {
  results.unshift(r);
  if (results.length > 20) results.pop();
  persist();
  return r;
}
export const latestResult = (): StoredResult | undefined => results[0];

export const getMessages = (): ChatEntry[] => chat.slice(-50);
export const getActivity = (): ActivityEntry[] => activity.slice(0, 60);

// The bot registers how to post into the live group chat.
type Sender = (text: string) => Promise<void>;
let sender: Sender | undefined;
export function registerSender(fn: Sender): void {
  sender = fn;
}
export const hasSender = (): boolean => Boolean(sender);
export async function sendToGroup(text: string): Promise<boolean> {
  if (!sender) return false;
  try {
    await sender(text);
    return true;
  } catch (e) {
    console.error("[api] group send failed:", (e as Error).message);
    return false;
  }
}
