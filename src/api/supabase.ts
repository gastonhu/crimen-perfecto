// Backend Supabase: toda la lógica sensible (PIN, tiempos, verificación de la solución) corre en funciones SQL.
import { createClient } from '@supabase/supabase-js';
import type { Attempt, Backend, GlobalRow, PuzzleRow } from './types';

interface RawAttempt {
  attempt_id: string;
  started_at: string;
  hints_used: number;
  wrong_submits: number;
  solved: boolean;
  strict: boolean;
  score: number | null;
  seconds: number | null;
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
});

export function supabaseBackend(url: string, anonKey: string): Backend {
  const db = createClient(url, anonKey, { auth: { persistSession: false } });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  return {
    online: true,
    async register(alias, pin) {
      return { alias, token: await rpc<string>('cp_register', { p_alias: alias, p_pin: pin }) };
    },
    async login(alias, pin) {
      return { alias, token: await rpc<string>('cp_login', { p_alias: alias, p_pin: pin }) };
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
    async submit(s, attemptId, placements, killer) {
      const r = await rpc<{ correct: boolean; wrong_submits: number; score: number | null; seconds: number | null; killer: string | null }>(
        'cp_submit',
        { p_token: s.token, p_attempt_id: attemptId, p_placements: placements, p_killer: killer },
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
    async leaderboard() {
      const { data, error } = await db.from('cp_leaderboard').select('alias, points, solved').limit(20);
      if (error) throw new Error(error.message);
      return data as GlobalRow[];
    },
    async puzzleLeaderboard(puzzleId) {
      const { data, error } = await db
        .from('cp_puzzle_leaderboard')
        .select('alias, seconds, score')
        .eq('puzzle_id', puzzleId)
        .order('seconds')
        .limit(10);
      if (error) throw new Error(error.message);
      return data as PuzzleRow[];
    },
  };
}
