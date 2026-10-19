import { useCallback, useEffect, useState } from 'react';
import { cellKey, type Cell, type Placement } from '../engine';

export interface Board {
  placements: Partial<Placement>;
  marks: string[];
  /** Notas: ids de personas candidatas por casilla ("r,c"). */
  notes: Record<string, string[]>;
}

const EMPTY: Board = { placements: {}, marks: [], notes: {} };
const storageKey = (puzzleId: string, alias: string) => `crimen-perfecto:board:${alias}:${puzzleId}`;

function loadBoard(key: string): Board {
  try {
    const b = JSON.parse(localStorage.getItem(key) ?? '') as Board;
    return b && b.placements && Array.isArray(b.marks) ? { ...b, notes: b.notes ?? {} } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const withoutCell = (notes: Record<string, string[]>, k: string) => {
  const rest = { ...notes };
  delete rest[k];
  return rest;
};

/** Estado del tablero con deshacer/rehacer y guardado automático por jugador y caso. */
export function useGame(puzzleId: string, alias: string) {
  const key = storageKey(puzzleId, alias);
  // Historia e índice en un solo estado: las actualizaciones son atómicas aunque React las repita.
  const [state, setState] = useState<{ history: Board[]; index: number }>(() => ({ history: [loadBoard(key)], index: 0 }));
  const { history, index } = state;
  const board = history[index];

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(board));
    } catch {
      /* sin almacenamiento: el progreso no se guarda */
    }
  }, [key, board]);

  const commit = useCallback((next: Board) => {
    setState((st) => ({ history: [...st.history.slice(0, st.index + 1), next], index: st.index + 1 }));
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
    undo: () => setState((st) => ({ ...st, index: Math.max(0, st.index - 1) })),
    redo: () => setState((st) => ({ ...st, index: Math.min(st.history.length - 1, st.index + 1) })),
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}
