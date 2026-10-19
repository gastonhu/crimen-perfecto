// Borradores del editor: mismo formato que drafts/*.json (un Puzzle con `solution` 1-based) y las conversiones
// a caso publicado. Todo puro: lo usan la UI, el worker y los tests.
import {
  OBJECTS,
  inBounds,
  parseSideRef,
  roomIds,
  solve,
  structuralErrors,
  type Cell,
  type Fact,
  type ObjectCode,
  type Person,
  type Placement,
  type Puzzle,
  type Rule,
  type Side,
} from '../engine';

/** Solución como en drafts/*.json: { id: [fila, columna] } 1-based. */
export type RawSolution = Record<string, [number, number]>;

export interface DraftFile extends Puzzle {
  solution: RawSolution;
}

export const MIN_SIZE = 3;
export const MAX_SIZE = 9;
export const ROOM_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const NAMES: [string, string, 'f' | 'm'][] = [
  ['Don Ruiz', '🎩', 'm'],
  ['Ana', '🛎️', 'f'],
  ['Bruno', '🍸', 'm'],
  ['Clara', '📷', 'f'],
  ['Darío', '🎸', 'm'],
  ['Elena', '🧶', 'f'],
  ['Fermín', '🧳', 'm'],
  ['Gala', '🌂', 'f'],
  ['Hugo', '🎻', 'm'],
  ['Inés', '📚', 'f'],
  ['Julián', '🧥', 'm'],
];

/** Identificador de persona o de caso a partir de un nombre: "Don Ruiz" → "don-ruiz". */
export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'persona'
  );
}

const uniqueId = (base: string, taken: Set<string>) => {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
};

export function newPerson(people: Person[], role: Person['role'] = 'suspect'): Person {
  const used = new Set(people.map((x) => x.name));
  const [name, avatar, gender] = NAMES.find(([n]) => !used.has(n) && (role === 'victim') === (n === 'Don Ruiz')) ??
    NAMES.find(([n]) => !used.has(n)) ?? [`Persona ${people.length + 1}`, '🙂', undefined];
  const id = uniqueId(slug(name), new Set(people.map((x) => x.id)));
  return { id, name, avatar, role, ...(gender ? { gender } : {}), clue: { rules: [] } };
}

/** Borrador vacío de NxN: una sola habitación, sin muebles, con una víctima y N-1 sospechosos de ejemplo. */
export function newDraft(size = 5): DraftFile {
  const people: Person[] = [];
  people.push(newPerson(people, 'victim'));
  while (people.length < size) people.push(newPerson(people));
  return {
    schemaVersion: 2,
    id: 'nuevo-caso',
    theme: 'hotel',
    title: '',
    size,
    difficulty: 1,
    story: '',
    epilogue: '',
    rooms: Array.from({ length: size }, () => 'A'.repeat(size)),
    roomNames: { A: 'la sala' },
    objects: Array.from({ length: size }, () => '.'.repeat(size)),
    windows: [],
    doors: [],
    people,
    facts: [],
    solution: {},
  };
}

// ---------- Conversiones ----------

export const toPlacement = (raw: RawSolution): Placement =>
  Object.fromEntries(Object.entries(raw).map(([id, [r, c]]) => [id, { r: r - 1, c: c - 1 }]));

export const fromPlacement = (sol: Partial<Placement>): RawSolution =>
  Object.fromEntries(Object.entries(sol).flatMap(([id, c]) => (c ? [[id, [c.r + 1, c.c + 1] as [number, number]]] : [])));

/** El borrador como Puzzle (sin la solución). */
export function toPuzzle(d: DraftFile): Puzzle {
  const { solution: _omit, ...p } = d;
  void _omit;
  return p;
}

const SIDE_DELTA: Record<Side, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], O: [0, -1] };
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'O', O: 'E' };

export const sideRef = (c: Cell, side: Side) => `${String.fromCharCode(65 + c.c)}${c.r + 1}${side}`;

/** La misma puerta vista desde la otra casilla: "B1E" ↔ "C1O". */
export function mirrorRef(ref: string): string | null {
  const x = parseSideRef(ref);
  if (!x) return null;
  const [dr, dc] = SIDE_DELTA[x.side];
  return sideRef({ r: x.cell.r + dr, c: x.cell.c + dc }, OPPOSITE[x.side]);
}

/** Caso publicado en el formato v2: sin solución, sin campos vacíos y con la dificultad indicada. */
export function publishedCase(d: DraftFile, difficulty = d.difficulty): Puzzle {
  const used = new Set(roomIds(d));
  const out: Puzzle = {
    schemaVersion: 2,
    id: d.id,
    theme: d.theme,
    title: d.title.trim(),
    size: d.size,
    difficulty,
    story: d.story.trim(),
    rooms: [...d.rooms],
    roomNames: Object.fromEntries(Object.entries(d.roomNames).filter(([k]) => used.has(k))),
    objects: [...d.objects],
    people: d.people.map((x) => ({
      id: x.id,
      name: x.name.trim(),
      role: x.role,
      avatar: x.avatar,
      ...(x.gender ? { gender: x.gender } : {}),
      clue: { ...(x.clue.text?.trim() ? { text: x.clue.text.trim() } : {}), rules: x.clue.rules.map((r) => [...r] as Rule) },
    })),
  };
  // Mismo orden de campos que los casos escritos a mano.
  const ordered: Puzzle = {
    schemaVersion: out.schemaVersion,
    id: out.id,
    theme: out.theme,
    title: out.title,
    size: out.size,
    difficulty: out.difficulty,
    story: out.story,
    ...(d.epilogue?.trim() ? { epilogue: d.epilogue.trim() } : {}),
    rooms: out.rooms,
    roomNames: out.roomNames,
    objects: out.objects,
    ...(d.windows?.length ? { windows: [...d.windows] } : {}),
    ...(d.doors?.length ? { doors: [...d.doors] } : {}),
    people: out.people,
    ...(d.facts?.length
      ? { facts: d.facts.map((f) => ({ ...(f.text?.trim() ? { text: f.text.trim() } : {}), fact: [...f.fact] as Fact })) }
      : {}),
    ...(d.crime && d.crime !== 'aloneWithVictim' ? { crime: d.crime } : {}),
  };
  return ordered;
}

/** El borrador para guardar en drafts/<id>.json (con solución), en el mismo orden que el caso publicado. */
export function draftFile(d: DraftFile, difficulty = d.difficulty): DraftFile {
  const sol: RawSolution = {};
  for (const x of d.people) if (d.solution[x.id]) sol[x.id] = [...d.solution[x.id]] as [number, number];
  return { ...publishedCase(d, difficulty), solution: sol };
}

export const toJson = (x: unknown) => JSON.stringify(x, null, 2) + '\n';

// ---------- Importar ----------

export interface ImportResult {
  draft: DraftFile;
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Lee un JSON pegado o subido: un borrador (con `solution`) o un caso publicado (se intenta resolver). */
export function parseImport(text: string): ImportResult {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('No es un JSON válido.');
  }
  if (!isObj(j)) throw new Error('El JSON tiene que ser un objeto con el caso.');
  const size = j.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE)
    throw new Error(`Falta "size" o no está entre ${MIN_SIZE} y ${MAX_SIZE}.`);
  const grid = (k: string) => {
    const v = j[k];
    if (!Array.isArray(v) || v.length !== size || v.some((row) => typeof row !== 'string' || row.length !== size))
      throw new Error(`"${k}" tiene que ser una lista de ${size} filas de ${size} caracteres.`);
    return v as string[];
  };
  const rooms = grid('rooms');
  const objects = grid('objects');
  if (rooms.some((row) => !/^[A-Z]+$/.test(row))) throw new Error('"rooms" solo puede tener letras mayúsculas.');
  if (objects.some((row) => !/^[.TSPVKMCBR]+$/.test(row))) throw new Error('"objects" tiene códigos de mueble desconocidos.');
  if (!Array.isArray(j.people) || j.people.some((x) => !isObj(x) || typeof x.id !== 'string'))
    throw new Error('"people" tiene que ser una lista de personas con "id".');
  const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
  const people: Person[] = (j.people as Record<string, unknown>[]).map((x) => ({
    id: x.id as string,
    name: str(x.name, x.id as string),
    role: x.role === 'victim' ? 'victim' : 'suspect',
    avatar: str(x.avatar, '🙂'),
    ...(x.gender === 'f' || x.gender === 'm' ? { gender: x.gender } : {}),
    clue: {
      ...(isObj(x.clue) && typeof x.clue.text === 'string' ? { text: x.clue.text } : {}),
      rules: isObj(x.clue) && Array.isArray(x.clue.rules) ? (x.clue.rules as Rule[]) : [],
    },
  }));
  const draft: DraftFile = {
    schemaVersion: 2,
    id: str(j.id, 'importado'),
    theme: str(j.theme, 'hotel'),
    title: str(j.title),
    size,
    difficulty: typeof j.difficulty === 'number' ? j.difficulty : 1,
    story: str(j.story),
    epilogue: str(j.epilogue),
    rooms,
    roomNames: isObj(j.roomNames) ? (Object.fromEntries(Object.entries(j.roomNames).map(([k, v]) => [k, str(v)])) as Record<string, string>) : {},
    objects,
    windows: Array.isArray(j.windows) ? j.windows.filter((x): x is string => typeof x === 'string') : [],
    doors: Array.isArray(j.doors) ? j.doors.filter((x): x is string => typeof x === 'string') : [],
    people,
    facts: Array.isArray(j.facts) ? (j.facts as Puzzle['facts'])! : [],
    ...(j.crime === 'touchingVictim' || j.crime === 'aloneWithVictim' ? { crime: j.crime } : {}),
    solution: {},
  };
  for (const rid of roomIds(draft)) if (!draft.roomNames[rid]) draft.roomNames[rid] = `la sala ${rid}`;
  const warnings: string[] = [];
  if (isObj(j.solution)) {
    for (const [id, v] of Object.entries(j.solution))
      if (
        people.some((x) => x.id === id) &&
        Array.isArray(v) &&
        v.length === 2 &&
        v.every((n) => Number.isInteger(n) && n >= 1 && n <= size)
      )
        draft.solution[id] = [v[0], v[1]];
    const missing = people.filter((x) => !draft.solution[x.id]);
    if (missing.length) warnings.push(`La solución no ubica a ${missing.map((x) => x.name).join(', ')}.`);
  } else if (people.some((x) => x.clue.rules.length)) {
    // Caso publicado: la solución sale de las pistas, si son válidas y únicas.
    const p = toPuzzle(draft);
    const sols = structuralErrors(p).length ? [] : solve(p, { limit: 2 });
    if (sols.length === 1) {
      draft.solution = fromPlacement(sols[0]);
      warnings.push('Era un caso publicado (sin solución): la reconstruí a partir de sus pistas.');
    } else warnings.push(sols.length ? 'Las pistas admiten varias soluciones: ubicá a cada persona a mano.' : 'No pude reconstruir la solución: ubicá a cada persona a mano.');
  } else warnings.push('El JSON no trae solución: ubicá a cada persona en el paso "Solución".');
  return { draft, warnings };
}

// ---------- Ediciones del plano ----------

const setChar = (row: string, i: number, ch: string) => row.slice(0, i) + ch + row.slice(i + 1);

/** Quita ventanas y puertas que dejaron de tener sentido (fuera del plano o entre casillas de la misma habitación). */
export function cleanSides(d: DraftFile): DraftFile {
  const p = toPuzzle(d);
  const valid = (ref: string, kind: 'windows' | 'doors') => {
    const x = parseSideRef(ref);
    if (!x || !inBounds(p, x.cell)) return false;
    const [dr, dc] = SIDE_DELTA[x.side];
    const other = { r: x.cell.r + dr, c: x.cell.c + dc };
    if (kind === 'windows') return !inBounds(p, other);
    return inBounds(p, other) && d.rooms[other.r][other.c] !== d.rooms[x.cell.r][x.cell.c];
  };
  const windows = (d.windows ?? []).filter((r) => valid(r, 'windows'));
  const doors = (d.doors ?? []).filter((r) => valid(r, 'doors'));
  if (windows.length === (d.windows ?? []).length && doors.length === (d.doors ?? []).length) return d;
  return { ...d, windows, doors };
}

export function paintRoom(d: DraftFile, cell: Cell, letter: string): DraftFile {
  if (d.rooms[cell.r]?.[cell.c] === undefined || d.rooms[cell.r][cell.c] === letter) return d;
  const rooms = d.rooms.map((row, r) => (r === cell.r ? setChar(row, cell.c, letter) : row));
  return cleanSides({ ...d, rooms });
}

export function setObject(d: DraftFile, cell: Cell, code: ObjectCode): DraftFile {
  if (d.objects[cell.r]?.[cell.c] === undefined || d.objects[cell.r][cell.c] === code) return d;
  const objects = d.objects.map((row, r) => (r === cell.r ? setChar(row, cell.c, code) : row));
  return { ...d, objects };
}

/** Qué se puede poner en ese lado de la casilla: ventana (pared exterior), puerta (entre habitaciones) o nada. */
export function sideKind(d: DraftFile, cell: Cell, side: Side): 'windows' | 'doors' | null {
  const [dr, dc] = SIDE_DELTA[side];
  const other = { r: cell.r + dr, c: cell.c + dc };
  if (other.r < 0 || other.c < 0 || other.r >= d.size || other.c >= d.size) return 'windows';
  return d.rooms[other.r][other.c] !== d.rooms[cell.r][cell.c] ? 'doors' : null;
}

/** Pone o saca una ventana o puerta en ese lado (según lo que corresponda). */
export function toggleSide(d: DraftFile, cell: Cell, side: Side): DraftFile {
  const kind = sideKind(d, cell, side);
  if (!kind) return d;
  const ref = sideRef(cell, side);
  const same = kind === 'doors' ? [ref, mirrorRef(ref)] : [ref];
  const list = d[kind] ?? [];
  const has = list.some((r) => same.includes(r));
  return { ...d, [kind]: has ? list.filter((r) => !same.includes(r)) : [...list, ref] };
}

export function hasSide(d: DraftFile, cell: Cell, side: Side): boolean {
  const kind = sideKind(d, cell, side);
  if (!kind) return false;
  const ref = sideRef(cell, side);
  const same = kind === 'doors' ? [ref, mirrorRef(ref)] : [ref];
  return (d[kind] ?? []).some((r) => same.includes(r));
}

/** Cambia el tamaño: conserva lo que entra, completa con la habitación vecina y saca lo que queda afuera. */
export function resize(d: DraftFile, size: number): DraftFile {
  if (size === d.size || size < MIN_SIZE || size > MAX_SIZE) return d;
  const at = (rows: string[], r: number, c: number) => rows[Math.min(r, d.size - 1)][Math.min(c, d.size - 1)];
  const rooms = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => at(d.rooms, r, c)).join(''));
  const objects = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (r < d.size && c < d.size ? d.objects[r][c] : '.')).join(''),
  );
  const solution = Object.fromEntries(Object.entries(d.solution).filter(([, [r, c]]) => r <= size && c <= size));
  const people = d.people.map((x) => ({
    ...x,
    clue: { ...x.clue, rules: x.clue.rules.filter((rule) => !((rule[0] === 'row' || rule[0] === 'col') && rule[1] > size)) },
  }));
  const facts = (d.facts ?? []).filter((f) => f.fact[2] <= size);
  return cleanSides({ ...d, size, rooms, objects, solution, people, facts, windows: d.windows ?? [], doors: d.doors ?? [] });
}

export function addRoom(d: DraftFile, letter: string, name: string): DraftFile {
  if (!ROOM_LETTERS.includes(letter) || d.roomNames[letter] !== undefined) return d;
  return { ...d, roomNames: { ...d.roomNames, [letter]: name } };
}

export function renameRoom(d: DraftFile, letter: string, name: string): DraftFile {
  if (d.roomNames[letter] === name) return d;
  return { ...d, roomNames: { ...d.roomNames, [letter]: name } };
}

/** Borra una habitación: sus casillas pasan a `into` y se van las pistas y hechos que la nombraban. */
export function removeRoom(d: DraftFile, letter: string, into: string): DraftFile {
  if (letter === into || d.roomNames[into] === undefined) return d;
  const roomNames = { ...d.roomNames };
  delete roomNames[letter];
  const rooms = d.rooms.map((row) => row.replaceAll(letter, into));
  const people = d.people.map((x) => ({
    ...x,
    clue: { ...x.clue, rules: x.clue.rules.filter((r) => !((r[0] === 'inRoom' || r[0] === 'notInRoom') && r[1] === letter)) },
  }));
  const facts = (d.facts ?? []).filter((f) => !(f.fact[0] === 'roomCount' && f.fact[1] === letter));
  return cleanSides({ ...d, roomNames, rooms, people, facts });
}

export const nextRoomLetter = (d: DraftFile) => [...ROOM_LETTERS].find((l) => d.roomNames[l] === undefined) ?? null;

/** Habitaciones partidas en pedazos que no se tocan (válido para el motor, pero suele ser un error de pincel). */
export function splitRooms(d: DraftFile): string[] {
  const out: string[] = [];
  for (const rid of roomIds(d)) {
    const cells: Cell[] = [];
    for (let r = 0; r < d.size; r++) for (let c = 0; c < d.size; c++) if (d.rooms[r][c] === rid) cells.push({ r, c });
    const seen = new Set([`${cells[0].r},${cells[0].c}`]);
    const stack = [cells[0]];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { r: cur.r + dr, c: cur.c + dc };
        const k = `${n.r},${n.c}`;
        if (n.r < 0 || n.c < 0 || n.r >= d.size || n.c >= d.size || seen.has(k) || d.rooms[n.r][n.c] !== rid) continue;
        seen.add(k);
        stack.push(n);
      }
    }
    if (seen.size !== cells.length) out.push(rid);
  }
  return out;
}

// ---------- Personas ----------

const RELATIONAL_KINDS = new Set(['sameRoomAs', 'notSameRoomAs', 'northOf', 'southOf', 'eastOf', 'westOf', 'touching', 'notTouching']);

/** Cambia el id de una persona y todas sus referencias (pistas de otros y solución). */
export function renamePerson(d: DraftFile, from: string, to: string): DraftFile {
  if (from === to || !to || d.people.some((x) => x.id === to)) return d;
  const people = d.people.map((x) => ({
    ...x,
    id: x.id === from ? to : x.id,
    clue: {
      ...x.clue,
      rules: x.clue.rules.map((r) => (RELATIONAL_KINDS.has(r[0]) && r[1] === from ? ([r[0], to] as Rule) : r)),
    },
  }));
  const solution = Object.fromEntries(Object.entries(d.solution).map(([id, v]) => [id === from ? to : id, v]));
  return { ...d, people, solution };
}

export function updatePerson(d: DraftFile, id: string, patch: Partial<Omit<Person, 'id' | 'clue'>>): DraftFile {
  let people = d.people.map((x) => {
    if (x.id !== id) return x;
    const next = { ...x, ...patch };
    if (patch.gender === undefined && 'gender' in patch) delete next.gender;
    return next;
  });
  // Una sola víctima: si alguien pasa a serlo, el resto queda como sospechoso.
  if (patch.role === 'victim') people = people.map((x) => (x.id === id ? x : { ...x, role: 'suspect' as const }));
  return { ...d, people };
}

/** Nombre nuevo: si el id venía del nombre anterior, se actualiza (con sus referencias). */
export function renamePersonName(d: DraftFile, id: string, name: string): DraftFile {
  const x = d.people.find((o) => o.id === id);
  if (!x) return d;
  let next = updatePerson(d, id, { name });
  if (slug(x.name) === id || new RegExp(`^${slug(x.name)}-\\d+$`).test(id)) {
    const taken = new Set(d.people.filter((o) => o.id !== id).map((o) => o.id));
    const to = uniqueId(slug(name), taken);
    next = renamePerson(next, id, to);
  }
  return next;
}

export function addPerson(d: DraftFile): DraftFile {
  if (d.people.length >= MAX_SIZE) return d;
  return { ...d, people: [...d.people, newPerson(d.people, d.people.some((x) => x.role === 'victim') ? 'suspect' : 'victim')] };
}

export function removePerson(d: DraftFile, id: string): DraftFile {
  const people = d.people
    .filter((x) => x.id !== id)
    .map((x) => ({ ...x, clue: { ...x.clue, rules: x.clue.rules.filter((r) => !(RELATIONAL_KINDS.has(r[0]) && r[1] === id)) } }));
  const solution = { ...d.solution };
  delete solution[id];
  return { ...d, people, solution };
}

export function movePerson(d: DraftFile, id: string, delta: -1 | 1): DraftFile {
  const i = d.people.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= d.people.length) return d;
  const people = [...d.people];
  [people[i], people[j]] = [people[j], people[i]];
  return { ...d, people };
}

// ---------- Solución ----------

/** Ubica a alguien (mueve a quien estuviera en esa casilla); `null` lo saca del plano. */
export function placePerson(d: DraftFile, id: string, cell: Cell | null): DraftFile {
  const solution = { ...d.solution };
  const cur = solution[id];
  if (cell && cur && cur[0] === cell.r + 1 && cur[1] === cell.c + 1) return d;
  if (!cell && !cur) return d;
  if (cell) for (const [other, [r, c]] of Object.entries(solution)) if (r === cell.r + 1 && c === cell.c + 1) delete solution[other];
  if (cell) solution[id] = [cell.r + 1, cell.c + 1];
  else delete solution[id];
  return { ...d, solution };
}

// ---------- Pistas y hechos ----------

export const ruleKey = (personId: string, rule: Rule) => `${personId}|${JSON.stringify(rule)}`;

export function setRules(d: DraftFile, id: string, rules: Rule[]): DraftFile {
  return { ...d, people: d.people.map((x) => (x.id === id ? { ...x, clue: { ...x.clue, rules } } : x)) };
}

export function setClueText(d: DraftFile, id: string, text: string): DraftFile {
  return {
    ...d,
    people: d.people.map((x) => {
      if (x.id !== id) return x;
      return { ...x, clue: text ? { ...x.clue, text } : { rules: x.clue.rules } };
    }),
  };
}

/** Aplica pistas generadas. El texto propio de una persona se conserva solo si sus reglas no cambiaron. */
export function applyClues(d: DraftFile, generated: Puzzle): DraftFile {
  const rulesOf = new Map(generated.people.map((x) => [x.id, x.clue.rules]));
  return {
    ...d,
    people: d.people.map((x) => {
      const rules = rulesOf.get(x.id) ?? x.clue.rules;
      const same = JSON.stringify(rules) === JSON.stringify(x.clue.rules);
      return { ...x, clue: same ? x.clue : { rules } };
    }),
  };
}

/** Hecho verdadero según la solución: cuenta cuánta gente hay en la habitación o sobre ese mueble. */
export function factFor(d: DraftFile, kind: Fact[0], what: string): Fact {
  const sol = Object.values(d.solution);
  const n = sol.filter(([r, c]) => (kind === 'roomCount' ? d.rooms : d.objects)[r - 1]?.[c - 1] === what).length;
  return kind === 'roomCount' ? ['roomCount', what, n] : ['objectCount', what as ObjectCode, n];
}

export function addFact(d: DraftFile, fact: Fact): DraftFile {
  if ((d.facts ?? []).some((f) => f.fact[0] === fact[0] && f.fact[1] === fact[1])) return d;
  return { ...d, facts: [...(d.facts ?? []), { fact }] };
}

export function removeFact(d: DraftFile, i: number): DraftFile {
  return { ...d, facts: (d.facts ?? []).filter((_, k) => k !== i) };
}

export function setFactText(d: DraftFile, i: number, text: string): DraftFile {
  return {
    ...d,
    facts: (d.facts ?? []).map((f, k) => {
      if (k !== i) return f;
      return text ? { ...f, text } : { fact: f.fact };
    }),
  };
}

/** Muebles que se pueden ocupar y están en el plano (los únicos que admiten un hecho "N personas en…"). */
export const freeObjectsInPlay = (d: DraftFile) =>
  (Object.keys(OBJECTS) as Exclude<ObjectCode, '.'>[]).filter((o) => !OBJECTS[o].blocking && d.objects.some((row) => row.includes(o)));
