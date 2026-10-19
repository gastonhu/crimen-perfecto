// Benchmark del motor: genera casos aleatorios de 5x5 a 9x9 y mide generar pistas, resolver, propagar y estimar.
// Uso: npm run bench [-- --per 3]
import { estimateDifficulty, generateClues, propagate, randomLayout, randomSolution, solve, type Puzzle } from '../src/engine';

const per = Number(process.argv[process.argv.indexOf('--per') + 1]) || 3;
const ms = (f: () => unknown) => {
  const t = performance.now();
  f();
  return performance.now() - t;
};

console.log('tam  seed  pistas  generar   resolver  propagar  dificultad  nivel');
for (let size = 5; size <= 9; size++)
  for (let seed = 1; seed <= per; seed++) {
    const layout = randomLayout(size, Math.min(8, size - 1), seed * 101 + size);
    const p: Puzzle = {
      id: `b${size}-${seed}`, theme: 'bench', title: 'bench', size, difficulty: 1, story: '', ...layout,
      people: Array.from({ length: size }, (_, i) => ({
        id: `p${i}`, name: `P${i}`, avatar: '', role: i === 0 ? 'victim' : 'suspect', clue: { rules: [] },
      })),
    };
    const sol = randomSolution(p, seed);
    if (!sol) {
      console.log(`${size}x${size} ${seed}: sin solución aleatoria válida`);
      continue;
    }
    let g!: Puzzle;
    const tGen = ms(() => (g = generateClues(p, sol, { seed })));
    const tSolve = ms(() => solve(g, { limit: 2 }));
    const tProp = ms(() => propagate(g));
    let level = 0;
    const tDiff = ms(() => (level = estimateDifficulty(g).level));
    const rules = g.people.reduce((s, x) => s + x.clue.rules.length, 0);
    const f = (n: number) => `${n.toFixed(1)}ms`.padStart(9);
    console.log(`${size}x${size}  ${String(seed).padStart(4)}  ${String(rules).padStart(6)} ${f(tGen)} ${f(tSolve)} ${f(tProp)} ${f(tDiff).padStart(11)}  ${level}`);
  }
