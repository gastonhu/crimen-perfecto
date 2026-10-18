import { OBJECTS, type Cell, type ObjectCode, type Puzzle } from './types';

export const cellKey = (c: Cell) => `${c.r},${c.c}`;

export function roomAt(p: Puzzle, c: Cell): string {
  return p.rooms[c.r][c.c];
}

export function objectAt(p: Puzzle, c: Cell): ObjectCode {
  return (p.objects[c.r]?.[c.c] ?? '.') as ObjectCode;
}

export function isBlocked(p: Puzzle, c: Cell): boolean {
  const o = objectAt(p, c);
  return o !== '.' && OBJECTS[o].blocking;
}

export function inBounds(p: Puzzle, c: Cell): boolean {
  return c.r >= 0 && c.c >= 0 && c.r < p.size && c.c < p.size;
}

/** Vecinos ortogonales ("junto a"). */
export function neighbors(p: Puzzle, c: Cell): Cell[] {
  return [
    { r: c.r - 1, c: c.c },
    { r: c.r + 1, c: c.c },
    { r: c.r, c: c.c - 1 },
    { r: c.r, c: c.c + 1 },
  ].filter((n) => inBounds(p, n));
}

export function isOnEdge(p: Puzzle, c: Cell): boolean {
  return c.r === 0 || c.c === 0 || c.r === p.size - 1 || c.c === p.size - 1;
}

export function allCells(p: Puzzle): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) out.push({ r, c });
  return out;
}

export function roomIds(p: Puzzle): string[] {
  return [...new Set(p.rooms.join(''))];
}

/** Valida la forma del puzzle. Devuelve la lista de errores (vacía si está bien). */
export function structuralErrors(p: Puzzle): string[] {
  const errs: string[] = [];
  const n = p.size;
  if (p.rooms.length !== n || p.rooms.some((row) => row.length !== n)) errs.push(`rooms debe ser ${n}x${n}`);
  if (p.objects.length !== n || p.objects.some((row) => row.length !== n)) errs.push(`objects debe ser ${n}x${n}`);
  for (const id of roomIds(p)) if (!p.roomNames[id]) errs.push(`habitación '${id}' sin nombre`);
  for (const row of p.objects)
    for (const ch of row) if (ch !== '.' && !(ch in OBJECTS)) errs.push(`objeto desconocido '${ch}'`);
  if (p.people.length !== n) errs.push(`hacen falta ${n} personas (hay ${p.people.length})`);
  if (p.people.filter((x) => x.role === 'victim').length !== 1) errs.push('debe haber exactamente una víctima');
  const ids = new Set(p.people.map((x) => x.id));
  if (ids.size !== p.people.length) errs.push('ids de personas repetidos');
  for (const person of p.people)
    for (const rule of person.clue.rules) {
      const [kind, arg] = rule;
      if (['sameRoomAs', 'notSameRoomAs', 'northOf', 'southOf', 'eastOf', 'westOf'].includes(kind) && !ids.has(arg as string))
        errs.push(`${person.id}: referencia a persona inexistente '${arg}'`);
      if ((kind === 'inRoom' || kind === 'notInRoom') && !p.roomNames[arg as string])
        errs.push(`${person.id}: habitación inexistente '${arg}'`);
      if ((kind === 'row' || kind === 'col') && ((arg as number) < 1 || (arg as number) > n))
        errs.push(`${person.id}: ${kind} fuera de rango`);
    }
  return errs;
}
