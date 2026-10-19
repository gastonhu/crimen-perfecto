// Generación de pistas: a partir de un plano y una solución elegida, busca pistas verdaderas hasta que la
// solución sea única. Lo usan el script `suggest` y (más adelante) el editor de casos.
import { isBlocked, isOnEdge, neighbors, objectAt, roomAt, roomIds, structuralErrors } from './board';
import { propagate } from './deduce';
import { countSolutions, killerOf, solve } from './solver';
import { OBJECTS, type ObjectCode, type Placement, type Puzzle, type Rule } from './types';

/** Generador pseudoaleatorio determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const shuffle = <T>(xs: T[], rand: () => number) =>
  xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Errores de un borrador: la solución propuesta tiene que ser válida y dejar un único culpable. */
export function draftErrors(p: Puzzle, solution: Placement): string[] {
  const errs = structuralErrors(p);
  const cells = Object.values(solution);
  if (p.people.some((x) => !solution[x.id])) errs.push('falta la solución de alguna persona');
  if (new Set(cells.map((c) => c.r)).size !== p.size || new Set(cells.map((c) => c.c)).size !== p.size)
    errs.push('la solución repite fila o columna');
  for (const x of p.people) if (solution[x.id] && isBlocked(p, solution[x.id])) errs.push(`${x.id} está sobre un mueble`);
  if (!errs.length && !killerOf(p, solution)) errs.push('la víctima no queda a solas con exactamente un sospechoso');
  if (!errs.length) {
    const victim = p.people.find((x) => x.role === 'victim')!;
    const vr = roomAt(p, solution[victim.id]);
    if (p.people.filter((x) => roomAt(p, solution[x.id]) === vr).length !== 2)
      errs.push('en la habitación de la víctima tiene que haber exactamente una persona más');
  }
  return errs;
}

export interface Candidate {
  rule: Rule;
  /** Qué tan "linda" es la pista para un humano (más alto = preferida). */
  interest: number;
}

/** Todas las pistas verdaderas para una persona según la solución. */
export function candidateRules(p: Puzzle, solution: Placement, id: string): Candidate[] {
  const c = solution[id];
  const rid = roomAt(p, c);
  const occ = p.people.filter((x) => roomAt(p, solution[x.id]) === rid).length - 1;
  const objectsInPlay = [...new Set(p.objects.join('').replace(/\./g, ''))] as Exclude<ObjectCode, '.'>[];
  const out: Candidate[] = [{ rule: ['inRoom', rid], interest: 3 }];
  for (const r of roomIds(p)) if (r !== rid) out.push({ rule: ['notInRoom', r], interest: 1 });
  const here = objectAt(p, c);
  if (here !== '.') out.push({ rule: ['onObject', here], interest: 4 });
  const adj = new Set(neighbors(p, c).map((n) => objectAt(p, n)));
  for (const o of objectsInPlay) {
    if (adj.has(o)) out.push({ rule: ['adjacentTo', o], interest: 4 });
    else if (OBJECTS[o]) out.push({ rule: ['notAdjacentTo', o], interest: 1 });
  }
  out.push({ rule: [isOnEdge(p, c) ? 'onEdge' : 'notOnEdge'], interest: 2 });
  out.push({ rule: ['row', c.r + 1], interest: 1 }, { rule: ['col', c.c + 1], interest: 1 });
  for (const o of p.people) {
    if (o.id === id) continue;
    const oc = solution[o.id];
    out.push({ rule: [roomAt(p, oc) === rid ? 'sameRoomAs' : 'notSameRoomAs', o.id], interest: 2 });
    out.push({ rule: [c.r < oc.r ? 'northOf' : 'southOf', o.id], interest: 2 });
    out.push({ rule: [c.c < oc.c ? 'westOf' : 'eastOf', o.id], interest: 2 });
  }
  out.push({ rule: occ === 0 ? ['alone'] : ['withExactly', occ], interest: 3 });
  return out;
}

export interface GenerateOptions {
  seed?: number;
  /** Quitar pistas redundantes (casos más difíciles). Por defecto true. */
  prune?: boolean;
  maxRulesPerPerson?: number;
  /** Se llama con cada pista agregada y la cantidad de soluciones que quedan. */
  onStep?: (personId: string, rule: Rule, solutions: number) => void;
}

const CAP = 300;

/**
 * Devuelve una copia del caso con pistas que hacen única la solución dada.
 * Lanza un Error si el borrador es inválido o si no encuentra pistas suficientes.
 */
export function generateClues(base: Puzzle, solution: Placement, opts: GenerateOptions = {}): Puzzle {
  const rand = rng(opts.seed ?? 1);
  const maxRules = opts.maxRulesPerPerson ?? 2;
  const p: Puzzle = { ...base, people: base.people.map((x) => ({ ...x, clue: { rules: [] } })) };
  const errs = draftErrors(p, solution);
  if (errs.length) throw new Error(errs.join('; '));

  const person = (id: string) => p.people.find((x) => x.id === id)!;
  const count = () => countSolutions(p, CAP);
  // Mientras hay muchas soluciones, el tamaño de los dominios propagados desempata.
  const spread = () => Object.values(propagate(p).domains).reduce((s, d) => s + d.length, 0);
  const candidates = new Map(p.people.map((x) => [x.id, candidateRules(p, solution, x.id)]));

  let current = count();
  let currentSpread = spread();
  while (current > 1) {
    let best: { id: string; rule: Rule; cost: number } | null = null;
    for (const x of shuffle(p.people, rand)) {
      if (x.clue.rules.length >= maxRules) continue;
      for (const { rule, interest } of candidates.get(x.id)!) {
        if (x.clue.rules.some((r) => r[0] === rule[0])) continue;
        x.clue.rules.push(rule);
        const n = count();
        const sp = n >= CAP ? spread() : 0;
        x.clue.rules.pop();
        const improves = n < current || (n >= CAP && sp < currentSpread);
        const cost = (n >= CAP ? CAP * 100 + sp * 10 : n * 100) - interest * 15 + (x.clue.rules.length ? 40 : 0);
        if (improves && (!best || cost < best.cost)) best = { id: x.id, rule, cost };
      }
    }
    if (!best) throw new Error(`no encontré pistas suficientes (quedan ${current >= CAP ? `≥${CAP}` : current} soluciones)`);
    person(best.id).clue.rules.push(best.rule);
    current = count();
    currentSpread = spread();
    opts.onStep?.(best.id, best.rule, current);
  }

  // Todos tienen al menos una pista (agregar verdades no rompe la unicidad).
  for (const x of p.people)
    if (!x.clue.rules.length) x.clue.rules.push([...candidates.get(x.id)!].sort((a, b) => b.interest - a.interest)[0].rule);

  if (opts.prune ?? true)
    for (const x of shuffle(p.people, rand))
      for (const rule of [...x.clue.rules]) {
        if (x.clue.rules.length === 1) break;
        x.clue.rules = x.clue.rules.filter((r) => r !== rule);
        if (count() !== 1) x.clue.rules.push(rule);
      }

  if (solve(p, { limit: 2 }).length !== 1) throw new Error('la poda rompió la unicidad');
  return p;
}

/** Plano aleatorio (habitaciones por regiones de Voronoi y muebles dispersos). Útil para tests y benchmarks. */
export function randomLayout(size: number, rooms: number, seed: number): Pick<Puzzle, 'rooms' | 'roomNames' | 'objects'> {
  const rand = rng(seed);
  const seeds = Array.from({ length: rooms }, () => [Math.floor(rand() * size), Math.floor(rand() * size)]);
  const letters = 'ABCDEFGH';
  const grid = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      let best = 0;
      seeds.forEach(([sr, sc], i) => {
        const d = Math.abs(sr - r) + Math.abs(sc - c);
        const bd = Math.abs(seeds[best][0] - r) + Math.abs(seeds[best][1] - c);
        if (d < bd) best = i;
      });
      return letters[best];
    }).join(''),
  );
  const codes = ['.', '.', '.', '.', '.', 'T', 'S', 'P', 'C', 'C', 'B', 'R'];
  const objects = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => codes[Math.floor(rand() * codes.length)]).join(''),
  );
  return {
    rooms: grid,
    roomNames: Object.fromEntries([...new Set(grid.join(''))].map((l) => [l, `la sala ${l}`])),
    objects,
  };
}

/** Busca una solución aleatoria válida para un plano (o null si no la encuentra en `tries` intentos). */
export function randomSolution(p: Puzzle, seed: number, tries = 500): Placement | null {
  const rand = rng(seed);
  for (let t = 0; t < tries; t++) {
    const rows = shuffle([...Array(p.size).keys()], rand);
    const cols = shuffle([...Array(p.size).keys()], rand);
    const sol: Placement = {};
    p.people.forEach((x, i) => (sol[x.id] = { r: rows[i], c: cols[i] }));
    if (draftErrors(p, sol).length === 0) return sol;
  }
  return null;
}
