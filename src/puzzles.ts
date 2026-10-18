import type { Puzzle } from './engine';

const modules = import.meta.glob<Puzzle>('../puzzles/**/*.json', { eager: true, import: 'default' });

export const THEMES: Record<string, { name: string; icon: string }> = {
  hotel: { name: 'Hotel en tormenta', icon: '🏨' },
  tren: { name: 'Tren nocturno', icon: '🚂' },
  estancia: { name: 'Estancia tucumana', icon: '🐎' },
  datacenter: { name: 'Datacenter hackeado', icon: '💾' },
};

export const PUZZLES: Puzzle[] = Object.values(modules).sort(
  (a, b) => Object.keys(THEMES).indexOf(a.theme) - Object.keys(THEMES).indexOf(b.theme) || a.size - b.size || a.id.localeCompare(b.id),
);

export const puzzleById = (id: string) => PUZZLES.find((p) => p.id === id);
