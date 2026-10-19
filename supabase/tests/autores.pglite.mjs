// Prueba de la migración de autores en PGlite. Igual que migraciones.pglite.mjs: copiar fuera del repo,
//   npm i @electric-sql/pglite && node autores.pglite.mjs <repo>/supabase/migrations
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const db = new PGlite({ extensions: { citext, pgcrypto } });
await db.exec(`create schema extensions; create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;`);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));

let fails = 0;
let passes = 0;
const ok = (cond, msg) => (cond ? passes++ : (fails++, console.error('✗', msg)));
const val = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
const err = async (sql, params = []) => {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
};
const as = async (role, sub) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
  await db.exec(`set role ${role}`);
};

const AUTOR = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users values ($1, 'autor@example.com'), ($2, 'otro@example.com')`, [AUTOR, OTRO]);
await db.query(`insert into cp_authors (user_id, email) values ($1, 'autor@example.com')`, [AUTOR]);

const caso = {
  schemaVersion: 2, id: 'prueba-01', theme: 'hotel', title: 'Caso de prueba', size: 3, difficulty: 1, story: 'Una historia de prueba.',
  rooms: ['AAB', 'AAB', 'CCB'], roomNames: { A: 'la sala', B: 'el balcón', C: 'el pasillo' }, objects: ['C..', '...', '...'],
  people: [
    { id: 'vera', name: 'Vera', role: 'victim', avatar: '🎻', clue: { rules: [['onObject', 'C']] } },
    { id: 'xavi', name: 'Xavi', role: 'suspect', avatar: '🧥', clue: { rules: [['inRoom', 'A']] } },
    { id: 'yael', name: 'Yael', role: 'suspect', avatar: '🌂', clue: { rules: [['inRoom', 'B']] } },
  ],
};
const sol = { vera: { r: 0, c: 0 }, xavi: { r: 1, c: 1 }, yael: { r: 2, c: 2 } };
const hash = 'a'.repeat(64);
const publish = (c = caso, s = sol, k = 'xavi', h = hash) =>
  `select cp_author_publish('${JSON.stringify(c)}'::jsonb, '${JSON.stringify(s)}'::jsonb, '${k}', '${h}')`;

// anon no puede usar la API de autores ni ver tablas nuevas
await as('anon');
ok((await err(publish()))?.includes('permission denied'), 'anon no puede publicar');
ok((await err(`select * from cp_authors`))?.includes('permission denied'), 'anon no lee cp_authors');
ok((await err(`select * from cp_drafts`))?.includes('permission denied'), 'anon no lee cp_drafts');
ok((await val(`select count(*)::int from cp_public_puzzles`)) === 0, 'vista pública vacía al principio');

// autenticado pero no autor
await as('authenticated', OTRO);
ok((await err(publish()))?.includes('permiso de autor'), 'usuario sin permiso de autor no publica');
ok((await err(`select cp_author_whoami()`))?.includes('permiso de autor'), 'whoami rechaza a quien no es autor');
ok((await err(`select cp_author_list_drafts()`))?.includes('permiso de autor'), 'no-autor no lista borradores');
await as('authenticated', null);
ok((await err(`select cp_author_whoami()`))?.includes('permiso de autor'), 'sin JWT no hay autor');

// autor
await as('authenticated', AUTOR);
ok((await val(`select cp_author_whoami()`))?.email === 'autor@example.com', 'whoami del autor');
ok((await err(`select cp_require_author()`))?.includes('permission denied'), 'el helper interno no es invocable');
const r = await val(publish());
ok(r?.id === 'prueba-01' && r?.content_hash === hash, 'publica un caso');
ok((await err(publish({ ...caso, id: 'Mal ID' })))?.includes('identificador'), 'rechaza id inválido');
ok((await err(publish({ ...caso, size: 12 })))?.includes('fuera de rango'), 'rechaza tamaño fuera de rango');
ok((await err(publish(caso, { vera: sol.vera, xavi: sol.xavi })))?.includes('exactamente a las personas'), 'rechaza solución incompleta');
ok((await err(publish(caso, sol, 'nadie')))?.includes('culpable'), 'rechaza culpable inexistente');
ok((await err(publish(caso, sol, 'xavi', 'corto')))?.includes('hash'), 'rechaza hash inválido');
const lista = await val(`select cp_author_list()`);
ok(lista.length === 1 && lista[0].published === true && lista[0].title === 'Caso de prueba', 'lista de autor');
const got = await val(`select cp_author_get('prueba-01')`);
ok(got.solution.xavi.c === 1 && got.killer === 'xavi' && got.puzzle.title === 'Caso de prueba', 'el autor ve el caso con solución');

// el público ve el caso sin solución, y el juego puede jugarlo
await as('anon');
const pub = (await db.query(`select * from cp_public_puzzles`)).rows;
ok(pub.length === 1 && pub[0].data.id === 'prueba-01' && pub[0].content_hash === hash, 'vista pública muestra el caso');
ok(!JSON.stringify(pub).includes('"r"'), 'la vista pública no expone la solución');
const tok = await val(`select cp_register('jugador_1', '4821')`);
const intento = await val(`select cp_start_attempt($1, 'prueba-01')`, [tok]);
const res = await val(`select cp_submit($1, $2, $3, 'xavi', $4)`, [tok, intento.attempt_id, sol, hash]);
ok(res.correct === true, 'un jugador resuelve el caso publicado desde el editor');

// republicar con otra lógica y despublicar
await as('authenticated', AUTOR);
await val(publish({ ...caso, title: 'Caso de prueba v2' }, sol, 'xavi', 'b'.repeat(64)));
ok((await val(`select cp_author_get('prueba-01')`)).content_hash === 'b'.repeat(64), 'republicar actualiza el hash');
await db.query(`select cp_author_unpublish('prueba-01')`);
ok((await err(`select cp_author_unpublish('no-existe')`))?.includes('No existe'), 'despublicar inexistente falla');
await as('anon');
ok((await val(`select count(*)::int from cp_public_puzzles`)) === 0, 'despublicado no aparece en la vista pública');
await as('authenticated', AUTOR);
ok((await val(`select cp_author_list()`))[0].published === false, 'el autor lo sigue viendo despublicado');

// borradores
const at = await val(`select cp_author_save_draft('k1', '{"draft": {"id": "x"}}'::jsonb)`);
ok(at, 'guarda borrador');
ok((await val(`select cp_author_list_drafts()`)).length === 1, 'lista borradores');
ok((await val(`select cp_author_get_draft('k1')`)).data.draft.id === 'x', 'lee borrador');
ok((await err(`select cp_author_save_draft('mala clave!', '{}'::jsonb)`)) !== null, 'rechaza clave inválida');
await as('authenticated', OTRO);
ok((await err(`select cp_author_get_draft('k1')`))?.includes('permiso de autor'), 'otro usuario no ve borradores ajenos');
await as('authenticated', AUTOR);
await db.query(`select cp_author_delete_draft('k1')`);
ok((await val(`select cp_author_list_drafts()`)).length === 0, 'borra borrador');

console.log(`\n${passes} ok, ${fails} fallas`);
process.exit(fails ? 1 : 0);
