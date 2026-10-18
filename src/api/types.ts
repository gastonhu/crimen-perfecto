import type { Placement } from '../engine';

export interface Session {
  alias: string;
  token: string;
}

export interface Attempt {
  attemptId: string;
  startedAt: number;
  hintsUsed: number;
  wrongSubmits: number;
  solved: boolean;
  score?: number;
  seconds?: number;
}

export interface SubmitResult {
  correct: boolean;
  wrongSubmits: number;
  score?: number;
  seconds?: number;
  killer?: string;
}

export interface GlobalRow {
  alias: string;
  points: number;
  solved: number;
}

export interface PuzzleRow {
  alias: string;
  seconds: number;
  score: number;
}

export interface Backend {
  /** true si el marcador es compartido (Supabase); false = solo este navegador. */
  online: boolean;
  register(alias: string, pin: string): Promise<Session>;
  login(alias: string, pin: string): Promise<Session>;
  startAttempt(s: Session, puzzleId: string): Promise<Attempt>;
  useHint(s: Session, attemptId: string): Promise<void>;
  submit(s: Session, attemptId: string, placements: Placement, killer: string): Promise<SubmitResult>;
  solvedPuzzles(s: Session): Promise<string[]>;
  leaderboard(): Promise<GlobalRow[]>;
  puzzleLeaderboard(puzzleId: string): Promise<PuzzleRow[]>;
}

/** Puntaje (idéntico a la función SQL `cp_score`). */
export function score(difficulty: number, size: number, seconds: number, hints: number, wrong: number): number {
  const base = 100 * difficulty;
  const par = size * size * 8;
  const timeFactor = Math.min(1.5, Math.max(0.5, par / Math.max(seconds, 1)));
  const penalty = Math.max(0.3, 1 - 0.15 * hints - 0.1 * wrong);
  return Math.max(10, Math.round(base * timeFactor * penalty));
}

export const ALIAS_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_.-]{3,20}$/;
export const PIN_RE = /^\d{4,6}$/;
