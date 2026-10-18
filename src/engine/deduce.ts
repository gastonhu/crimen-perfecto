import { cellKey } from './board';
import { evalRelational, isRelational, unaryDomain } from './clues';
import { countSolutions } from './solver';
import type { Cell, Placement, Puzzle } from './types';

export type Domains = Record<string, Cell[]>;

export function initialDomains(p: Puzzle): Domains {
  return Object.fromEntries(p.people.map((x) => [x.id, unaryDomain(p, x)]));
}

/**
 * Propagación "humana": únicos desnudos/ocultos por fila y columna + consistencia de las pistas relativas.
 * Devuelve los dominios reducidos y cuántas rondas hicieron falta.
 */
export function propagate(p: Puzzle, start: Domains = initialDomains(p)): { domains: Domains; rounds: number } {
  const d: Domains = Object.fromEntries(Object.entries(start).map(([k, v]) => [k, [...v]]));
  const ids = p.people.map((x) => x.id);
  let rounds = 0;
  let changed = true;

  const restrict = (id: string, keep: (c: Cell) => boolean) => {
    const before = d[id].length;
    d[id] = d[id].filter(keep);
    if (d[id].length !== before) changed = true;
  };

  while (changed) {
    changed = false;
    rounds++;

    // Únicos desnudos: si alguien solo puede estar en una casilla, nadie más usa esa fila ni columna.
    for (const id of ids)
      if (d[id].length === 1) {
        const only = d[id][0];
        for (const o of ids) if (o !== id) restrict(o, (c) => c.r !== only.r && c.c !== only.c);
      }

    // Únicos ocultos: cada fila/columna tiene exactamente una persona.
    for (let i = 0; i < p.size; i++) {
      for (const axis of ['r', 'c'] as const) {
        const who = ids.filter((id) => d[id].some((c) => c[axis] === i));
        if (who.length === 1) restrict(who[0], (c) => c[axis] === i);
      }
    }

    // Pistas relativas: cada casilla candidata necesita algún soporte en la otra persona.
    for (const x of p.people)
      for (const rule of x.clue.rules.filter(isRelational)) {
        const other = rule[1] as string;
        restrict(x.id, (c) => d[other].some((o) => o.r !== c.r && o.c !== c.c && evalRelational(p, rule, c, o)));
        restrict(other, (o) => d[x.id].some((c) => o.r !== c.r && o.c !== c.c && evalRelational(p, rule, c, o)));
      }

    if (ids.some((id) => d[id].length === 0)) break;
  }
  return { domains: d, rounds };
}

const solvedBy = (d: Domains) => Object.values(d).every((v) => v.length === 1);

/**
 * Dificultad estimada 1–5: 1–3 si alcanza la propagación (según rondas), 4–5 si hace falta probar hipótesis.
 */
export function estimateDifficulty(p: Puzzle): { level: number; rounds: number; trials: number } {
  let { domains, rounds } = propagate(p);
  let trials = 0;
  while (!solvedBy(domains) && trials < 10) {
    trials++;
    // Prueba por contradicción: elimina candidatos que dejan el caso sin solución.
    const next: Domains = {};
    for (const [id, cells] of Object.entries(domains))
      next[id] = cells.filter((c) => countSolutions(p, 1, { ...domains, [id]: [c] }) > 0);
    const res = propagate(p, next);
    domains = res.domains;
    rounds += res.rounds;
  }
  const level = trials === 0 ? (rounds <= 3 ? 1 : rounds <= 5 ? 2 : 3) : trials === 1 ? 4 : 5;
  return { level, rounds, trials };
}

export type Hint =
  | { kind: 'wrong'; personId: string }
  | { kind: 'place'; personId: string; cells: Cell[] }
  | { kind: 'candidates'; personId: string; cells: Cell[] }
  | { kind: 'none' };

/** Siguiente ayuda para el jugador, sin regalar más de lo necesario. */
export function nextHint(p: Puzzle, solution: Placement, current: Partial<Placement>): Hint {
  const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
  const wrong = p.people.find((x) => current[x.id] && !same(current[x.id]!, solution[x.id]));
  if (wrong) return { kind: 'wrong', personId: wrong.id };

  const start = initialDomains(p);
  for (const x of p.people) if (current[x.id]) start[x.id] = [current[x.id]!];
  const { domains } = propagate(p, start);

  const pending = p.people.filter((x) => !current[x.id]);
  if (pending.length === 0) return { kind: 'none' };
  const target = pending.reduce((a, b) => (domains[b.id].length < domains[a.id].length ? b : a));
  const sol = solution[target.id];
  const cells = domains[target.id].some((c) => same(c, sol)) ? domains[target.id] : [sol];
  return { kind: cells.length === 1 ? 'place' : 'candidates', personId: target.id, cells };
}

export const keySet = (cells: Cell[]) => new Set(cells.map(cellKey));
