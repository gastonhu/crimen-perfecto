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
  /** Modo estricto: sin errores marcados ni ayudas, +25% de puntos. Se fija al abrir el caso. */
  strict: boolean;
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
  /** Intento existente o null (no lo crea: el reloj no arranca). */
  getAttempt(s: Session, puzzleId: string): Promise<Attempt | null>;
  startAttempt(s: Session, puzzleId: string, strict: boolean): Promise<Attempt>;
  useHint(s: Session, attemptId: string): Promise<void>;
  submit(s: Session, attemptId: string, placements: Placement, killer: string): Promise<SubmitResult>;
  solvedPuzzles(s: Session): Promise<string[]>;
  leaderboard(): Promise<GlobalRow[]>;
  puzzleLeaderboard(puzzleId: string): Promise<PuzzleRow[]>;
}

/** Puntaje (idéntico a `cp_score` en SQL, más el ×1.25 del modo estricto que aplica `cp_submit`). */
export function score(difficulty: number, size: number, seconds: number, hints: number, wrong: number, strict = false): number {
  const base = 100 * difficulty;
  const par = size * size * 8;
  const timeFactor = Math.min(1.5, Math.max(0.5, par / Math.max(seconds, 1)));
  const penalty = Math.max(0.3, 1 - 0.15 * hints - 0.1 * wrong);
  const points = Math.max(10, Math.round(base * timeFactor * penalty));
  return strict ? Math.round(points * 1.25) : points;
}

export const ALIAS_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_.-]{3,20}$/;
export const PIN_RE = /^\d{4,6}$/;
