// Asistente de autoría: a partir de un borrador (plano + personajes + solución) elige pistas verdaderas hasta que
// la solución sea única, y escribe el caso en /puzzles/<tema>/<id>.json (sin la solución).
//
// Uso: npm run suggest -- drafts/hotel-01.json [--seed 7] [--easy]
//   El borrador es un Puzzle sin `clue` y con "solution": { "<personId>": [fila, columna] } (1-based).
//   --easy no poda pistas redundantes (casos más fáciles).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  OBJECTS,
  countSolutions,
  describeClue,
  estimateDifficulty,
  isBlocked,
  isOnEdge,
  killerOf,
  neighbors,
  objectAt,
  propagate,
  roomAt,
  roomIds,
  solve,
  structuralErrors,
  type ObjectCode,
  type Placement,
  type Puzzle,
  type Rule,
} from '../src/engine';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) throw new Error('Falta el borrador: npm run suggest -- drafts/x.json');
const seedArg = args.indexOf('--seed');
let seed = seedArg >= 0 ? Number(args[seedArg + 1]) : 1;
const easy = args.includes('--easy');

const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const shuffle = <T>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

const draft = JSON.parse(readFileSync(file, 'utf8')) as Puzzle & { solution: Record<string, [number, number]> };
const solution: Placement = Object.fromEntries(
  Object.entries(draft.solution).map(([id, [r, c]]) => [id, { r: r - 1, c: c - 1 }]),
);
const base: Omit<typeof draft, 'solution'> & { solution?: unknown } = { ...draft };
delete base.solution;
const p: Puzzle = { ...base, people: draft.people.map((x) => ({ ...x, clue: { rules: [] } })) };

// --- Chequeos del borrador ---
const errs = structuralErrors(p);
const cells = Object.values(solution);
if (p.people.some((x) => !solution[x.id])) errs.push('falta la solución de alguna persona');
if (new Set(cells.map((c) => c.r)).size !== p.size || new Set(cells.map((c) => c.c)).size !== p.size)
  errs.push('la solución repite fila o columna');
for (const x of p.people) if (solution[x.id] && isBlocked(p, solution[x.id])) errs.push(`${x.id} está sobre un mueble`);
if (!errs.length && !killerOf(p, solution)) errs.push('la víctima no queda a solas con exactamente un sospechoso');
if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}

// --- Pistas candidatas (todas verdaderas para la solución) con un peso de "interés" ---
const objectsInPlay = [...new Set(p.objects.join('').replace(/\./g, ''))] as ObjectCode[];
function candidates(id: string): { rule: Rule; interest: number }[] {
  const c = solution[id];
  const rid = roomAt(p, c);
  const occ = p.people.filter((x) => roomAt(p, solution[x.id]) === rid).length - 1;
  const out: { rule: Rule; interest: number }[] = [{ rule: ['inRoom', rid], interest: 3 }];
  for (const r of roomIds(p)) if (r !== rid) out.push({ rule: ['notInRoom', r], interest: 1 });
  const here = objectAt(p, c);
  if (here !== '.') out.push({ rule: ['onObject', here], interest: 4 });
  const adj = new Set(neighbors(p, c).map((n) => objectAt(p, n)));
  for (const o of objectsInPlay) {
    if (adj.has(o)) out.push({ rule: ['adjacentTo', o], interest: 4 });
    else if (OBJECTS[o as Exclude<ObjectCode, '.'>]) out.push({ rule: ['notAdjacentTo', o], interest: 1 });
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

const person = (id: string) => p.people.find((x) => x.id === id)!;
const CAP = 300;
const count = () => countSolutions(p, CAP);
/** Mientras hay muchas soluciones, el tamaño de los dominios propagados desempata. */
const spread = () => Object.values(propagate(p).domains).reduce((s, d) => s + d.length, 0);
const MAX_RULES = 2;

// --- Greedy: agregar la pista que más reduce las soluciones, priorizando quien todavía no tiene ---
let current = count();
let currentSpread = spread();
while (current > 1) {
  let best: { id: string; rule: Rule; cost: number } | null = null;
  for (const x of shuffle(p.people)) {
    if (x.clue.rules.length >= MAX_RULES) continue;
    for (const { rule, interest } of candidates(x.id)) {
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
  if (!best) {
    console.error(`Me trabé con ${current} soluciones; probá otra --seed o cambiá el plano.`);
    process.exit(1);
  }
  person(best.id).clue.rules.push(best.rule);
  current = count();
  currentSpread = spread();
  console.log(`+ ${person(best.id).name}: ${describeClue(p, [best.rule])}  → ${current >= CAP ? `≥${CAP}` : current} soluciones`);
}

// Todos tienen al menos una pista (agregar verdades no rompe la unicidad).
for (const x of p.people)
  if (!x.clue.rules.length) {
    const best = candidates(x.id).sort((a, b) => b.interest - a.interest)[0];
    x.clue.rules.push(best.rule);
  }

// Poda de redundantes: quita pistas mientras la solución siga siendo única.
if (!easy)
  for (const x of shuffle(p.people))
    for (const rule of [...x.clue.rules]) {
      if (x.clue.rules.length === 1) break;
      x.clue.rules = x.clue.rules.filter((r) => r !== rule);
      if (count() !== 1) x.clue.rules.push(rule);
    }

const sols = solve(p, { limit: 2 });
if (sols.length !== 1) throw new Error('la poda rompió la unicidad (no debería pasar)');
const d = estimateDifficulty(p);
p.difficulty = d.level;

const out = join('puzzles', p.theme, `${p.id}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(p, null, 2) + '\n');
console.log(`\nDificultad estimada ${d.level} (rondas ${d.rounds}, hipótesis ${d.trials}). Escrito ${out}\n`);
for (const x of p.people) console.log(`  ${x.avatar} ${x.name}${x.role === 'victim' ? ' (víctima)' : ''}: ${describeClue(p, x.clue.rules)}`);
console.log(`\n  Culpable: ${person(killerOf(p, sols[0])!).name}`);
