import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { countSolutions, describeClue, estimateDifficulty, killerOf, nextHint, solve, structuralErrors, violations } from '.';
import type { Puzzle } from './types';

const load = (f: string): Puzzle => JSON.parse(readFileSync(new URL(`../../puzzles/${f}`, import.meta.url), 'utf8'));

// 3x3 mínimo: A arriba, B abajo; la víctima en B con un solo sospechoso.
const tiny = (rules: Record<string, Puzzle['people'][number]['clue']['rules']>): Puzzle => ({
  id: 't',
  theme: 'test',
  title: 't',
  size: 3,
  difficulty: 1,
  story: '',
  rooms: ['AAA', 'BBB', 'BBB'],
  roomNames: { A: 'la sala', B: 'el patio' },
  objects: ['...', '...', '...'],
  people: [
    { id: 'v', name: 'V', role: 'victim', avatar: '', clue: { rules: rules.v ?? [] } },
    { id: 'x', name: 'X', role: 'suspect', avatar: '', clue: { rules: rules.x ?? [] } },
    { id: 'y', name: 'Y', role: 'suspect', avatar: '', clue: { rules: rules.y ?? [] } },
  ],
});

describe('solver', () => {
  it('detecta caso sin solución', () => {
    expect(countSolutions(tiny({ v: [['inRoom', 'A']], x: [['inRoom', 'A']] }))).toBe(0);
  });

  it('detecta varias soluciones', () => {
    expect(countSolutions(tiny({}))).toBe(2);
  });

  it('encuentra la solución única y el culpable', () => {
    const p = tiny({ v: [['row', 2], ['col', 1]], x: [['inRoom', 'A'], ['col', 2]] });
    const sols = solve(p);
    expect(sols).toHaveLength(1);
    expect(sols[0].y).toEqual({ r: 2, c: 2 });
    expect(killerOf(p, sols[0])).toBe('y');
  });

  it('respeta muebles bloqueantes', () => {
    const p = { ...tiny({ v: [['row', 2], ['col', 1]], x: [['inRoom', 'A']] }), objects: ['.T.', '...', '...'] };
    const sols = solve(p);
    expect(sols).toHaveLength(1);
    expect(sols[0].x).toEqual({ r: 0, c: 2 });
  });

  it('marca violaciones de fila/columna y de pista', () => {
    const p = tiny({ x: [['inRoom', 'A']] });
    expect(violations(p, { v: { r: 1, c: 1 }, x: { r: 1, c: 0 } }).sort()).toEqual(['v', 'x']);
  });
});

describe('casos publicados', () => {
  for (const f of ['hotel/hotel-01.json', 'tren/tren-01.json', 'datacenter/datacenter-01.json']) {
    it(`${f} es válido y único`, () => {
      const p = load(f);
      expect(structuralErrors(p)).toEqual([]);
      const sols = solve(p);
      expect(sols).toHaveLength(1);
      expect(killerOf(p, sols[0])).not.toBeNull();
      expect(estimateDifficulty(p).level).toBeGreaterThanOrEqual(1);
    });
  }

  it('la ayuda señala primero un error y luego candidatos', () => {
    const p = load('hotel/hotel-01.json');
    const [sol] = solve(p);
    const wrongCell = { r: (sol.ana.r + 1) % p.size, c: sol.ana.c };
    expect(nextHint(p, sol, { ana: wrongCell })).toEqual({ kind: 'wrong', personId: 'ana' });
    const h = nextHint(p, sol, {});
    expect(h.kind === 'place' || h.kind === 'candidates').toBe(true);
  });
});

describe('texto', () => {
  it('une reglas en una frase', () => {
    const p = load('hotel/hotel-01.json');
    expect(describeClue(p, [['inRoom', 'B'], ['adjacentTo', 'P']])).toBe('Estaba en el bar y junto a una planta.');
  });
});
