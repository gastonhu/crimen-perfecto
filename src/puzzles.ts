// Casos jugables. Arranca con los del bundle (puzzles/**.json) y, con servidor, los reemplaza por los
// publicados en la base (vista cp_public_puzzles): así un caso publicado desde el editor aparece sin deploy.
import { useSyncExternalStore } from 'react';
import type { Puzzle } from './engine';

const modules = import.meta.glob<Puzzle>('../puzzles/**/*.json', { eager: true, import: 'default' });

/** Temas conocidos. `icon` es el id de un símbolo del sprite (design/furniture-icons.svg). */
export const THEMES: Record<string, { name: string; icon: string }> = {
  hotel: { name: 'Hotel en tormenta', icon: 'theme-hotel' },
  tren: { name: 'Tren nocturno', icon: 'theme-tren' },
  estancia: { name: 'Estancia tucumana', icon: 'theme-estancia' },
  datacenter: { name: 'Datacenter hackeado', icon: 'theme-datacenter' },
  cozy: { name: 'Misterios acogedores', icon: 'theme-cozy' },
};

/** Nombre e ícono de un tema, también para temas nuevos creados desde el editor. */
export function themeInfo(theme: string): { name: string; icon: string } {
  if (THEMES[theme]) return THEMES[theme];
  const name = theme.replace(/-/g, ' ');
  return { name: name.charAt(0).toUpperCase() + name.slice(1), icon: 'theme-other' };
}

export function sortPuzzles(list: Puzzle[]): Puzzle[] {
  const order = (t: string) => (THEMES[t] ? Object.keys(THEMES).indexOf(t) : Object.keys(THEMES).length);
  return [...list].sort(
    (a, b) => order(a.theme) - order(b.theme) || a.theme.localeCompare(b.theme) || a.size - b.size || a.id.localeCompare(b.id),
  );
}

/** Casos que vienen en el bundle (respaldo sin servidor y semilla del modo local). */
export const BUNDLED: Puzzle[] = sortPuzzles(Object.values(modules));
/** @deprecated usar `usePuzzles()`: con servidor la lista real viene de la base. */
export const PUZZLES = BUNDLED;

export interface PuzzleList {
  list: Puzzle[];
  /** Todavía se está pidiendo la lista al servidor. */
  loading: boolean;
  /** No se pudo traer la lista del servidor (se muestran los del bundle). */
  error: string | null;
}

let state: PuzzleList = { list: BUNDLED, loading: false, error: null };
const listeners = new Set<() => void>();
const set = (next: PuzzleList) => {
  state = next;
  listeners.forEach((l) => l());
};

/**
 * Pide la lista a `fetch` (el backend). Si devuelve null (modo local sin lista propia) se quedan los del
 * bundle; si falla, también, pero con el error a mano para avisar.
 */
export async function loadPuzzles(fetch: () => Promise<Puzzle[] | null>): Promise<void> {
  set({ ...state, loading: true, error: null });
  try {
    const list = await fetch();
    set({ list: list ? sortPuzzles(list) : BUNDLED, loading: false, error: null });
  } catch (e) {
    set({ list: state.list, loading: false, error: (e as Error).message });
  }
}

export function usePuzzles(): PuzzleList {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const puzzleById = (id: string) => state.list.find((p) => p.id === id);
