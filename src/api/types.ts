import type { Placement } from '../engine';

export interface Session {
  alias: string;
  token: string;
}

/** Tablero en curso: colocaciones, marcas ✗ ("r,c") y notas (ids candidatos por casilla "r,c"). */
export interface BoardData {
  placements: Partial<Placement>;
  marks: string[];
  notes: Record<string, string[]>;
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
  /** Último tablero guardado en el servidor (sin validar: puede venir de otra versión del caso). */
  board?: unknown;
  /** Cuándo se guardó `board` (ms, reloj del servidor). */
  boardUpdatedAt?: number;
}

/** Lo que el servidor sabe de un caso publicado. */
export interface PuzzleMeta {
  difficulty: number;
  /** SHA-256 de la lógica del caso (`logicHash`), o null si se publicó antes de guardarlo. */
  contentHash: string | null;
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
  /** Revoca la sesión en el servidor. */
  logout(s: Session): Promise<void>;
  /** Intento existente o null (no lo crea: el reloj no arranca). */
  getAttempt(s: Session, puzzleId: string): Promise<Attempt | null>;
  startAttempt(s: Session, puzzleId: string, strict: boolean): Promise<Attempt>;
  useHint(s: Session, attemptId: string): Promise<void>;
  /** Guarda el tablero en curso; devuelve la hora del servidor (ms). Falla si el intento ya está resuelto. */
  saveProgress(s: Session, attemptId: string, board: BoardData): Promise<number>;
  /** `contentHash`: hash del caso que tiene el front; si no coincide con el publicado, el servidor lo rechaza. */
  submit(s: Session, attemptId: string, placements: Placement, killer: string, contentHash?: string): Promise<SubmitResult>;
  solvedPuzzles(s: Session): Promise<string[]>;
  /** Metadatos del caso publicado, o null si no está publicado. */
  puzzleMeta(puzzleId: string): Promise<PuzzleMeta | null>;
  leaderboard(): Promise<GlobalRow[]>;
  puzzleLeaderboard(puzzleId: string): Promise<PuzzleRow[]>;
}

/**
 * Error del backend con un tipo para decidir qué hacer:
 * - `offline`: no hubo respuesta (sin internet, servidor caído, timeout). Se puede reintentar.
 * - `server`: el servidor respondió con un error 5xx. Se puede reintentar.
 * - `session`: la sesión venció o se cerró: hay que volver a ingresar.
 * - `rejected`: el servidor rechazó el pedido (validación, límite de intentos…). No tiene sentido reintentar.
 */
export type BackendErrorKind = 'offline' | 'server' | 'session' | 'rejected';

export class BackendError extends Error {
  readonly kind: BackendErrorKind;
  constructor(message: string, kind: BackendErrorKind) {
    super(message);
    this.name = 'BackendError';
    this.kind = kind;
  }
  get retryable(): boolean {
    return this.kind === 'offline' || this.kind === 'server';
  }
}

export const SESSION_INVALID = 'Sesión inválida. Volvé a ingresar.';
export const isSessionError = (e: unknown): boolean => e instanceof BackendError && e.kind === 'session';
export const isRetryable = (e: unknown): boolean => e instanceof BackendError && e.retryable;

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
