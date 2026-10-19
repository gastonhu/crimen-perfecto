// Deducción "humana" y explicable. Cada paso aplica una técnica, descarta casillas y explica por qué.
// La dificultad de un caso es la técnica más difícil que hace falta para resolverlo.
import { cellKey, diagonals, isBlocked, objectAt, roomAt } from './board';
import { colLabel, describeFact, describeRule, evalRelational, evalUnary, isRelational, isRoomCount, isUnary, roomCompanions, unaryDomain } from './clues';
import type { Cell, Placement, Puzzle } from './types';

export type Domains = Record<string, Cell[]>;

export type Technique = 'single' | 'hiddenSingle' | 'line' | 'clue' | 'relation' | 'capacity' | 'fact' | 'crime' | 'subset' | 'hypothesis';

/** Nivel de dificultad (1–5) de cada técnica. */
export const TECHNIQUE_LEVEL: Record<Technique, number> = {
  single: 1,
  hiddenSingle: 1,
  line: 1,
  clue: 1,
  relation: 2,
  capacity: 3,
  fact: 3,
  crime: 3,
  subset: 4,
  hypothesis: 5,
};

export const TECHNIQUE_NAME: Record<Technique, string> = {
  single: 'Único lugar',
  hiddenSingle: 'Fila o columna con un solo candidato',
  line: 'Fila o columna propia',
  clue: 'Pista directa',
  relation: 'Pista relativa',
  capacity: 'Gente por habitación',
  fact: 'Hecho general',
  crime: 'Regla del crimen',
  subset: 'Grupo cerrado',
  hypothesis: 'Hipótesis',
};

export interface Step {
  technique: Technique;
  level: number;
  /** Explicación en castellano. */
  reason: string;
  /** Casillas para resaltar en el plano al mostrar el paso. */
  focus: Cell[];
  /** Casillas descartadas por persona. */
  removed: Record<string, Cell[]>;
}

// ---------- Utilidades ----------

const label = (c: Cell) => `${colLabel(c.c)}${c.r + 1}`;
const list = (cells: Cell[], max = 6) =>
  cells.length <= max ? cells.map(label).join(', ') : `${cells.slice(0, max).map(label).join(', ')} y ${cells.length - max} más`;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

const clone = (d: Domains): Domains => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [...v]]));

/** Todas las casillas sin muebles que bloqueen. */
export function openDomains(p: Puzzle): Domains {
  const open: Cell[] = [];
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (!isBlocked(p, { r, c })) open.push({ r, c });
  return Object.fromEntries(p.people.map((x) => [x.id, [...open]]));
}

/** Dominios con las pistas directas (unarias) ya aplicadas. */
export function initialDomains(p: Puzzle): Domains {
  return Object.fromEntries(p.people.map((x) => [x.id, unaryDomain(p, x)]));
}

/** Requisitos de compañía por persona: cuántas OTRAS personas tiene que haber en su habitación. */
function requirements(p: Puzzle): Map<string, number[]> {
  return new Map(
    p.people.map((x) => [
      x.id,
      [
        ...(x.role === 'victim' && (p.crime ?? 'aloneWithVictim') === 'aloneWithVictim' ? [1] : []),
        ...x.clue.rules.filter(isRoomCount).map(roomCompanions),
      ],
    ]),
  );
}

interface Ctx {
  p: Puzzle;
  name: (id: string) => string;
  room: (id: string) => string;
  req: Map<string, number[]>;
}

function ctx(p: Puzzle): Ctx {
  return {
    p,
    name: (id) => p.people.find((x) => x.id === id)?.name ?? id,
    room: (rid) => p.roomNames[rid] ?? rid,
    req: requirements(p),
  };
}

/** Arma un paso con lo que `keep` deja afuera; null si no descarta nada. */
function stepFrom(
  d: Domains,
  technique: Technique,
  reason: string,
  focus: Cell[],
  keep: Record<string, (c: Cell) => boolean>,
): Step | null {
  const removed: Record<string, Cell[]> = {};
  for (const [id, fn] of Object.entries(keep)) {
    const gone = d[id].filter((c) => !fn(c));
    if (gone.length) removed[id] = gone;
  }
  if (!Object.keys(removed).length) return null;
  return { technique, level: TECHNIQUE_LEVEL[technique], reason, focus, removed };
}

// ---------- Técnicas ----------

function single(c: Ctx, d: Domains): Step | null {
  for (const x of c.p.people) {
    if (d[x.id].length !== 1) continue;
    const only = d[x.id][0];
    const keep: Record<string, (cell: Cell) => boolean> = {};
    for (const o of c.p.people) if (o.id !== x.id) keep[o.id] = (cell) => cell.r !== only.r && cell.c !== only.c;
    const s = stepFrom(
      d,
      'single',
      `${c.name(x.id)} solo puede estar en ${label(only)}, así que nadie más va en la fila ${only.r + 1} ni en la columna ${colLabel(only.c)}.`,
      [only],
      keep,
    );
    if (s) return s;
  }
  return null;
}

function hiddenSingle(c: Ctx, d: Domains): Step | null {
  for (const axis of ['r', 'c'] as const)
    for (let i = 0; i < c.p.size; i++) {
      const who = c.p.people.filter((x) => d[x.id].some((cell) => cell[axis] === i));
      if (who.length !== 1) continue;
      const x = who[0].id;
      const what = axis === 'r' ? `la fila ${i + 1}` : `la columna ${colLabel(i)}`;
      const s = stepFrom(
        d,
        'hiddenSingle',
        `Alguien tiene que ocupar ${what} y ${c.name(x)} es la única persona que puede estar ahí.`,
        d[x].filter((cell) => cell[axis] === i),
        { [x]: (cell) => cell[axis] === i },
      );
      if (s) return s;
    }
  return null;
}

/** Si alguien solo puede estar en una fila (o columna), esa fila es suya. */
function line(c: Ctx, d: Domains): Step | null {
  for (const x of c.p.people) {
    if (d[x.id].length < 2) continue;
    for (const axis of ['r', 'c'] as const) {
      const lines = new Set(d[x.id].map((cell) => cell[axis]));
      if (lines.size !== 1) continue;
      const i = [...lines][0];
      const what = axis === 'r' ? `la fila ${i + 1}` : `la columna ${colLabel(i)}`;
      const keep: Record<string, (cell: Cell) => boolean> = {};
      for (const o of c.p.people) if (o.id !== x.id) keep[o.id] = (cell) => cell[axis] !== i;
      const s = stepFrom(d, 'line', `${c.name(x.id)} solo puede estar en ${what}, así que esa ${axis === 'r' ? 'fila' : 'columna'} es suya: nadie más va ahí.`, d[x.id], keep);
      if (s) return s;
    }
  }
  return null;
}

function clue(c: Ctx, d: Domains): Step | null {
  for (const x of c.p.people) {
    const rules = x.clue.rules.filter(isUnary);
    if (!rules.length) continue;
    const ok = (cell: Cell) => rules.every((r) => evalUnary(c.p, r, cell));
    const left = d[x.id].filter(ok);
    const text = rules.map((r) => describeRule(c.p, r)).join(' y ');
    const s = stepFrom(
      d,
      'clue',
      `Según su pista, ${c.name(x.id)} ${text}: solo puede estar en ${list(left)}.`,
      left,
      { [x.id]: ok },
    );
    if (s) return s;
  }
  return null;
}

function relation(c: Ctx, d: Domains): Step | null {
  const supported = (rule: Parameters<typeof evalRelational>[1], a: Cell, b: Cell) =>
    a.r !== b.r && a.c !== b.c && evalRelational(c.p, rule, a, b);
  for (const x of c.p.people)
    for (const rule of x.clue.rules.filter(isRelational)) {
      const y = rule[1] as string;
      const pista = `${c.name(x.id)} ${describeRule(c.p, rule)}`;
      const sx = stepFrom(
        d,
        'relation',
        `${pista}. Con los lugares posibles de ${c.name(y)}, ${c.name(x.id)} no puede estar en ${list(d[x.id].filter((cx) => !d[y].some((cy) => supported(rule, cx, cy))))}.`,
        d[y],
        { [x.id]: (cx) => d[y].some((cy) => supported(rule, cx, cy)) },
      );
      if (sx) return sx;
      const sy = stepFrom(
        d,
        'relation',
        `${pista}. Con los lugares posibles de ${c.name(x.id)}, ${c.name(y)} no puede estar en ${list(d[y].filter((cy) => !d[x.id].some((cx) => supported(rule, cx, cy))))}.`,
        d[x.id],
        { [y]: (cy) => d[x.id].some((cx) => supported(rule, cx, cy)) },
      );
      if (sy) return sy;
    }
  return null;
}

function capacity(c: Ctx, d: Domains): Step | null {
  const { p } = c;
  const ids = p.people.map((x) => x.id);
  const roomsOf = (id: string) => new Set(d[id].map((cell) => roomAt(p, cell)));
  const confined = (id: string, rid: string) => d[id].length > 0 && d[id].every((cell) => roomAt(p, cell) === rid);
  const canBe = (id: string, rid: string) => d[id].some((cell) => roomAt(p, cell) === rid);
  const reqText = (id: string, k: number) =>
    c.p.people.find((x) => x.id === id)?.role === 'victim' && k === 1
      ? `${c.name(id)} (la víctima) compartía la habitación solo con el asesino`
      : k === 0
        ? `${c.name(id)} estaba sin compañía`
        : `${c.name(id)} compartía la habitación con exactamente ${k} ${k === 1 ? 'persona' : 'personas'}`;

  for (const id of ids) {
    for (const k of c.req.get(id)!) {
      // (a)/(b): la persona está confinada a una habitación → esa habitación tiene exactamente k+1 personas.
      const rs = roomsOf(id);
      if (rs.size === 1) {
        const rid = [...rs][0];
        const total = k + 1;
        const must = ids.filter((o) => confined(o, rid));
        const could = ids.filter((o) => canBe(o, rid));
        if (must.length === total) {
          const keep: Record<string, (cell: Cell) => boolean> = {};
          for (const o of ids) if (!must.includes(o)) keep[o] = (cell) => roomAt(p, cell) !== rid;
          const s = stepFrom(
            d,
            'capacity',
            must.length === 1
              ? `${reqText(id, k)} en ${c.room(rid)}: nadie más puede estar ahí.`
              : `${reqText(id, k)}, y ${names(must.map(c.name))} tienen que estar en ${c.room(rid)}: no entra nadie más.`,
            must.flatMap((o) => d[o]),
            keep,
          );
          if (s) return s;
        }
        if (could.length === total) {
          const keep: Record<string, (cell: Cell) => boolean> = {};
          for (const o of could) keep[o] = (cell) => roomAt(p, cell) === rid;
          const s = stepFrom(
            d,
            'capacity',
            `${reqText(id, k)}, así que en ${c.room(rid)} hay ${total} personas, y las únicas que pueden estar ahí son ${names(could.map(c.name))}.`,
            could.flatMap((o) => d[o].filter((cell) => roomAt(p, cell) === rid)),
            keep,
          );
          if (s) return s;
        }
      }
      // (c): descartar habitaciones donde el requisito no se podría cumplir.
      const bad = new Set<string>();
      for (const rid of rs) {
        const must = ids.filter((o) => o !== id && confined(o, rid)).length;
        const could = ids.filter((o) => o !== id && canBe(o, rid)).length;
        if (must > k || could < k) bad.add(rid);
      }
      if (bad.size) {
        const why = [...bad]
          .map((rid) => {
            const must = ids.filter((o) => o !== id && confined(o, rid));
            return must.length > k
              ? `en ${c.room(rid)} ya tienen que estar ${names(must.map(c.name))}`
              : `en ${c.room(rid)} no podría juntar ${k} ${k === 1 ? 'persona' : 'personas'} más`;
          })
          .join('; ');
        const s = stepFrom(d, 'capacity', `${reqText(id, k)}: ${why}.`, d[id].filter((cell) => bad.has(roomAt(p, cell))), {
          [id]: (cell) => !bad.has(roomAt(p, cell)),
        });
        if (s) return s;
      }
    }
  }
  return null;
}

/** Hechos generales: "en la cocina había N personas", "N personas estaban en sillas". */
function fact(c: Ctx, d: Domains): Step | null {
  const { p } = c;
  const ids = p.people.map((x) => x.id);
  for (const { fact: f } of p.facts ?? []) {
    const inZone = (cell: Cell) => (f[0] === 'roomCount' ? roomAt(p, cell) : objectAt(p, cell)) === f[1];
    const must = ids.filter((id) => d[id].length > 0 && d[id].every(inZone));
    const could = ids.filter((id) => d[id].some(inZone));
    const text = describeFact(p, f).replace(/\.$/, '');
    if (must.length === f[2]) {
      const keep: Record<string, (cell: Cell) => boolean> = {};
      for (const id of ids) if (!must.includes(id)) keep[id] = (cell) => !inZone(cell);
      const s = stepFrom(
        d,
        'fact',
        must.length
          ? `${text}, y ya tienen que estar ${names(must.map(c.name))}: nadie más.`
          : `${text}: nadie puede estar ahí.`,
        must.flatMap((id) => d[id]),
        keep,
      );
      if (s) return s;
    }
    if (could.length === f[2]) {
      const keep: Record<string, (cell: Cell) => boolean> = {};
      for (const id of could) keep[id] = inZone;
      const s = stepFrom(
        d,
        'fact',
        `${text}, y las únicas personas que pueden cumplirlo son ${names(could.map(c.name))}.`,
        could.flatMap((id) => d[id].filter(inZone)),
        keep,
      );
      if (s) return s;
    }
  }
  return null;
}

/** Regla del crimen "pegado en diagonal": exactamente una persona en las diagonales de la víctima. */
function crime(c: Ctx, d: Domains): Step | null {
  const { p } = c;
  if ((p.crime ?? 'aloneWithVictim') !== 'touchingVictim') return null;
  const victim = p.people.find((x) => x.role === 'victim')!;
  if (d[victim.id].length !== 1) return null;
  const diag = diagonals(p, d[victim.id][0]);
  const near = (cell: Cell) => diag.some((v) => v.r === cell.r && v.c === cell.c);
  const others = p.people.filter((x) => x.id !== victim.id).map((x) => x.id);
  const must = others.filter((id) => d[id].length > 0 && d[id].every(near));
  const could = others.filter((id) => d[id].some(near));
  if (must.length === 1) {
    const keep: Record<string, (cell: Cell) => boolean> = {};
    for (const id of others) if (id !== must[0]) keep[id] = (cell) => !near(cell);
    const s = stepFrom(
      d,
      'crime',
      `El asesino es la única persona pegada en diagonal a ${c.name(victim.id)}, y ${c.name(must[0])} tiene que estar ahí: nadie más.`,
      diag,
      keep,
    );
    if (s) return s;
  }
  if (could.length === 1) {
    const s = stepFrom(
      d,
      'crime',
      `Alguien tuvo que estar pegado en diagonal a ${c.name(victim.id)}, y la única persona que puede es ${c.name(could[0])}.`,
      diag,
      { [could[0]]: near },
    );
    if (s) return s;
  }
  return null;
}

function subset(c: Ctx, d: Domains): Step | null {
  const ids = c.p.people.map((x) => x.id).filter((id) => d[id].length > 1);
  const combos = (k: number, from = 0): string[][] =>
    k === 0 ? [[]] : ids.slice(from).flatMap((id, i) => combos(k - 1, from + i + 1).map((rest) => [id, ...rest]));
  for (const k of [2, 3])
    for (const group of combos(k))
      for (const axis of ['r', 'c'] as const) {
        const lines = new Set(group.flatMap((id) => d[id].map((cell) => cell[axis])));
        if (lines.size !== k) continue;
        const keep: Record<string, (cell: Cell) => boolean> = {};
        for (const x of c.p.people) if (!group.includes(x.id)) keep[x.id] = (cell) => !lines.has(cell[axis]);
        const what = [...lines].sort().map((i) => (axis === 'r' ? `${i + 1}` : colLabel(i)));
        const s = stepFrom(
          d,
          'subset',
          `${names(group.map(c.name))} solo pueden estar en las ${axis === 'r' ? 'filas' : 'columnas'} ${names(what)}: esas ${axis === 'r' ? 'filas' : 'columnas'} son suyas y nadie más puede usarlas.`,
          group.flatMap((id) => d[id]),
          keep,
        );
        if (s) return s;
      }
  // Versión oculta: k filas (o columnas) que solo pueden ocupar k personas → esas personas van ahí.
  const all = c.p.people.map((x) => x.id);
  const lineCombos = (k: number, from = 0): number[][] =>
    k === 0 ? [[]] : Array.from({ length: c.p.size - from }, (_, i) => from + i).flatMap((l) => lineCombos(k - 1, l + 1).map((rest) => [l, ...rest]));
  for (const k of [2, 3])
    for (const axis of ['r', 'c'] as const)
      for (const lines of lineCombos(k)) {
        const set = new Set(lines);
        const who = all.filter((id) => d[id].some((cell) => set.has(cell[axis])));
        if (who.length !== k) continue;
        const keep: Record<string, (cell: Cell) => boolean> = {};
        for (const id of who) keep[id] = (cell) => set.has(cell[axis]);
        const what = lines.map((i) => (axis === 'r' ? `${i + 1}` : colLabel(i)));
        const s = stepFrom(
          d,
          'subset',
          `Las ${axis === 'r' ? 'filas' : 'columnas'} ${names(what)} solo las pueden ocupar ${names(who.map(c.name))}: cada una de esas personas tiene que estar ahí.`,
          who.flatMap((id) => d[id].filter((cell) => set.has(cell[axis]))),
          keep,
        );
        if (s) return s;
      }
  return null;
}

/** Explica por qué un estado es imposible, o null si no hay contradicción evidente. */
export function contradiction(p: Puzzle, d: Domains): string | null {
  const c = ctx(p);
  const empty = p.people.find((x) => d[x.id].length === 0);
  if (empty) return `${c.name(empty.id)} se quedaría sin lugar`;
  for (const axis of ['r', 'c'] as const) {
    const covered = new Set(p.people.flatMap((x) => d[x.id].map((cell) => cell[axis])));
    for (let i = 0; i < p.size; i++)
      if (!covered.has(i)) return `nadie podría ocupar la ${axis === 'r' ? `fila ${i + 1}` : `columna ${colLabel(i)}`}`;
  }
  for (const x of p.people) {
    const rs = new Set(d[x.id].map((cell) => roomAt(p, cell)));
    if (rs.size !== 1) continue;
    const rid = [...rs][0];
    for (const k of c.req.get(x.id)!) {
      const must = p.people.filter((o) => d[o.id].every((cell) => roomAt(p, cell) === rid)).length;
      const could = p.people.filter((o) => d[o.id].some((cell) => roomAt(p, cell) === rid)).length;
      if (must > k + 1) return `habría demasiada gente en ${c.room(rid)}`;
      if (could < k + 1) return `no alcanzaría la gente en ${c.room(rid)}`;
    }
  }
  for (const { fact: f } of p.facts ?? []) {
    const inZone = (cell: Cell) => (f[0] === 'roomCount' ? roomAt(p, cell) : objectAt(p, cell)) === f[1];
    const must = p.people.filter((x) => d[x.id].every(inZone)).length;
    const could = p.people.filter((x) => d[x.id].some(inZone)).length;
    if (must > f[2] || could < f[2]) return `no se cumpliría que ${describeFact(p, f).replace(/\.$/, '').replace(/^./, (ch) => ch.toLowerCase())}`;
  }
  if ((p.crime ?? 'aloneWithVictim') === 'touchingVictim') {
    const victim = p.people.find((x) => x.role === 'victim')!;
    if (d[victim.id].length === 1) {
      const diag = diagonals(p, d[victim.id][0]);
      const near = (cell: Cell) => diag.some((v) => v.r === cell.r && v.c === cell.c);
      const others = p.people.filter((x) => x.id !== victim.id);
      if (others.filter((x) => d[x.id].every(near)).length > 1) return `habría más de una persona pegada a ${c.name(victim.id)}`;
      if (!others.some((x) => d[x.id].some(near))) return `nadie habría podido matar a ${c.name(victim.id)}`;
    }
  }
  return null;
}

type TechniqueFn = (c: Ctx, d: Domains) => Step | null;
const BASIC: [Technique, TechniqueFn][] = [
  ['single', single],
  ['hiddenSingle', hiddenSingle],
  ['line', line],
  ['clue', clue],
  ['relation', relation],
  ['capacity', capacity],
  ['fact', fact],
  ['crime', crime],
  ['subset', subset],
];

function apply(d: Domains, s: Step) {
  for (const [id, cells] of Object.entries(s.removed)) {
    const gone = new Set(cells.map(cellKey));
    d[id] = d[id].filter((cell) => !gone.has(cellKey(cell)));
  }
}

/** Corre las técnicas básicas (sin hipótesis) hasta trabarse o encontrar una contradicción. */
function propagateBasic(c: Ctx, d: Domains): { d: Domains; why: string | null } {
  const work = clone(d);
  for (let guard = 0; guard < 1000; guard++) {
    const why = contradiction(c.p, work);
    if (why) return { d: work, why };
    const s = firstStep(BASIC, c, work);
    if (!s) break;
    apply(work, s);
  }
  return { d: work, why: contradiction(c.p, work) };
}

function hypothesis(c: Ctx, d: Domains): Step | null {
  const people = [...c.p.people].filter((x) => d[x.id].length > 1).sort((a, b) => d[a.id].length - d[b.id].length);
  for (const x of people)
    for (const cell of d[x.id]) {
      const { why } = propagateBasic(c, { ...d, [x.id]: [cell] });
      if (!why) continue;
      return {
        technique: 'hypothesis',
        level: TECHNIQUE_LEVEL.hypothesis,
        reason: `Si ${c.name(x.id)} estuviera en ${label(cell)}, ${why}. Entonces no puede estar ahí.`,
        focus: [cell],
        removed: { [x.id]: [cell] },
      };
    }
  return null;
}

const TECHNIQUES: [Technique, TechniqueFn][] = [...BASIC, ['hypothesis', hypothesis]];

/** Primer paso que encuentre alguna técnica, en orden de dificultad. */
function firstStep(list: [Technique, TechniqueFn][], c: Ctx, d: Domains): Step | null {
  for (const [, fn] of list) {
    const s = fn(c, d);
    if (s) return s;
  }
  return null;
}

export interface Deduction {
  steps: Step[];
  domains: Domains;
  /** Todos quedaron con una sola casilla posible. */
  solved: boolean;
  /** El estado es imposible (con su explicación). */
  contradiction: string | null;
}

/**
 * Deduce paso a paso desde `start` (por defecto: todas las casillas libres). `maxLevel` limita las técnicas.
 * `stopWhen` corta apenas se cumple (por ejemplo, cuando alguien queda ubicado).
 */
export function deduce(
  p: Puzzle,
  start: Domains = openDomains(p),
  opts: { maxLevel?: number; stopWhen?: (d: Domains) => boolean; maxSteps?: number } = {},
): Deduction {
  const c = ctx(p);
  const d = clone(start);
  const steps: Step[] = [];
  const techniques = TECHNIQUES.filter(([t]) => TECHNIQUE_LEVEL[t] <= (opts.maxLevel ?? 5));
  for (let i = 0; i < (opts.maxSteps ?? 2000); i++) {
    const why = contradiction(p, d);
    if (why) return { steps, domains: d, solved: false, contradiction: why };
    if (opts.stopWhen?.(d)) break;
    const s = firstStep(techniques, c, d);
    if (!s) break;
    apply(d, s);
    steps.push(s);
  }
  return { steps, domains: d, solved: p.people.every((x) => d[x.id].length === 1), contradiction: contradiction(p, d) };
}

/** Propagación sin hipótesis (compatibilidad): dominios reducidos y cantidad de pasos. */
export function propagate(p: Puzzle, start: Domains = initialDomains(p)): { domains: Domains; rounds: number } {
  const r = deduce(p, start, { maxLevel: 4 });
  return { domains: r.domains, rounds: r.steps.length };
}

export interface DifficultyReport {
  /** 1–5: nivel de la técnica más difícil necesaria. */
  level: number;
  /** Cantidad de pasos de deducción. */
  steps: number;
  /** Cuántas veces se usó cada técnica. */
  techniques: Partial<Record<Technique, number>>;
  /** La deducción humana no alcanza: hace falta probar combinaciones a ciegas. */
  needsSearch: boolean;
  /** Compatibilidad con el estimador anterior. */
  rounds: number;
  trials: number;
}

export function estimateDifficulty(p: Puzzle): DifficultyReport {
  const r = deduce(p);
  const techniques: Partial<Record<Technique, number>> = {};
  for (const s of r.steps) techniques[s.technique] = (techniques[s.technique] ?? 0) + 1;
  const level = Math.max(1, ...r.steps.map((s) => s.level));
  const needsSearch = !r.solved;
  return {
    level: needsSearch ? 5 : level,
    steps: r.steps.length,
    techniques,
    needsSearch,
    rounds: r.steps.length,
    trials: techniques.hypothesis ?? 0,
  };
}

// ---------- Ayudas ----------

export type Explanation =
  | { kind: 'wrong'; personId: string }
  | { kind: 'deduction'; personId: string; cell: Cell; steps: Step[] }
  | { kind: 'reveal'; personId: string; cell: Cell }
  | { kind: 'none' };

/**
 * Siguiente deducción para el jugador: parte de lo que ya ubicó bien y razona hasta que alguien más quede
 * ubicado. Devuelve los pasos que llevan ahí (para mostrarlos de a uno).
 */
export function explainNext(p: Puzzle, solution: Placement, current: Partial<Placement>): Explanation {
  const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
  const wrong = p.people.find((x) => current[x.id] && !same(current[x.id]!, solution[x.id]));
  if (wrong) return { kind: 'wrong', personId: wrong.id };
  const pending = p.people.filter((x) => !current[x.id]);
  if (!pending.length) return { kind: 'none' };

  // Lo que el jugador ya sabe: sus ubicaciones y las filas/columnas que ocupan.
  const start = openDomains(p);
  const placed = p.people.filter((x) => current[x.id]);
  for (const x of p.people) {
    if (current[x.id]) start[x.id] = [current[x.id]!];
    else start[x.id] = start[x.id].filter((cell) => placed.every((o) => cell.r !== current[o.id]!.r && cell.c !== current[o.id]!.c));
  }
  const isPlaced = (d: Domains) => pending.find((x) => d[x.id].length === 1);
  const r = deduce(p, start, { stopWhen: (d) => !!isPlaced(d) });
  const target = isPlaced(r.domains);
  if (target) return { kind: 'deduction', personId: target.id, cell: r.domains[target.id][0], steps: r.steps };
  const fallback = pending.reduce((a, b) => (r.domains[b.id].length < r.domains[a.id].length ? b : a));
  return { kind: 'reveal', personId: fallback.id, cell: solution[fallback.id] };
}

export type Hint =
  | { kind: 'wrong'; personId: string }
  | { kind: 'place'; personId: string; cells: Cell[] }
  | { kind: 'candidates'; personId: string; cells: Cell[] }
  | { kind: 'none' };

/** Ayuda simple (compatibilidad con la UI actual): a quién ubicar y dónde. */
export function nextHint(p: Puzzle, solution: Placement, current: Partial<Placement>): Hint {
  const e = explainNext(p, solution, current);
  if (e.kind === 'wrong' || e.kind === 'none') return e;
  return { kind: 'place', personId: e.personId, cells: [e.cell] };
}

export const keySet = (cells: Cell[]) => new Set(cells.map(cellKey));
