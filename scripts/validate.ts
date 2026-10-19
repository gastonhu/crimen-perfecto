// Valida todos los casos de /puzzles: estructura, solución única, un solo culpable y dificultad estimada.
// Uso: npm run validate [-- archivo.json ...]
import { TECHNIQUE_NAME, clueText, deduce, estimateDifficulty, killerOf, solve, structuralErrors, type Technique } from '../src/engine';
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
  const techs = Object.entries(d.techniques)
    .map(([t, n]) => `${TECHNIQUE_NAME[t as Technique]}×${n}`)
    .join(', ');
  console.log(
    `${d.needsSearch ? '⚠' : '✓'} ${file}  ${p.size}x${p.size}  dificultad declarada ${p.difficulty} / calculada ${d.level}` +
      `  ${ms}ms  culpable: ${killerName}\n     ${d.steps} pasos: ${techs}` +
      (d.needsSearch ? '\n     ⚠ la deducción humana no alcanza: hay que adivinar. Agregá o cambiá pistas.' : ''),
  );
  if (p.difficulty !== d.level) console.log(`     ↳ conviene declarar "difficulty": ${d.level}`);
  if (process.env.VERBOSE) {
    for (const x of p.people) console.log(`     ${x.name}: ${clueText(p, x)}`);
    deduce(p).steps.forEach((s, i) => console.log(`     ${i + 1}. [${TECHNIQUE_NAME[s.technique]}] ${s.reason}`));
  }
}

console.log(`\n${entries.length - failed}/${entries.length} casos válidos`);
process.exit(failed ? 1 : 0);
