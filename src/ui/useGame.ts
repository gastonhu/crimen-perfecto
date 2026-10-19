import { useCallback, useEffect, useRef, useState } from 'react';
import { cellKey, type Cell, type Puzzle } from '../engine';
import { isRetryable, withRetry, type BoardData } from '../api';
import { useConnection } from './ConnectionStatus';

export type Board = BoardData;

const EMPTY: Board = { placements: {}, marks: [], notes: {} };
const storageKey = (puzzleId: string, alias: string) => `crimen-perfecto:board:${alias}:${puzzleId}`;
/** Espera desde el último cambio antes de guardar en el servidor. */
export const SAVE_DELAY_MS = 2000;

/** Lo que se guarda en localStorage: el tablero y cuándo cambió (reloj local) y se sincronizó (reloj del servidor). */
interface Stored {
  board: Board;
  savedAt?: number;
  syncedAt?: number;
}

function loadStored(key: string): Stored {
  try {
    const { savedAt, syncedAt, ...b } = JSON.parse(localStorage.getItem(key) ?? '') as Board & Omit<Stored, 'board'>;
    return b && b.placements && Array.isArray(b.marks) ? { board: { ...b, notes: b.notes ?? {} }, savedAt, syncedAt } : { board: EMPTY };
  } catch {
    return { board: EMPTY };
  }
}

function writeStored(key: string, s: Stored) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...s.board, savedAt: s.savedAt, syncedAt: s.syncedAt }));
  } catch {
    /* sin almacenamiento: el progreso no se guarda en este dispositivo */
  }
}

/** Tablero que vino del servidor: solo personas del caso, casillas dentro del plano, sin repetidos. */
export function sanitizeBoard(raw: unknown, p: Pick<Puzzle, 'size' | 'people'>): Board | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<Record<keyof Board, unknown>>;
  const ids = new Set(p.people.map((x) => x.id));
  const inside = (r: unknown, c: unknown) =>
    Number.isInteger(r) && Number.isInteger(c) && (r as number) >= 0 && (c as number) >= 0 && (r as number) < p.size && (c as number) < p.size;
  const isCellKey = (k: unknown) => {
    const m = typeof k === 'string' ? /^(\d+),(\d+)$/.exec(k) : null;
    return !!m && inside(Number(m[1]), Number(m[2]));
  };
  const placements: Board['placements'] = {};
  if (b.placements && typeof b.placements === 'object')
    for (const [id, c] of Object.entries(b.placements as Record<string, unknown>)) {
      const cell = c as Partial<Cell> | null;
      if (ids.has(id) && cell && inside(cell.r, cell.c)) placements[id] = { r: cell.r!, c: cell.c! };
    }
  const marks = Array.isArray(b.marks) ? [...new Set(b.marks.filter(isCellKey) as string[])] : [];
  const notes: Board['notes'] = {};
  if (b.notes && typeof b.notes === 'object')
    for (const [k, v] of Object.entries(b.notes as Record<string, unknown>))
      if (isCellKey(k) && Array.isArray(v)) {
        const who = [...new Set(v.filter((id): id is string => typeof id === 'string' && ids.has(id)))];
        if (who.length) notes[k] = who;
      }
  return { placements, marks, notes };
}

export interface RemoteBoard {
  board: Board;
  /** Hora del servidor del último guardado (ms). */
  updatedAt: number;
}

/**
 * ¿Cuál tablero vale al abrir el caso, el de este dispositivo o el del servidor?
 * Si el servidor no tiene nada posterior a nuestra última sincronización, gana el local (puede tener cambios que no
 * llegaron a subir). Si no, el más reciente (relojes distintos: es una aproximación razonable).
 */
export function pickBoard(local: Omit<Stored, 'board'> | null, remote: Pick<RemoteBoard, 'updatedAt'> | null): 'local' | 'remote' {
  if (!remote) return 'local';
  if (!local || local.savedAt === undefined) return 'remote';
  if (local.syncedAt !== undefined && remote.updatedAt <= local.syncedAt) return 'local';
  return local.savedAt >= remote.updatedAt ? 'local' : 'remote';
}

/** Estado del guardado en el servidor. */
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'error';

/** Guardado remoto del tablero; null mientras no haya intento o si ya está resuelto. */
export interface Remote {
  save: (board: Board) => Promise<number>;
}

const withoutCell = (notes: Record<string, string[]>, k: string) => {
  const rest = { ...notes };
  delete rest[k];
  return rest;
};

/**
 * Estado del tablero con deshacer/rehacer y guardado automático por jugador y caso: en localStorage al instante y,
 * si hay `remote`, en el servidor ~2 s después del último cambio (con reintentos si se corta la conexión).
 */
export function useGame(puzzleId: string, alias: string, remote: Remote | null = null) {
  const key = storageKey(puzzleId, alias);
  // Historia e índice en un solo estado: las actualizaciones son atómicas aunque React las repita.
  // `rev` cuenta los cambios del jugador (no los tableros adoptados del servidor).
  const [state, setState] = useState(() => ({ history: [loadStored(key).board], index: 0, rev: 0 }));
  const { history, index } = state;
  const board = history[index];
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const meta = useRef<Omit<Stored, 'board'>>({});
  const boardRef = useRef(board);
  const remoteRef = useRef(remote);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastRev = useRef(0);

  useEffect(() => {
    const { savedAt, syncedAt } = loadStored(key);
    meta.current = { savedAt, syncedAt };
  }, [key]);
  useEffect(() => {
    boardRef.current = board;
    remoteRef.current = remote;
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const r = remoteRef.current;
    if (!r || !dirty.current || inFlight.current) return;
    inFlight.current = true;
    dirty.current = false;
    const snapshot = boardRef.current;
    setSaveState('saving');
    let offline = false;
    try {
      const at = await withRetry(() => r.save(snapshot), { attempts: 3, baseMs: 1500 });
      meta.current = { ...meta.current, syncedAt: at };
      writeStored(key, { board: boardRef.current, ...meta.current });
      setSaveState(dirty.current ? 'pending' : 'saved');
    } catch (e) {
      // Sin conexión: queda pendiente y se reintenta al volver la conexión o con el próximo cambio.
      offline = isRetryable(e);
      dirty.current = dirty.current || offline;
      setSaveState(offline ? 'offline' : 'error');
    } finally {
      inFlight.current = false;
    }
    // Hubo cambios mientras se guardaba: otra vuelta.
    if (dirty.current && !offline) timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [key]);

  // Cambio del jugador: se guarda local enseguida y se programa el guardado remoto.
  useEffect(() => {
    if (state.rev === lastRev.current) return;
    lastRev.current = state.rev;
    meta.current = { ...meta.current, savedAt: Date.now() };
    writeStored(key, { board, ...meta.current });
    if (!remoteRef.current) return;
    dirty.current = true;
    setSaveState((s) => (s === 'offline' ? s : 'pending'));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [key, state.rev, board, flush]);

  // Volvió la conexión: subimos lo pendiente.
  const connection = useConnection();
  useEffect(() => {
    if (connection === 'online' && dirty.current && !inFlight.current) void flush();
  }, [connection, flush]);

  // Al salir del caso o esconder la pestaña, se sube lo pendiente sin esperar.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  /** Al abrir el caso: si el tablero del servidor es más nuevo, reemplaza al local (sin volver a subirlo). */
  const adoptRemote = useCallback(
    (remoteBoard: RemoteBoard | null) => {
      if (!remoteBoard || pickBoard(loadStored(key), remoteBoard) === 'local') return;
      meta.current = { savedAt: remoteBoard.updatedAt, syncedAt: remoteBoard.updatedAt };
      writeStored(key, { board: remoteBoard.board, ...meta.current });
      setState((st) => ({ history: [remoteBoard.board], index: 0, rev: st.rev }));
    },
    [key],
  );

  const commit = useCallback((next: Board) => {
    setState((st) => ({ history: [...st.history.slice(0, st.index + 1), next], index: st.index + 1, rev: st.rev + 1 }));
  }, []);

  const place = (personId: string, cell: Cell) => {
    const k = cellKey(cell);
    const placements = { ...board.placements };
    const current = placements[personId];
    for (const [id, c] of Object.entries(placements)) if (c && cellKey(c) === k) delete placements[id];
    if (!current || cellKey(current) !== k) placements[personId] = cell;
    commit({ placements, marks: board.marks.filter((m) => m !== k), notes: withoutCell(board.notes, k) });
  };

  /** Mueve (o ubica) a alguien en una casilla, sin el "tocar de nuevo para quitar" de `place`. */
  const moveTo = (personId: string, cell: Cell) => {
    const current = board.placements[personId];
    if (current && cellKey(current) === cellKey(cell)) return;
    const k = cellKey(cell);
    const placements = { ...board.placements };
    for (const [id, c] of Object.entries(placements)) if (c && cellKey(c) === k) delete placements[id];
    placements[personId] = cell;
    commit({ placements, marks: board.marks.filter((m) => m !== k), notes: withoutCell(board.notes, k) });
  };

  const toggleNote = (cell: Cell, personId: string) => {
    const k = cellKey(cell);
    if (Object.values(board.placements).some((c) => c && cellKey(c) === k)) return;
    const here = board.notes[k] ?? [];
    const next = here.includes(personId) ? here.filter((id) => id !== personId) : [...here, personId];
    commit({ ...board, notes: { ...withoutCell(board.notes, k), ...(next.length ? { [k]: next } : {}) } });
  };

  const remove = (personId: string) => {
    const placements = { ...board.placements };
    delete placements[personId];
    commit({ ...board, placements });
  };

  const toggleMark = (cell: Cell) => {
    const k = cellKey(cell);
    if (Object.values(board.placements).some((c) => c && cellKey(c) === k)) return;
    commit({ ...board, marks: board.marks.includes(k) ? board.marks.filter((m) => m !== k) : [...board.marks, k] });
  };

  const clear = () => commit(EMPTY);

  return {
    board,
    place,
    moveTo,
    toggleNote,
    remove,
    toggleMark,
    clear,
    undo: () => setState((st) => (st.index > 0 ? { ...st, index: st.index - 1, rev: st.rev + 1 } : st)),
    redo: () => setState((st) => (st.index < st.history.length - 1 ? { ...st, index: st.index + 1, rev: st.rev + 1 } : st)),
    canUndo: index > 0,
    canRedo: index < history.length - 1,
    saveState,
    adoptRemote,
  };
}
