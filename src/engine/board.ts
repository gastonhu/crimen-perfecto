import { OBJECTS, type Cell, type ObjectCode, type Puzzle, type Side } from './types';

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

const SIDES: Record<Side, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], O: [0, -1] };
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'O', O: 'E' };

/** Interpreta "B1N" → casilla B1, lado norte. Devuelve null si el formato no es válido. */
export function parseSideRef(ref: string): { cell: Cell; side: Side } | null {
  const m = /^([A-I])([1-9])([NSEO])$/.exec(ref);
  if (!m) return null;
  return { cell: { r: Number(m[2]) - 1, c: m[1].charCodeAt(0) - 65 }, side: m[3] as Side };
}

const sideCache = new WeakMap<Puzzle, { windows: Set<string>; doors: Set<string> }>();

/** Lados con ventana o puerta de cada casilla (una puerta cuenta para las dos casillas que separa). */
function sideSets(p: Puzzle) {
  let cached = sideCache.get(p);
  if (cached) return cached;
  const build = (refs: string[] = [], both: boolean) => {
    const set = new Set<string>();
    for (const ref of refs) {
      const x = parseSideRef(ref);
      if (!x) continue;
      set.add(`${x.cell.r},${x.cell.c},${x.side}`);
      if (both) {
        const [dr, dc] = SIDES[x.side];
        set.add(`${x.cell.r + dr},${x.cell.c + dc},${OPPOSITE[x.side]}`);
      }
    }
    return set;
  };
  cached = { windows: build(p.windows, false), doors: build(p.doors, true) };
  sideCache.set(p, cached);
  return cached;
}

export function sidesWith(p: Puzzle, c: Cell, kind: 'windows' | 'doors'): Side[] {
  const set = sideSets(p)[kind];
  return (['N', 'S', 'E', 'O'] as Side[]).filter((side) => set.has(`${c.r},${c.c},${side}`));
}

export const hasWindow = (p: Puzzle, c: Cell) => sidesWith(p, c, 'windows').length > 0;
export const hasDoor = (p: Puzzle, c: Cell) => sidesWith(p, c, 'doors').length > 0;

/** Las 4 casillas en diagonal (dentro del plano). */
export function diagonals(p: Puzzle, c: Cell): Cell[] {
  return [
    { r: c.r - 1, c: c.c - 1 },
    { r: c.r - 1, c: c.c + 1 },
    { r: c.r + 1, c: c.c - 1 },
    { r: c.r + 1, c: c.c + 1 },
  ].filter((n) => inBounds(p, n));
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
      if ((kind === 'touching' || kind === 'notTouching') && !ids.has(arg as string))
        errs.push(`${person.id}: referencia a persona inexistente '${arg}'`);
    }
  for (const ref of p.windows ?? []) {
    const x = parseSideRef(ref);
    if (!x || !inBounds(p, x.cell)) errs.push(`ventana inválida '${ref}'`);
    else {
      const [dr, dc] = SIDES[x.side];
      if (inBounds(p, { r: x.cell.r + dr, c: x.cell.c + dc })) errs.push(`la ventana '${ref}' no está en una pared exterior`);
    }
  }
  for (const ref of p.doors ?? []) {
    const x = parseSideRef(ref);
    if (!x || !inBounds(p, x.cell)) errs.push(`puerta inválida '${ref}'`);
    else {
      const [dr, dc] = SIDES[x.side];
      const other = { r: x.cell.r + dr, c: x.cell.c + dc };
      if (!inBounds(p, other) || roomAt(p, other) === roomAt(p, x.cell)) errs.push(`la puerta '${ref}' no separa dos habitaciones`);
    }
  }
  for (const { fact } of p.facts ?? []) {
    if (fact[0] === 'roomCount' && !p.roomNames[fact[1]]) errs.push(`hecho con habitación inexistente '${fact[1]}'`);
    if (fact[0] === 'objectCount' && !(fact[1] in OBJECTS)) errs.push(`hecho con mueble inexistente '${fact[1]}'`);
    if (fact[0] === 'objectCount' && fact[1] in OBJECTS && OBJECTS[fact[1] as Exclude<ObjectCode, '.'>].blocking)
      errs.push(`'${fact[1]}' bloquea la casilla: nadie puede estar encima`);
    if (fact[2] < 0 || fact[2] > n) errs.push(`hecho con cantidad fuera de rango (${fact[2]})`);
  }
  if (p.crime && !['aloneWithVictim', 'touchingVictim'].includes(p.crime)) errs.push(`regla del crimen desconocida '${p.crime}'`);
  return errs;
}

/** Parte del caso que define la lógica (sin textos): si cambia, la solución publicada deja de valer. */
export function logicFingerprint(p: Puzzle): string {
  return JSON.stringify({
    size: p.size,
    rooms: p.rooms,
    objects: p.objects,
    windows: [...(p.windows ?? [])].sort(),
    doors: [...(p.doors ?? [])].sort(),
    people: p.people.map((x) => [x.id, x.role, x.clue.rules]),
    facts: (p.facts ?? []).map((f) => f.fact),
    crime: p.crime ?? 'aloneWithVictim',
  });
}

/** SHA-256 (hex) de la lógica del caso. Funciona en el navegador y en Node. */
export async function logicHash(p: Puzzle): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(logicFingerprint(p)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
