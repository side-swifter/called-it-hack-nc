// In-memory event log and chat buffer feeding the app's Activity and Room screens.
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

const chat: ChatEntry[] = [];
const activity: ActivityEntry[] = [];
let seq = 0;

// Entries added while seeding the demo state, so reset can remove exactly those.
const demoChat = new Set<ChatEntry>();
const demoActivity = new Set<ActivityEntry>();

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
}

export function removeDemoEntries(): void {
  for (const set of [demoChat, demoActivity]) {
    const list: unknown[] = set === demoChat ? chat : activity;
    for (let i = list.length - 1; i >= 0; i--) if (set.has(list[i] as never)) list.splice(i, 1);
    set.clear();
  }
}

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
