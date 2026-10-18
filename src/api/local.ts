// Backend local (sin Supabase): todo vive en localStorage de este navegador. Sirve para desarrollar y jugar offline.
import { killerOf, solve, type Placement } from '../engine';
import { puzzleById } from '../puzzles';
import { score, type Attempt, type Backend, type GlobalRow, type PuzzleRow, type Session } from './types';

interface LocalAttempt extends Attempt {
  alias: string;
  puzzleId: string;
}
interface Store {
  players: Record<string, { pin: string }>;
  attempts: LocalAttempt[];
}

const KEY = 'crimen-perfecto:local';
const load = (): Store => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') as Store;
  } catch {
    return { players: {}, attempts: [] };
  }
};
const save = (s: Store) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento bloqueado: se pierde al recargar */
  }
};

async function hash(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cp:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const norm = (a: string) => a.trim().toLowerCase();

export const localBackend: Backend = {
  online: false,

  async register(alias, pin) {
    const s = load();
    if (s.players[norm(alias)]) throw new Error('Ese alias ya está en uso.');
    s.players[norm(alias)] = { pin: await hash(pin) };
    save(s);
    return { alias: alias.trim(), token: norm(alias) };
  },

  async login(alias, pin) {
    const s = load();
    const p = s.players[norm(alias)];
    if (!p || p.pin !== (await hash(pin))) throw new Error('Alias o PIN incorrectos.');
    return { alias: alias.trim(), token: norm(alias) };
  },

  async startAttempt(sess, puzzleId) {
    const s = load();
    const prev = s.attempts.find((a) => a.alias === sess.alias && a.puzzleId === puzzleId);
    if (prev) return prev;
    const a: LocalAttempt = {
      attemptId: crypto.randomUUID(),
      alias: sess.alias,
      puzzleId,
      startedAt: Date.now(),
      hintsUsed: 0,
      wrongSubmits: 0,
      solved: false,
    };
    s.attempts.push(a);
    save(s);
    return a;
  },

  async useHint(_sess, attemptId) {
    const s = load();
    const a = s.attempts.find((x) => x.attemptId === attemptId);
    if (a && !a.solved) a.hintsUsed++;
    save(s);
  },

  async submit(_sess, attemptId, placements: Placement, killer) {
    const s = load();
    const a = s.attempts.find((x) => x.attemptId === attemptId);
    if (!a) throw new Error('Intento inexistente.');
    const p = puzzleById(a.puzzleId)!;
    const [sol] = solve(p, { limit: 1 });
    const realKiller = killerOf(p, sol)!;
    const correct =
      killer === realKiller && p.people.every((x) => placements[x.id]?.r === sol[x.id].r && placements[x.id]?.c === sol[x.id].c);
    if (a.solved) return { correct, wrongSubmits: a.wrongSubmits, score: a.score, seconds: a.seconds, killer: realKiller };
    if (!correct) {
      a.wrongSubmits++;
      save(s);
      return { correct, wrongSubmits: a.wrongSubmits };
    }
    a.solved = true;
    a.seconds = Math.round((Date.now() - a.startedAt) / 1000);
    a.score = score(p.difficulty, p.size, a.seconds, a.hintsUsed, a.wrongSubmits);
    save(s);
    return { correct, wrongSubmits: a.wrongSubmits, score: a.score, seconds: a.seconds, killer: realKiller };
  },

  async solvedPuzzles(sess) {
    return load()
      .attempts.filter((a) => a.alias === sess.alias && a.solved)
      .map((a) => a.puzzleId);
  },

  async leaderboard() {
    const rows = new Map<string, GlobalRow>();
    for (const a of load().attempts.filter((x) => x.solved)) {
      const r = rows.get(a.alias) ?? { alias: a.alias, points: 0, solved: 0 };
      r.points += a.score ?? 0;
      r.solved++;
      rows.set(a.alias, r);
    }
    return [...rows.values()].sort((a, b) => b.points - a.points).slice(0, 20);
  },

  async puzzleLeaderboard(puzzleId) {
    return load()
      .attempts.filter((a) => a.puzzleId === puzzleId && a.solved)
      .map((a): PuzzleRow => ({ alias: a.alias, seconds: a.seconds!, score: a.score! }))
      .sort((a, b) => a.seconds - b.seconds)
      .slice(0, 10);
  },
};

export type { Session };
