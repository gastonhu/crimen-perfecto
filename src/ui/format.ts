import type { Puzzle } from '../engine';

export const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function shareText(p: Puzzle, seconds: number, hints: number, wrong: number): string {
  return [
    `🔎 Crimen Perfecto · ${p.title}`,
    `⏱ ${formatTime(seconds)}  💡 ${hints}  ✗ ${wrong}`,
    '🟩'.repeat(Math.max(1, 5 - hints - wrong)) + '🟥'.repeat(Math.min(5, hints + wrong)),
    location.href.split('#')[0],
  ].join('\n');
}
