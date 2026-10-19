// Publica casos en Supabase: metadatos en cp_puzzles y la solución (calculada con el solver) en cp_solutions.
// Uso: npm run publish-puzzle -- puzzles/hotel/hotel-01.json [...]   (sin argumentos: todos)
// Requiere VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env (la service key nunca va al repo ni al front).
import { createClient } from '@supabase/supabase-js';
import { killerOf, logicHash, solve, structuralErrors } from '../src/engine';
import { loadPuzzles, readPuzzle } from './lib';
import { schemaErrors } from './schema';

process.loadEnvFile?.('.env');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env');
const db = createClient(url, key, { auth: { persistSession: false } });

const files = process.argv.slice(2);
const entries = files.length ? files.map((file) => ({ file, puzzle: readPuzzle(file) })) : loadPuzzles();

for (const { file, puzzle: p } of entries) {
  const shape = schemaErrors(p);
  const errs = shape.length ? shape : structuralErrors(p);
  const sols = errs.length ? [] : solve(p, { limit: 2 });
  if (errs.length || sols.length !== 1) {
    console.error(`✗ ${file}: ${errs.join('; ') || `${sols.length} soluciones`} — no se publica`);
    process.exitCode = 1;
    continue;
  }
  const killer = killerOf(p, sols[0])!;
  const meta = await db
    .from('cp_puzzles')
    .upsert({
      id: p.id, theme: p.theme, size: p.size, difficulty: p.difficulty, content_hash: await logicHash(p),
      data: p, title: p.title, published: true, updated_at: new Date().toISOString(),
    });
  if (meta.error) throw meta.error;
  const sol = await db.from('cp_solutions').upsert({ puzzle_id: p.id, placements: sols[0], killer });
  if (sol.error) throw sol.error;
  console.log(`✓ ${p.id} publicado`);
}
