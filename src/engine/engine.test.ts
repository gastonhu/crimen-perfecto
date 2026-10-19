import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { countSolutions, describeClue, describeFact, estimateDifficulty, explainNext, killerOf, nextHint, solve, structuralErrors, violations } from '.';
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

describe('DSL ampliada', () => {
  const base = (over: Partial<Puzzle> = {}): Puzzle => ({
    id: 'x', theme: 'test', title: 'x', size: 3, difficulty: 1, story: '',
    rooms: ['AAA', 'BBB', 'BBB'],
    roomNames: { A: 'la cocina', B: 'el bar' },
    objects: ['C..', '...', '..B'],
    people: [
      { id: 'v', name: 'Vera', role: 'victim', avatar: '', gender: 'f', clue: { rules: [] } },
      { id: 'x', name: 'Xavi', role: 'suspect', avatar: '', gender: 'm', clue: { rules: [] } },
      { id: 'y', name: 'Yael', role: 'suspect', avatar: '', clue: { rules: [] } },
    ],
    ...over,
  });

  it('concuerda el género en los textos', () => {
    const p = base();
    expect(describeClue(p, [['alone']], p.people[0])).toBe('Estaba sola en su habitación.');
    expect(describeClue(p, [['alone']], p.people[1])).toBe('Estaba solo en su habitación.');
    expect(describeClue(p, [['alone']], p.people[2])).toBe('Estaba sin compañía en su habitación.');
    expect(describeClue(p, [['touching', 'v']], p.people[1])).toBe('Estaba pegado a Vera, en diagonal.');
  });

  it('describe hechos generales', () => {
    const p = base();
    expect(describeFact(p, ['roomCount', 'A', 0])).toBe('La cocina estaba vacía.');
    expect(describeFact(p, ['roomCount', 'B', 0])).toBe('El bar estaba vacío.');
    expect(describeFact(p, ['roomCount', 'B', 2])).toBe('En el bar había exactamente 2 personas.');
    expect(describeFact(p, ['objectCount', 'C', 1])).toBe('Exactamente una persona estaba en una silla.');
    expect(describeFact(p, ['objectCount', 'C', 2])).toBe('Exactamente 2 personas estaban en sillas.');
  });

  it('un hecho general puede definir la solución', () => {
    const p = base({ facts: [{ fact: ['roomCount', 'A', 0] }] });
    expect(solve(p, { limit: 50 }).length).toBe(0); // 3 personas no entran en 2 filas: el hecho lo hace imposible
    // "En la cocina había exactamente 1 persona" → el crimen (2 personas) fue en el bar.
    const q = base({ facts: [{ fact: ['roomCount', 'A', 1] }] });
    expect(solve(q, { limit: 50 }).length).toBeGreaterThan(0);
    for (const sol of solve(q, { limit: 50 })) {
      expect(Object.values(sol).filter((c) => c.r === 0)).toHaveLength(1);
      expect(sol.v.r).toBeGreaterThan(0);
    }
  });

  it('ventanas y puertas', () => {
    const p = base({ windows: ['A1N'], doors: ['B1S'], people: base().people.map((x) => (x.id === 'x' ? { ...x, clue: { rules: [['byWindow']] } } : x)) });
    expect(structuralErrors(p)).toEqual([]);
    expect(solve(p, { limit: 50 }).length).toBeGreaterThan(0);
    for (const sol of solve(p, { limit: 50 })) expect(sol.x).toEqual({ r: 0, c: 0 });
    expect(structuralErrors(base({ windows: ['B2N'] }))).toContain("la ventana 'B2N' no está en una pared exterior");
    expect(structuralErrors(base({ doors: ['A2E'] }))).toContain("la puerta 'A2E' no separa dos habitaciones");
  });

  it('regla del crimen en diagonal', () => {
    const p = base({ crime: 'touchingVictim', rooms: ['AAA', 'AAA', 'AAA'], roomNames: { A: 'la sala' } });
    expect(solve(p, { limit: 50 }).length).toBeGreaterThan(0);
    for (const sol of solve(p, { limit: 50 })) {
      const k = killerOf(p, sol);
      expect(k).not.toBeNull();
      expect(Math.abs(sol[k!].r - sol.v.r)).toBe(1);
      expect(Math.abs(sol[k!].c - sol.v.c)).toBe(1);
    }
  });
});

describe('esquema de archivos', () => {
  it('todos los casos publicados cumplen el esquema v2', async () => {
    const { schemaErrors } = await import('../../scripts/schema');
    const { loadPuzzles } = await import('../../scripts/lib');
    for (const { file, puzzle } of loadPuzzles()) expect(schemaErrors(puzzle), file).toEqual([]);
  });
});

describe('ayudas explicadas', () => {
  for (const f of ['hotel/hotel-01.json', 'tren/tren-01.json', 'datacenter/datacenter-01.json']) {
    it(`${f}: cada ayuda podada sigue llegando a la casilla correcta`, () => {
      const p = load(f);
      const [sol] = solve(p);
      let current: Record<string, { r: number; c: number }> = {};
      for (let k = 0; k < p.people.length; k++) {
        const h = explainNext(p, sol, current);
        expect(h.kind).toBe('deduction');
        if (h.kind !== 'deduction') return;
        expect(h.cell).toEqual(sol[h.personId]);
        current = { ...current, [h.personId]: h.cell };
      }
      expect(explainNext(p, sol, current).kind).toBe('none');
    });
  }
});
