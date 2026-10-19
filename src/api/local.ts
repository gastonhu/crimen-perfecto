// Backend local (sin Supabase): todo vive en localStorage de este navegador. Sirve para desarrollar y jugar offline.
// Imita las reglas del servidor (sesiones que vencen, progreso por intento, hash del caso) para probar los mismos flujos.
import { killerOf, logicHash, solve, type Placement } from '../engine';
import { puzzleById } from '../puzzles';
import {
  BackendError,
  SESSION_INVALID,
  score,
  type Attempt,
  type Backend,
  type GlobalRow,
  type PuzzleRow,
  type Session,
} from './types';

interface LocalAttempt extends Attempt {
  alias: string;
  puzzleId: string;
}
interface Store {
  players: Record<string, { pin: string; alias?: string }>;
  attempts: LocalAttempt[];
  sessions?: Record<string, { alias: string; lastUsed: number }>;
}

const KEY = 'crimen-perfecto:local';
export const SESSION_TTL_MS = 90 * 24 * 3600 * 1000;
const MAX_BOARD_BYTES = 16384;

const load = (): Store => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as Store;
    return { players: s.players ?? {}, attempts: s.attempts ?? [], sessions: s.sessions ?? {} };
  } catch {
    return { players: {}, attempts: [], sessions: {} };
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
const rejected = (msg: string) => new BackendError(msg, 'rejected');

function newSession(s: Store, alias: string): Session {
  const token = crypto.randomUUID();
  s.sessions![token] = { alias, lastUsed: Date.now() };
  save(s);
  return { alias, token };
}

/** Alias dueño del token (y renueva la sesión), o error de sesión inválida como el servidor. */
function player(s: Store, sess: Session): string {
  const row = s.sessions![sess.token];
  if (!row || Date.now() - row.lastUsed > SESSION_TTL_MS) throw new BackendError(SESSION_INVALID, 'session');
  row.lastUsed = Date.now();
  save(s);
  return row.alias;
}

const own = (s: Store, alias: string, attemptId: string) =>
  s.attempts.find((x) => x.attemptId === attemptId && x.alias === alias);

export const localBackend: Backend = {
  online: false,

  async register(alias, pin) {
    const s = load();
    if (s.players[norm(alias)]) throw rejected('Ese alias ya está en uso.');
    s.players[norm(alias)] = { pin: await hash(pin), alias: alias.trim() };
    return newSession(s, alias.trim());
  },

  async login(alias, pin) {
    const s = load();
    const p = s.players[norm(alias)];
    if (!p || p.pin !== (await hash(pin))) throw rejected('Alias o PIN incorrectos.');
    return newSession(s, p.alias ?? alias.trim());
  },

  async logout(sess) {
    const s = load();
    delete s.sessions![sess.token];
    save(s);
  },

  async getAttempt(sess, puzzleId) {
    const s = load();
    const alias = player(s, sess);
    return s.attempts.find((a) => a.alias === alias && a.puzzleId === puzzleId) ?? null;
  },

  async startAttempt(sess, puzzleId, strict) {
    const s = load();
    const alias = player(s, sess);
    const prev = s.attempts.find((a) => a.alias === alias && a.puzzleId === puzzleId);
    if (prev) return { ...prev, strict: prev.strict ?? false };
    const a: LocalAttempt = {
      attemptId: crypto.randomUUID(),
      alias,
      puzzleId,
      startedAt: Date.now(),
      hintsUsed: 0,
      wrongSubmits: 0,
      solved: false,
      strict,
    };
    s.attempts.push(a);
    save(s);
    return a;
  },

  async useHint(sess, attemptId) {
    const s = load();
    const a = own(s, player(s, sess), attemptId);
    if (a?.strict) throw rejected('En modo estricto no hay ayudas.');
    if (a && !a.solved) a.hintsUsed++;
    save(s);
  },

  async saveProgress(sess, attemptId, board) {
    const s = load();
    const a = own(s, player(s, sess), attemptId);
    if (!a) throw rejected('Intento inexistente.');
    if (a.solved) throw rejected('Este caso ya está resuelto: el progreso no se modifica.');
    if (new TextEncoder().encode(JSON.stringify(board)).length > MAX_BOARD_BYTES)
      throw rejected('El progreso es demasiado grande para guardarlo.');
    a.board = board;
    a.boardUpdatedAt = Date.now();
    save(s);
    return a.boardUpdatedAt;
  },

  async submit(sess, attemptId, placements: Placement, killer, contentHash) {
    const s = load();
    const a = own(s, player(s, sess), attemptId);
    if (!a) throw rejected('Intento inexistente.');
    const p = puzzleById(a.puzzleId)!;
    if (contentHash && contentHash !== (await logicHash(p)))
      throw rejected('Este caso cambió desde que abriste la página. Recargá para jugar la versión actual.');
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
    a.score = score(p.difficulty, p.size, a.seconds, a.hintsUsed, a.wrongSubmits, a.strict);
    const prevBoard = (a.board ?? {}) as { marks?: string[] };
    a.board = { placements, marks: prevBoard.marks ?? [], notes: {} };
    a.boardUpdatedAt = Date.now();
    save(s);
    return { correct, wrongSubmits: a.wrongSubmits, score: a.score, seconds: a.seconds, killer: realKiller };
  },

  async solvedPuzzles(sess) {
    const s = load();
    const alias = player(s, sess);
    return s.attempts.filter((a) => a.alias === alias && a.solved).map((a) => a.puzzleId);
  },

  async puzzleMeta(puzzleId) {
    const p = puzzleById(puzzleId);
    return p ? { difficulty: p.difficulty, contentHash: await logicHash(p) } : null;
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
