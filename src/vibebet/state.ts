import type { Space } from "spectrum-ts";

export const PROOFS_NEEDED = 1;

export type GamePhase = "idle" | "reading" | "open" | "settled";

export interface GameState {
  phase: GamePhase;
  targetAlias: string | null;
  picks: Map<string, "yes" | "no">; // handle -> their bet
  item: string;
  proofs: Set<string>; // handles whose proof was accepted
  photoFrom: Set<string>; // handles who sent a photo and are waiting to be judged
  groupSpace: Space | null;
  players: string[];
  timer: ReturnType<typeof setTimeout> | null; // auto-settles "no" at the deadline
  deadline: number | null; // epoch ms
  betId: string; // stable id the app uses for this bet
  targetId: string | null; // handle of the person the real bet is about
  decoyPerson: string | null; // alias the target's decoy bet is about (null until the DMs are written)
  decoyItem: string | null;
  reason: string | null; // why the AI picked this bet
  planned: boolean; // true when Cortex planned the bet from group chat
}

let state: GameState = {
  phase: "idle",
  targetAlias: null,
  picks: new Map(),
  item: "",
  proofs: new Set(),
  photoFrom: new Set(),
  groupSpace: null,
  players: [],
  timer: null,
  deadline: null,
  betId: "",
  targetId: null,
  decoyPerson: null,
  decoyItem: null,
  reason: null,
  planned: false,
};

export function getState(): GameState {
  return state;
}

export function resetState(): void {
  clearDeadline();
  state = {
    phase: "idle",
    targetAlias: null,
    picks: new Map(),
    item: "",
    proofs: new Set(),
    photoFrom: new Set(),
    groupSpace: null,
    players: [],
    timer: null,
    deadline: null,
    betId: "",
    targetId: null,
    decoyPerson: null,
    decoyItem: null,
    reason: null,
    planned: false,
  };
}

export function startReading(): void {
  state.phase = "reading";
}

export function openBet(targetAlias: string, item: string, groupSpace: Space | null, players: string[] = [], targetId: string | null = null): void {
  state.betId = `B${Date.now().toString(36)}`;
  state.targetId = targetId;
  state.decoyPerson = null;
  state.decoyItem = null;
  state.reason = null;
  state.planned = false;
  state.item = item;
  state.players = players;
  state.phase = "open";
  state.groupSpace = groupSpace;
  state.targetAlias = targetAlias;
}

export function setBetMeta(meta: { decoyPerson?: string; decoyItem?: string; reason?: string | null; planned?: boolean }): void {
  if (meta.decoyPerson !== undefined) state.decoyPerson = meta.decoyPerson;
  if (meta.decoyItem !== undefined) state.decoyItem = meta.decoyItem;
  if (meta.reason !== undefined) state.reason = meta.reason;
  if (meta.planned !== undefined) state.planned = meta.planned;
}

export function pick(handle: string, side: "yes" | "no"): void {
  if (state.phase !== "open") return;
  state.picks.set(handle, side);
}

export function clearDeadline(): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.deadline = null;
}

export function setDeadline(timer: ReturnType<typeof setTimeout>, deadline: number): void {
  clearDeadline();
  state.timer = timer;
  state.deadline = deadline;
}

export function settle(): void {
  clearDeadline();
  state.phase = "settled";
}

// Returns true once enough distinct people have confirmed.
export function addProof(handle: string): boolean {
  if (state.phase !== "open") return false;
  state.proofs.add(handle);
  return state.proofs.size >= PROOFS_NEEDED;
}
