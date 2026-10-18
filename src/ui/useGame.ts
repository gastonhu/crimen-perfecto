import { useCallback, useEffect, useState } from 'react';
import { cellKey, type Cell, type Placement } from '../engine';

export interface Board {
  placements: Partial<Placement>;
  marks: string[];
}

const EMPTY: Board = { placements: {}, marks: [] };
const storageKey = (puzzleId: string, alias: string) => `crimen-perfecto:board:${alias}:${puzzleId}`;

function loadBoard(key: string): Board {
  try {
    const b = JSON.parse(localStorage.getItem(key) ?? '') as Board;
    return b && b.placements && Array.isArray(b.marks) ? b : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Estado del tablero con deshacer/rehacer y guardado automático por jugador y caso. */
export function useGame(puzzleId: string, alias: string) {
  const key = storageKey(puzzleId, alias);
  const [history, setHistory] = useState<Board[]>(() => [loadBoard(key)]);
  const [index, setIndex] = useState(0);
  const board = history[index];

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(board));
    } catch {
      /* sin almacenamiento: el progreso no se guarda */
    }
  }, [key, board]);

  const commit = useCallback(
    (next: Board) => {
      setHistory((h) => [...h.slice(0, index + 1), next]);
      setIndex((i) => i + 1);
    },
    [index],
  );

  const place = (personId: string, cell: Cell) => {
    const k = cellKey(cell);
    const placements = { ...board.placements };
    const current = placements[personId];
    for (const [id, c] of Object.entries(placements)) if (c && cellKey(c) === k) delete placements[id];
    if (!current || cellKey(current) !== k) placements[personId] = cell;
    commit({ placements, marks: board.marks.filter((m) => m !== k) });
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
    remove,
    toggleMark,
    clear,
    undo: () => setIndex((i) => Math.max(0, i - 1)),
    redo: () => setIndex((i) => Math.min(history.length - 1, i + 1)),
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}
