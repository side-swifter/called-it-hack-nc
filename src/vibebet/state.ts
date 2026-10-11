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
  };
}

export function startReading(): void {
  state.phase = "reading";
}

export function openBet(targetAlias: string, item: string, groupSpace: Space | null, players: string[] = []): void {
  state.item = item;
  state.players = players;
  state.phase = "open";
  state.groupSpace = groupSpace;
  state.targetAlias = targetAlias;
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
