import type { Space } from "spectrum-ts";

export const PROOFS_NEEDED = 2;

export type GamePhase = "idle" | "reading" | "open" | "settled";

export interface GameState {
  phase: GamePhase;
  targetAlias: string | null;
  entries: Map<string, string>; // handle -> alias
  pot: number;
  proofs: Set<string>; // handles that sent proof
  groupSpace: Space | null;
}

let state: GameState = {
  phase: "idle",
  targetAlias: null,
  entries: new Map(),
  pot: 0,
  proofs: new Set(),
  groupSpace: null,
};

export function getState(): GameState {
  return state;
}

export function resetState(): void {
  state = {
    phase: "idle",
    targetAlias: null,
    entries: new Map(),
    pot: 0,
    proofs: new Set(),
    groupSpace: null,
  };
}

export function startReading(): void {
  state.phase = "reading";
}

export function openBet(targetAlias: string, groupSpace: Space): void {
  state.phase = "open";
  state.groupSpace = groupSpace;
  state.targetAlias = targetAlias;
}

export function enter(handle: string, alias: string): void {
  if (state.phase !== "open" || state.entries.has(handle)) return;
  state.entries.set(handle, alias);
  state.pot += 2;
}

export function settle(): void {
  state.phase = "settled";
}

// Returns true once enough distinct people have confirmed.
export function addProof(handle: string): boolean {
  if (state.phase !== "open") return false;
  state.proofs.add(handle);
  return state.proofs.size >= PROOFS_NEEDED;
}
