// Backend Supabase: toda la lógica sensible (PIN, tiempos, verificación de la solución) corre en funciones SQL.
// Cliente mínimo con fetch contra PostgREST, en vez de @supabase/supabase-js (que sumaba ~210 kB al bundle, ~54 kB
// con gzip): POST /rest/v1/rpc/<fn> para las funciones y GET /rest/v1/<vista> para el ranking.
import type { Puzzle } from '../engine';
import {
  BackendError,
  SESSION_INVALID,
  type Attempt,
  type Backend,
  type GlobalRow,
  type PuzzleMeta,
  type PuzzleRow,
} from './types';

interface RawAttempt {
  attempt_id: string;
  started_at: string;
  hints_used: number;
  wrong_submits: number;
  solved: boolean;
  strict: boolean;
  score: number | null;
  seconds: number | null;
  board?: unknown;
  board_updated_at?: string | null;
}

interface PostgrestError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const toAttempt = (a: RawAttempt): Attempt => ({
  attemptId: a.attempt_id,
  startedAt: Date.parse(a.started_at),
  hintsUsed: a.hints_used,
  wrongSubmits: a.wrong_submits,
  solved: a.solved,
  strict: a.strict ?? false,
  score: a.score ?? undefined,
  seconds: a.seconds ?? undefined,
  board: a.board ?? undefined,
  boardUpdatedAt: a.board_updated_at ? Date.parse(a.board_updated_at) : undefined,
});

const TIMEOUT_MS = 15_000;

/** Traduce una respuesta de error de PostgREST a un mensaje en castellano con su tipo. */
export function toBackendError(status: number, body: unknown, what: string): BackendError {
  const err = (body && typeof body === 'object' ? body : {}) as PostgrestError;
  const msg = err.message ?? '';
  if (msg.startsWith('Sesión inválida')) return new BackendError(SESSION_INVALID, 'session');
  // raise exception de nuestras funciones: el mensaje ya está pensado para el jugador.
  if (err.code === 'P0001' && msg) return new BackendError(msg, 'rejected');
  if (status === 429) return new BackendError('Demasiados pedidos al servidor. Esperá un momento y probá de nuevo.', 'server');
  if (status >= 500)
    return new BackendError(`El servidor no está disponible en este momento (error ${status}). Probá de nuevo en un rato.`, 'server');
  if (status === 404 || err.code === 'PGRST202' || err.code === 'PGRST205' || err.code === '42P01' || err.code === '42883')
    return new BackendError(`El servidor no tiene ${what}: ¿falta aplicar una migración?`, 'rejected');
  if (status === 401 || /api key|jwt/i.test(msg))
    return new BackendError('El servidor rechazó la clave de acceso (revisá VITE_SUPABASE_ANON_KEY).', 'rejected');
  if (status === 403 || err.code === '42501') return new BackendError(`El servidor no permite usar ${what}.`, 'rejected');
  return new BackendError(msg ? `El servidor rechazó el pedido: ${msg}` : `Error ${status} del servidor.`, 'rejected');
}

export function supabaseBackend(url: string, anonKey: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Backend {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const auth = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  async function request<T>(path: string, init: RequestInit, what: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let status: number;
    let text: string;
    try {
      const res = await fetchImpl(`${base}${path}`, { ...init, headers: { ...auth, ...init.headers }, signal: ctrl.signal });
      status = res.status;
      text = await res.text();
    } catch {
      throw new BackendError(
        ctrl.signal.aborted
          ? 'El servidor tardó demasiado en responder. Probá de nuevo.'
          : 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.',
        'offline',
      );
    } finally {
      clearTimeout(timer);
    }
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        if (status < 300) throw new BackendError('Respuesta inesperada del servidor.', 'server');
      }
    }
    if (status >= 200 && status < 300) return body as T;
    throw toBackendError(status, body, what);
  }

  const rpc = <T>(fn: string, args: Record<string, unknown>, keepalive = false) =>
    request<T>(
      `/rpc/${fn}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args), keepalive },
      `la función ${fn}`,
    );
  const view = <T>(name: string, query: Record<string, string>) =>
    request<T>(`/${name}?${new URLSearchParams(query)}`, { method: 'GET', headers: { Accept: 'application/json' } }, `la vista ${name}`);

  return {
    online: true,
    async register(alias, pin) {
      return { alias, token: await rpc<string>('cp_register', { p_alias: alias, p_pin: pin }) };
    },
    async login(alias, pin) {
      // Con PIN incorrecto devuelve null (no un error, para que el límite de intentos cuente el fallo).
      const token = await rpc<string | null>('cp_login', { p_alias: alias, p_pin: pin });
      if (!token) throw new BackendError('Alias o PIN incorrectos.', 'rejected');
      return { alias, token };
    },
    async logout(s) {
      await rpc('cp_logout', { p_token: s.token });
    },
    async getAttempt(s, puzzleId) {
      const a = await rpc<RawAttempt | null>('cp_get_attempt', { p_token: s.token, p_puzzle_id: puzzleId });
      return a ? toAttempt(a) : null;
    },
    async startAttempt(s, puzzleId, strict) {
      return toAttempt(await rpc<RawAttempt>('cp_start_attempt', { p_token: s.token, p_puzzle_id: puzzleId, p_strict: strict }));
    },
    async useHint(s, attemptId) {
      await rpc('cp_use_hint', { p_token: s.token, p_attempt_id: attemptId });
    },
    async saveProgress(s, attemptId, board) {
      // keepalive: el guardado llega aunque se cierre la pestaña justo después.
      const at = await rpc<string>('cp_save_progress', { p_token: s.token, p_attempt_id: attemptId, p_board: board }, true);
      return Date.parse(at);
    },
    async submit(s, attemptId, placements, killer, contentHash) {
      const r = await rpc<{ correct: boolean; wrong_submits: number; score: number | null; seconds: number | null; killer: string | null }>(
        'cp_submit',
        { p_token: s.token, p_attempt_id: attemptId, p_placements: placements, p_killer: killer, p_content_hash: contentHash ?? null },
      );
      return {
        correct: r.correct,
        wrongSubmits: r.wrong_submits,
        score: r.score ?? undefined,
        seconds: r.seconds ?? undefined,
        killer: r.killer ?? undefined,
      };
    },
    async solvedPuzzles(s) {
      return rpc<string[]>('cp_solved_puzzles', { p_token: s.token });
    },
    async puzzleMeta(puzzleId): Promise<PuzzleMeta | null> {
      const rows = await view<{ difficulty: number; content_hash: string | null }[]>('cp_puzzle_meta', {
        select: 'difficulty,content_hash',
        id: `eq.${puzzleId}`,
      });
      return rows[0] ? { difficulty: rows[0].difficulty, contentHash: rows[0].content_hash } : null;
    },
    async listPuzzles() {
      const rows = await view<{ data: Puzzle }[]>('cp_public_puzzles', { select: 'data', order: 'published_at.desc' });
      return rows.map((r) => r.data);
    },
    async leaderboard() {
      return view<GlobalRow[]>('cp_leaderboard', { select: 'alias,points,solved', limit: '20' });
    },
    async puzzleLeaderboard(puzzleId) {
      return view<PuzzleRow[]>('cp_puzzle_leaderboard', {
        select: 'alias,seconds,score',
        puzzle_id: `eq.${puzzleId}`,
        order: 'seconds.asc',
        limit: '10',
      });
    },
  };
}
