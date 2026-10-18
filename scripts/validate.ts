// Valida todos los casos de /puzzles: estructura, solución única, un solo culpable y dificultad estimada.
// Uso: npm run validate [-- archivo.json ...]
import { clueText, estimateDifficulty, killerOf, solve, structuralErrors } from '../src/engine';
import { loadPuzzles, readPuzzle } from './lib';

const files = process.argv.slice(2);
const entries = files.length ? files.map((file) => ({ file, puzzle: readPuzzle(file) })) : loadPuzzles();
let failed = 0;

for (const { file, puzzle: p } of entries) {
  const errs = structuralErrors(p);
  const t0 = performance.now();
  const sols = errs.length ? [] : solve(p, { limit: 2 });
  const ms = Math.round(performance.now() - t0);

  if (!errs.length && sols.length === 0) errs.push('no tiene solución');
  if (sols.length > 1) errs.push('tiene más de una solución');
  const killer = sols.length === 1 ? killerOf(p, sols[0]) : null;
  if (sols.length === 1 && !killer) errs.push('la víctima no queda a solas con exactamente un sospechoso');

  if (errs.length) {
    failed++;
    console.log(`✗ ${file}\n   ${errs.join('\n   ')}`);
    continue;
  }
  const d = estimateDifficulty(p);
  const killerName = p.people.find((x) => x.id === killer)!.name;
  console.log(
    `✓ ${file}  ${p.size}x${p.size}  dificultad declarada ${p.difficulty} / estimada ${d.level} ` +
      `(rondas ${d.rounds}, hipótesis ${d.trials})  ${ms}ms  culpable: ${killerName}`,
  );
  if (process.env.VERBOSE) for (const x of p.people) console.log(`     ${x.name}: ${clueText(p, x)}`);
}

console.log(`\n${entries.length - failed}/${entries.length} casos válidos`);
process.exit(failed ? 1 : 0);
