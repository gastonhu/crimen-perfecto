// Prueba de las migraciones de Crimen Perfecto en PGlite (Postgres en WASM), sin tocar la base real.
// PGlite no es dependencia del proyecto: copiá este archivo a un directorio fuera del repo y ahí
//   npm init -y && npm i @electric-sql/pglite && node migraciones.pglite.mjs <repo>/supabase/migrations
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const db = new PGlite({ extensions: { citext, pgcrypto } });
await db.exec(`create schema extensions; create role anon; create role authenticated;
  -- Stub del schema auth de Supabase (PGlite no lo trae): usuarios y auth.uid() desde el JWT simulado.
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;`);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(dir, f), 'utf8'));
  console.log('aplicada', f);
}

let fails = 0;
let passes = 0;
const ok = (cond, msg) => {
  if (cond) passes++;
  else {
    fails++;
    console.error('✗', msg);
  }
};
const asAnon = () => db.exec('set role anon');
const asAdmin = () => db.exec('reset role');
const canon = (x) => (x && typeof x === 'object' ? (Array.isArray(x) ? x.map(canon) : Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])]))) : x);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const val = async (sql, params = []) => Object.values((await one(sql, params)) ?? {})[0];
const err = async (sql, params = []) => {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
};

// ---------- Datos: un caso publicado ----------
const SOL = { ruiz: { r: 4, c: 3 }, ana: { r: 0, c: 1 }, bruno: { r: 1, c: 2 }, clara: { r: 3, c: 4 }, diego: { r: 2, c: 0 } };
await db.query(`insert into cp_puzzles (id, theme, size, difficulty, content_hash) values ('hotel-01', 'hotel', 5, 1, 'h1')`);
await db.query(`insert into cp_solutions (puzzle_id, placements, killer) values ('hotel-01', $1, 'clara')`, [SOL]);
await db.query(`insert into cp_puzzles (id, theme, size, difficulty) values ('tren-01', 'tren', 6, 2)`);
await db.query(`insert into cp_solutions (puzzle_id, placements, killer) values ('tren-01', '{}', 'x')`);

await asAnon();

// ---------- Registro, login y sesiones ----------
const t1 = await val(`select cp_register('ana', '1234')`);
ok(typeof t1 === 'string' && t1.length === 48, 'registro devuelve token');
ok((await val(`select cp_login('ana', '9999')`)) === null, 'login con PIN incorrecto devuelve null');
ok((await val(`select cp_login('nadie', '1234')`)) === null, 'login con alias inexistente devuelve null');
const t2 = await val(`select cp_login('ANA', '1234')`);
ok(typeof t2 === 'string' && t2 !== t1, 'login correcto (alias sin distinguir mayúsculas) devuelve otro token');
ok(Array.isArray(await val(`select cp_solved_puzzles($1)`, [t1])), 'token válido sirve');

await db.query(`select cp_logout($1)`, [t1]);
ok(/Sesión inválida/.test(await err(`select cp_solved_puzzles($1)`, [t1])), 'después de logout el token no sirve');
ok(Array.isArray(await val(`select cp_solved_puzzles($1)`, [t2])), 'logout no afecta otras sesiones');
ok((await err(`select cp_logout('cualquiera')`)) === null, 'logout con token desconocido no falla');
ok((await err(`select cp_logout(null)`)) === null, 'logout con null no falla');
ok(/Sesión inválida/.test(await err(`select cp_solved_puzzles(null)`)), 'token null no sirve');

// Vencimiento y renovación
await asAdmin();
const h2 = await val(`select encode(extensions.digest($1, 'sha256'), 'hex')`, [t2]);
await db.query(`update cp_sessions set last_used_at = now() - interval '2 hours' where token_hash = $1`, [h2]);
await asAnon();
await db.query(`select cp_solved_puzzles($1)`, [t2]);
await asAdmin();
ok((await val(`select now() - last_used_at < interval '1 minute' from cp_sessions where token_hash = $1`, [h2])) === true, 'usar la sesión la renueva');
await db.query(`update cp_sessions set last_used_at = now() - interval '91 days' where token_hash = $1`, [h2]);
await asAnon();
ok(/Sesión inválida/.test(await err(`select cp_solved_puzzles($1)`, [t2])), 'sesión de más de 90 días sin uso vence');
ok(/Sesión inválida/.test(await err(`select cp_get_attempt($1, 'hotel-01')`, [t2])), 'cp_get_attempt también valida la sesión aunque no haya intento');
const t3 = await val(`select cp_login('ana', '1234')`);
await asAdmin();
ok((await val(`select count(*)::int from cp_sessions where token_hash = $1`, [h2])) === 0, 'un login nuevo limpia las sesiones vencidas');
await asAnon();

// ---------- Progreso ----------
const bob = await val(`select cp_register('bruno_b', '4321')`);
ok((await val(`select cp_get_attempt($1, 'hotel-01')`, [t3])) === null, 'sin intento, get devuelve null');
const a = await val(`select cp_start_attempt($1, 'hotel-01', false)`, [t3]);
ok(a.board === null && a.board_updated_at === null, 'intento nuevo sin tablero');
ok(a.content_hash === 'h1', 'el intento trae el hash del caso');
const board = { placements: { ana: { r: 0, c: 1 } }, marks: ['1,1'], notes: { '2,2': ['bruno'] } };
const savedAt = await val(`select cp_save_progress($1, $2, $3)`, [t3, a.attempt_id, board]);
ok(savedAt instanceof Date, 'guardar progreso devuelve la hora del servidor');
const a2 = await val(`select cp_get_attempt($1, 'hotel-01')`, [t3]);
ok(same(a2.board, board) && a2.board_updated_at, 'get devuelve el tablero guardado');
const a3 = await val(`select cp_start_attempt($1, 'hotel-01', true)`, [t3]);
ok(a3.board && a3.strict === false, 'start de un intento existente devuelve el tablero y no cambia el modo');
ok(/Intento inexistente/.test(await err(`select cp_save_progress($1, $2, $3)`, [bob, a.attempt_id, board])), 'no se puede guardar en el intento de otro');
ok(/Sesión inválida/.test(await err(`select cp_save_progress('falso', $1, $2)`, [a.attempt_id, board])), 'no se puede guardar con token falso');
ok(/Progreso inválido/.test(await err(`select cp_save_progress($1, $2, '[1,2]')`, [t3, a.attempt_id])), 'progreso que no es objeto se rechaza');
const big = { placements: {}, marks: Array.from({ length: 3000 }, (_, i) => `${i},${i}`), notes: {} };
ok(/demasiado grande/.test(await err(`select cp_save_progress($1, $2, $3)`, [t3, a.attempt_id, big])), 'progreso enorme se rechaza');
await asAdmin();
ok((await val(`select board->'marks'->>0 from cp_attempts where id = $1`, [a.attempt_id])) === '1,1', 'los rechazos no pisan el tablero');
await db.query(`delete from cp_rate`);
await asAnon();
let rateErr = null;
for (let i = 0; i < 45 && !rateErr; i++) rateErr = await err(`select cp_save_progress($1, $2, $3)`, [t3, a.attempt_id, board]);
ok(/Demasiados intentos/.test(rateErr ?? ''), 'guardar progreso tiene límite de frecuencia');

// ---------- Ayudas ----------
await db.query(`select cp_use_hint($1, $2)`, [t3, a.attempt_id]);
ok((await val(`select cp_get_attempt($1, 'hotel-01')`, [t3])).hints_used === 1, 'ayuda suma 1');
await db.query(`select cp_use_hint($1, $2)`, [bob, a.attempt_id]);
ok((await val(`select cp_get_attempt($1, 'hotel-01')`, [t3])).hints_used === 1, 'ayuda con token ajeno no suma');
ok(/Sesión inválida/.test(await err(`select cp_use_hint('falso', gen_random_uuid())`)), 'ayuda con token falso falla');
ok(/Sesión inválida/.test(await err(`select cp_logout($1); select cp_solved_puzzles($1)`.split(';')[1], ['falso'])), 'solved_puzzles con token falso falla aunque no haya intentos');

// ---------- Envío y hash ----------
const wrong = { ...SOL, ana: { r: 0, c: 0 } };
ok(/Este caso cambió/.test(await err(`select cp_submit($1, $2, $3, 'clara', 'otro-hash')`, [t3, a.attempt_id, SOL])), 'envío con hash distinto se rechaza');
ok((await val(`select cp_get_attempt($1, 'hotel-01')`, [t3])).wrong_submits === 0, 'el rechazo por hash no cuenta como error');
const w = await val(`select cp_submit($1, $2, $3, 'clara', 'h1')`, [t3, a.attempt_id, wrong]);
ok(w.correct === false && w.wrong_submits === 1, 'envío incorrecto suma un error');
const legacy = await val(`select cp_submit($1, $2, $3, 'bruno')`, [t3, a.attempt_id, SOL]);
ok(legacy.correct === false && legacy.wrong_submits === 2, 'la firma vieja de 4 argumentos sigue andando');
await asAdmin();
await db.query(`delete from cp_rate`);
await asAnon();
const r = await val(`select cp_submit(p_token => $1, p_attempt_id => $2, p_placements => $3, p_killer => 'clara', p_content_hash => 'h1')`, [t3, a.attempt_id, SOL]);
ok(r.correct === true && r.score > 0 && r.killer === 'clara', 'envío correcto con hash');
ok(/ya está resuelto/.test(await err(`select cp_save_progress($1, $2, $3)`, [t3, a.attempt_id, board])), 'no se puede guardar progreso en un intento resuelto');
const solvedA = await val(`select cp_get_attempt($1, 'hotel-01')`, [t3]);
ok(solvedA.solved && same(solvedA.board.placements, SOL) && solvedA.board.marks.length === 1, 'al resolver, el tablero guardado queda con la solución');
const again = await val(`select cp_submit($1, $2, $3, 'clara')`, [t3, a.attempt_id, SOL]);
ok(again.correct && again.score === r.score, 'reenviar un caso resuelto devuelve el mismo puntaje');
// Caso sin hash publicado: no se valida
const b = await val(`select cp_start_attempt($1, 'tren-01')`, [t3]);
ok(b.content_hash === null, 'caso sin hash devuelve null');
ok((await val(`select cp_submit($1, $2, '{}', 'x', 'loquesea')`, [t3, b.attempt_id])).correct === true, 'si el caso no tiene hash no se compara');

// ---------- Vista de hash ----------
const meta = (await db.query(`select * from cp_puzzle_meta order by id`)).rows;
ok(meta.length === 2 && meta[0].content_hash === 'h1' && meta[0].difficulty === 1 && Object.keys(meta[0]).length === 3, 'cp_puzzle_meta: id, difficulty, content_hash');
ok((await db.query(`select * from cp_leaderboard`)).rows.length === 1, 'ranking sigue legible');

// ---------- Login: el límite cuenta los fallos ----------
await asAdmin();
await db.query(`delete from cp_rate`);
await asAnon();
for (let i = 0; i < 10; i++) await db.query(`select cp_login('ana', '0000')`);
ok(/Demasiados intentos/.test(await err(`select cp_login('ana', '1234')`)), 'tras 10 PIN incorrectos, el login queda bloqueado');
await asAdmin();
ok((await val(`select hits from cp_rate where key = 'login-dia:ana'`)) === 10, 'contador diario de login');
await db.query(`delete from cp_rate`);

// ---------- Limpieza de cp_rate ----------
await db.query(`insert into cp_rate (key, window_start, hits) select 'viejo:' || g, now() - interval '3 days', 1 from generate_series(1, 50) g`);
await db.query(`insert into cp_rate (key, window_start, hits) values ('reciente', now() - interval '1 hour', 1)`);
for (let i = 0; i < 400; i++) await db.query(`select cp_rate_check('test:' || $1, 1000, interval '1 hour')`, [i % 3]);
ok((await val(`select count(*)::int from cp_rate where key like 'viejo:%'`)) === 0, 'cp_rate_check borra ventanas viejas');
ok((await val(`select count(*)::int from cp_rate where key = 'reciente'`)) === 1, 'cp_rate_check no borra ventanas recientes');

// ---------- Alias prohibidos ----------
const blocked = ['puto', 'PUTA', 'hijo_de_puta', 'pelotudo', 'Boluda', 'pu7o', 'p.u.t.a', 'fuck_you', 'mierda123', 'nazi',
  'Forro', 'la_concha', 'culo', 'el_culo', 'Shit', 'admin', 'moderador', 'trolo', 'puta99', 'cuLiAo', 'NAZIS', 'm1erda', 'sorete', 'verga'];
const allowed = ['ana', 'puchito', 'concepción', 'Concepción', 'detective_42', 'computadora', 'Vergara', 'película',
  'Nazira', 'Ortega', 'controlo', 'diputado', 'Mariano', 'pijama', 'Analía', 'Ñandú', 'calculo', 'detective_prueba',
  'Fernanda', 'Pedro.Gil', 'Marcos-1', 'conchita', 'tortilleria', 'Sherlock', 'Poirot', 'grapes'];
await asAdmin();
for (const x of blocked) ok((await val(`select cp_alias_banned($1)`, [x])) === true, `alias prohibido: ${x}`);
for (const x of allowed) ok((await val(`select cp_alias_banned($1)`, [x])) === false, `alias permitido: ${x}`);
await asAnon();
ok(/no está permitido/.test(await err(`select cp_register('pelotudo', '1234')`)), 'cp_register rechaza alias prohibido');
ok(typeof (await val(`select cp_register('puchito', '1234')`)) === 'string', 'cp_register acepta puchito');
ok(typeof (await val(`select cp_register('concepción', '1234')`)) === 'string', 'cp_register acepta concepción');
ok(typeof (await val(`select cp_register('detective_42', '1234')`)) === 'string', 'cp_register acepta detective_42');
ok(/ya está en uso/.test(await err(`select cp_register('Ana', '1234')`)), 'alias repetido');

// ---------- Tablas y helpers inaccesibles para anon ----------
for (const t of ['cp_players', 'cp_sessions', 'cp_attempts', 'cp_solutions', 'cp_puzzles', 'cp_rate', 'cp_banned_words'])
  ok(/permission denied/.test(await err(`select * from ${t} limit 1`)), `anon no lee ${t}`);
ok(/permission denied/.test(await err(`update cp_attempts set score = 9999`)), 'anon no escribe cp_attempts');
ok(/permission denied/.test(await err(`insert into cp_sessions (token_hash, player_id) values ('x', gen_random_uuid())`)), 'anon no escribe cp_sessions');
ok(/permission denied/.test(await err(`delete from cp_rate`)), 'anon no borra cp_rate');
for (const f of [`cp_alias_banned('x')`, `cp_rate_check('x', 1, interval '1 hour')`, `cp_player('x')`, `cp_new_session(gen_random_uuid())`, `cp_client_ip()`])
  ok(/permission denied/.test(await err(`select ${f}`)), `anon no ejecuta ${f}`);
await db.exec('set role authenticated');
ok(Array.isArray(await val(`select cp_solved_puzzles($1)`, [t3])), 'authenticated también puede usar la API');
ok((await db.query(`select * from cp_puzzle_meta`)).rows.length === 2, 'authenticated lee cp_puzzle_meta');

console.log(`\n${passes} ok, ${fails} fallas`);
process.exit(fails ? 1 : 0);
