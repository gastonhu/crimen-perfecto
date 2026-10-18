import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Puzzle } from '../src/engine';

export function findJson(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const full = join(dir, f);
    return statSync(full).isDirectory() ? findJson(full) : f.endsWith('.json') ? [full] : [];
  });
}

export const readPuzzle = (file: string): Puzzle => JSON.parse(readFileSync(file, 'utf8'));

export function loadPuzzles(dir = 'puzzles'): { file: string; puzzle: Puzzle }[] {
  return findJson(dir).map((file) => ({ file, puzzle: readPuzzle(file) }));
}
