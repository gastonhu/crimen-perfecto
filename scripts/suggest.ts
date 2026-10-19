// Asistente de autoría: a partir de un borrador (plano + personajes + solución) elige pistas verdaderas hasta que
// la solución sea única, y escribe el caso en /puzzles/<tema>/<id>.json (sin la solución).
//
// Uso: npm run suggest -- drafts/hotel-01.json [--seed 7] [--easy]
//   El borrador es un Puzzle sin `clue` y con "solution": { "<personId>": [fila, columna] } (1-based).
//   --easy no poda pistas redundantes (casos más fáciles).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describeClue, estimateDifficulty, generateClues, killerOf, solve, type Placement, type Puzzle } from '../src/engine';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) throw new Error('Falta el borrador: npm run suggest -- drafts/x.json');
const seedArg = args.indexOf('--seed');
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : 1;

const { solution: raw, ...draft } = JSON.parse(readFileSync(file, 'utf8')) as Puzzle & {
  solution: Record<string, [number, number]>;
};
const solution: Placement = Object.fromEntries(Object.entries(raw).map(([id, [r, c]]) => [id, { r: r - 1, c: c - 1 }]));
const base: Puzzle = { ...draft, people: draft.people.map((x) => ({ ...x, clue: { rules: [] } })) };

let p: Puzzle;
try {
  p = generateClues(base, solution, {
    seed,
    prune: !args.includes('--easy'),
    onStep: (id, rule, n) =>
      console.log(`+ ${base.people.find((x) => x.id === id)!.name}: ${describeClue(base, [rule])}  → ${n >= 300 ? '≥300' : n} soluciones`),
  });
} catch (e) {
  console.error(`✗ ${(e as Error).message}. Probá otra --seed o cambiá el plano.`);
  process.exit(1);
}

const d = estimateDifficulty(p);
p.difficulty = d.level;
const out = join('puzzles', p.theme, `${p.id}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(p, null, 2) + '\n');
console.log(`\nDificultad estimada ${d.level} (rondas ${d.rounds}, hipótesis ${d.trials}). Escrito ${out}\n`);
for (const x of p.people) console.log(`  ${x.avatar} ${x.name}${x.role === 'victim' ? ' (víctima)' : ''}: ${describeClue(p, x.clue.rules)}`);
console.log(`\n  Culpable: ${p.people.find((x) => x.id === killerOf(p, solve(p, { limit: 1 })[0]))!.name}`);
