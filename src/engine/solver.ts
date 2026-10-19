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
  // Cuántas otras personas exige cada pista de compañía (puede haber varias por persona).
  const companions: number[][] = people.map((x, i) => [
    ...(i === victim ? [1] : []), // la víctima comparte con exactamente uno: el asesino
    ...x.clue.rules.filter(isRoomCount).map(roomCompanions),
  ]);

  const pos: (Cell | null)[] = new Array(n).fill(null);
  const room: (string | null)[] = new Array(n).fill(null);
  const occ = new Map<string, number>();
  const full = (1 << n) - 1;
  let usedRows = 0;
  let usedCols = 0;
  const results: Placement[] = [];

  const capacityOk = (final: boolean) => {
    for (let i = 0; i < n; i++) {
      if (room[i] === null) continue;
      const others = (occ.get(room[i]!) ?? 0) - 1;
      for (const k of companions[i]) if (others > k || (final && others !== k)) return false;
    }
    return true;
  };

  /** Casillas todavía posibles para i: fila y columna libres y compatibles con las personas ya ubicadas. */
  const available = (i: number): Cell[] =>
    domains[i].filter(
      (cell) =>
        !(usedRows & (1 << cell.r)) &&
        !(usedCols & (1 << cell.c)) &&
        relOf[i].every((k) => {
          const other = k.a === i ? k.b : k.a;
          if (!pos[other]) return true;
          return k.a === i ? evalRelational(p, k.rule, cell, pos[other]!) : evalRelational(p, k.rule, pos[other]!, cell);
        }),
    );

  const step = (placed: number): boolean => {
    if (placed === n) {
      if (!capacityOk(true)) return false;
      const sol: Placement = {};
      people.forEach((x, i) => (sol[x.id] = pos[i]!));
      results.push(sol);
      return results.length >= limit;
    }
    // Elegir a la persona más restringida y verificar que todos sigan teniendo lugar (chequeo hacia adelante).
    let best = -1;
    let bestCells: Cell[] = [];
    let rowCover = usedRows;
    let colCover = usedCols;
    const reach = new Map<string, number>(); // cuántas personas sin ubicar todavía pueden llegar a cada habitación
    for (let i = 0; i < n; i++) {
      if (pos[i]) continue;
      const cells = available(i);
      if (cells.length === 0) return false;
      for (const rid of new Set(cells.map((c) => roomAt(p, c)))) reach.set(rid, (reach.get(rid) ?? 0) + 1);
      for (const c of cells) {
        rowCover |= 1 << c.r;
        colCover |= 1 << c.c;
      }
      if (best < 0 || cells.length < bestCells.length) {
        best = i;
        bestCells = cells;
      }
    }
    // Cada fila y columna vacía tiene que poder ocuparla alguien.
    if (rowCover !== full || colCover !== full) return false;
    // Las habitaciones que exigen compañía tienen que poder completarse con quienes faltan ubicar.
    for (let j = 0; j < n; j++) {
      if (room[j] === null) continue;
      const others = occ.get(room[j]!)! - 1;
      for (const k of companions[j]) if (others + (reach.get(room[j]!) ?? 0) < k) return false;
    }

    const i = best;
    for (const cell of bestCells) {
      pos[i] = cell;
      const rid = roomAt(p, cell);
      room[i] = rid;
      occ.set(rid, (occ.get(rid) ?? 0) + 1);
      usedRows |= 1 << cell.r;
      usedCols |= 1 << cell.c;

      if (capacityOk(false) && step(placed + 1)) return true;

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
