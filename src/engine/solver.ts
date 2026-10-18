import { roomAt } from './board';
import { evalRelational, evalUnary, isRelational, isRoomCount, isUnary, roomCompanions, unaryDomain } from './clues';
import type { Cell, Placement, Puzzle } from './types';

export interface SolveOptions {
  /** Cortar al encontrar esta cantidad de soluciones (2 alcanza para saber si es única). */
  limit?: number;
  /** Dominios iniciales por persona (por defecto, los de sus reglas unarias). */
  domains?: Record<string, Cell[]>;
}

interface RelConstraint {
  a: number;
  b: number;
  rule: Parameters<typeof evalRelational>[1];
}

/**
 * Backtracking: ubica a cada persona en una casilla distinta de fila y columna, respetando las pistas y la regla
 * del crimen (en la habitación de la víctima hay exactamente una persona más: el asesino).
 */
export function solve(p: Puzzle, opts: SolveOptions = {}): Placement[] {
  const limit = opts.limit ?? 2;
  const people = p.people;
  const n = people.length;
  const idx = new Map(people.map((x, i) => [x.id, i]));
  const victim = people.findIndex((x) => x.role === 'victim');

  const domains = people.map((x) => opts.domains?.[x.id] ?? unaryDomain(p, x));
  if (domains.some((d) => d.length === 0)) return [];

  const rel: RelConstraint[] = [];
  people.forEach((x, a) =>
    x.clue.rules.filter(isRelational).forEach((rule) => rel.push({ a, b: idx.get(rule[1] as string)!, rule })),
  );
  const relOf: RelConstraint[][] = people.map((_, i) => rel.filter((k) => k.a === i || k.b === i));
  const companions: (number | null)[] = people.map((x) => {
    const r = x.clue.rules.find(isRoomCount);
    return r ? roomCompanions(r) : null;
  });

  const order = people.map((_, i) => i).sort((a, b) => domains[a].length - domains[b].length);
  const pos: (Cell | null)[] = new Array(n).fill(null);
  const room: (string | null)[] = new Array(n).fill(null);
  const occ = new Map<string, number>();
  let usedRows = 0;
  let usedCols = 0;
  const results: Placement[] = [];

  const capacityOk = (final: boolean) => {
    for (let i = 0; i < n; i++) {
      if (room[i] === null) continue;
      const others = (occ.get(room[i]!) ?? 0) - 1;
      const k = i === victim ? 1 : companions[i];
      if (k === null) continue;
      if (others > k || (final && others !== k)) return false;
    }
    return true;
  };

  const step = (depth: number): boolean => {
    if (depth === n) {
      if (!capacityOk(true)) return false;
      const sol: Placement = {};
      people.forEach((x, i) => (sol[x.id] = pos[i]!));
      results.push(sol);
      return results.length >= limit;
    }
    const i = order[depth];
    for (const cell of domains[i]) {
      if (usedRows & (1 << cell.r) || usedCols & (1 << cell.c)) continue;
      pos[i] = cell;
      const rid = roomAt(p, cell);
      room[i] = rid;
      occ.set(rid, (occ.get(rid) ?? 0) + 1);
      usedRows |= 1 << cell.r;
      usedCols |= 1 << cell.c;

      const ok =
        relOf[i].every((k) => !pos[k.a] || !pos[k.b] || evalRelational(p, k.rule, pos[k.a]!, pos[k.b]!)) &&
        capacityOk(false);
      if (ok && step(depth + 1)) return true;

      usedRows &= ~(1 << cell.r);
      usedCols &= ~(1 << cell.c);
      occ.set(rid, occ.get(rid)! - 1);
      room[i] = null;
      pos[i] = null;
    }
    return false;
  };

  step(0);
  return results;
}

export function countSolutions(p: Puzzle, limit = 2, domains?: Record<string, Cell[]>): number {
  return solve(p, { limit, domains }).length;
}

/** El asesino: el sospechoso que está en la misma habitación que la víctima. */
export function killerOf(p: Puzzle, sol: Placement): string | null {
  const victim = p.people.find((x) => x.role === 'victim')!;
  const vr = roomAt(p, sol[victim.id]);
  const inRoom = p.people.filter((x) => x.role === 'suspect' && sol[x.id] && roomAt(p, sol[x.id]) === vr);
  return inRoom.length === 1 ? inRoom[0].id : null;
}

/** Verifica una ubicación completa contra todas las reglas. Devuelve los ids de quienes incumplen algo. */
export function violations(p: Puzzle, sol: Placement): string[] {
  const bad = new Set<string>();
  const rows = new Map<number, string[]>();
  const cols = new Map<number, string[]>();
  const occ = new Map<string, number>();
  for (const x of p.people) {
    const c = sol[x.id];
    if (!c) continue;
    rows.set(c.r, [...(rows.get(c.r) ?? []), x.id]);
    cols.set(c.c, [...(cols.get(c.c) ?? []), x.id]);
    occ.set(roomAt(p, c), (occ.get(roomAt(p, c)) ?? 0) + 1);
  }
  const complete = p.people.every((x) => sol[x.id]);
  for (const group of [...rows.values(), ...cols.values()]) if (group.length > 1) group.forEach((id) => bad.add(id));
  for (const x of p.people) {
    const c = sol[x.id];
    if (!c) continue;
    for (const rule of x.clue.rules) {
      if (isUnary(rule) && !evalUnary(p, rule, c)) bad.add(x.id);
      if (isRelational(rule)) {
        const o = sol[rule[1] as string];
        if (o && !evalRelational(p, rule, c, o)) bad.add(x.id);
      }
      if (isRoomCount(rule)) {
        const others = occ.get(roomAt(p, c))! - 1;
        if (others > roomCompanions(rule) || (complete && others !== roomCompanions(rule))) bad.add(x.id);
      }
    }
  }
  return [...bad];
}
