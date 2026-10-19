-- Fase B: sesiones que vencen y se pueden cerrar, progreso del tablero en el servidor, hash del caso a la vista,
-- limpieza de cp_rate, login con límite que de verdad cuenta los fallos y más alias prohibidos.
--
-- Nota: dentro de esta migración las columnas nuevas se leen siempre por nombre (nada de `a cp_attempts` +
-- `select *`): un tipo fila compilado antes del `alter table` no las ve (pasó en PGlite).

-- ---------- Sesiones: vencen a los 90 días sin uso y se pueden revocar ----------
alter table public.cp_sessions add column if not exists last_used_at timestamptz not null default now();
create index if not exists cp_sessions_last_used_idx on public.cp_sessions (last_used_at);
create index if not exists cp_sessions_player_idx on public.cp_sessions (player_id);

create or replace function public.cp_player(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_id uuid;
  v_used timestamptz;
begin
  select s.player_id, s.last_used_at into v_id, v_used from cp_sessions s where s.token_hash = v_hash;
  if v_id is null or v_used < now() - interval '90 days' then
    raise exception 'Sesión inválida. Volvé a ingresar.';
  end if;
  -- Se renueva al usarla, pero a lo sumo una vez por hora para no escribir en cada llamada.
  if v_used < now() - interval '1 hour' then
    update cp_sessions set last_used_at = now() where token_hash = v_hash;
  end if;
  return v_id;
end $$;

create or replace function public.cp_new_session(p_player uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  -- Limpieza: sesiones vencidas de cualquiera y, de este jugador, solo las 20 más recientes.
  delete from cp_sessions where last_used_at < now() - interval '90 days';
  delete from cp_sessions
  where player_id = p_player
    and token_hash not in (
      select s.token_hash from cp_sessions s where s.player_id = p_player order by s.last_used_at desc limit 19
    );
  insert into cp_sessions (token_hash, player_id) values (encode(digest(v_token, 'sha256'), 'hex'), p_player);
  return v_token;
end $$;

-- Antes era SQL puro y, si el jugador no tenía intentos, cp_player ni se evaluaba: un token inválido devolvía {}.
-- Ahora siempre valida (el front lo usa al arrancar para detectar una sesión vencida).
create or replace function public.cp_solved_puzzles(p_token text) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
begin
  return (select coalesce(array_agg(t.puzzle_id), '{}') from cp_attempts t where t.player_id = v_player and t.solved);
end $$;

-- Igual que arriba: la sesión se valida antes de mirar el intento (si no existía, cp_player no se evaluaba).
create or replace function public.cp_use_hint(p_token text, p_attempt_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
begin
  if exists (select 1 from cp_attempts t where t.id = p_attempt_id and t.player_id = v_player and t.strict) then
    raise exception 'En modo estricto no hay ayudas.';
  end if;
  update cp_attempts set hints_used = hints_used + 1
  where id = p_attempt_id and player_id = v_player and not solved;
end $$;

create or replace function public.cp_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from cp_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ---------- cp_rate: limpieza sin pg_cron ----------
create index if not exists cp_rate_window_idx on public.cp_rate (window_start);

create or replace function public.cp_rate_check(p_key text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hits int;
begin
  -- Alrededor de 1 de cada 50 llamadas borra las ventanas viejas (la más larga que se usa es de un día).
  if random() < 0.02 then
    delete from cp_rate where window_start < now() - interval '2 days';
  end if;
  insert into cp_rate (key, window_start)
  values (p_key, date_bin(p_window, now(), timestamptz '2000-01-01'))
  on conflict (key, window_start) do update set hits = cp_rate.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'Demasiados intentos. Esperá un rato y probá de nuevo.';
  end if;
end $$;

-- ---------- Login ----------
-- Antes, un PIN incorrecto hacía `raise`, y el error deshacía también el contador de cp_rate_check: el límite por
-- alias nunca contaba los fallos. Ahora devuelve null (el front lo traduce a "Alias o PIN incorrectos.") y se suma
-- un tope diario por alias.
create or replace function public.cp_login(p_alias text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_pin_hash text;
begin
  perform cp_rate_check('login:' || lower(btrim(p_alias)), 10, interval '15 minutes');
  perform cp_rate_check('login-dia:' || lower(btrim(p_alias)), 40, interval '1 day');
  select p.id, p.pin_hash into v_id, v_pin_hash from cp_players p where p.alias = btrim(p_alias)::citext;
  if v_id is null or v_pin_hash <> crypt(coalesce(p_pin, ''), v_pin_hash) then
    return null;
  end if;
  return cp_new_session(v_id);
end $$;

-- ---------- Alias prohibidos ----------
-- `whole`: la palabra tiene que aparecer sola (entre separadores o como alias entero) porque como pedazo de otra
-- palabra es inocente ("computadora", "película", "Vergara", "controlo"). El resto se busca como substring.
alter table public.cp_banned_words add column if not exists whole boolean not null default false;

insert into public.cp_banned_words (word, whole) values
  -- castellano rioplatense
  ('puta', true), ('puto', true), ('putas', true), ('putos', true), ('putit', false), ('putaz', false),
  ('hdp', false), ('hijodeput', false), ('hijaputa', false), ('malparid', false),
  ('mierda', false), ('sorete', false), ('pelotud', false), ('bolud', false), ('forro', false), ('forra', true),
  ('concha', false), ('pajero', false), ('pajera', false), ('pija', true), ('chupapija', false), ('verga', true),
  ('chupaverga', false), ('poronga', false), ('garcha', false), ('choto', true), ('culo', true), ('orto', true),
  ('ojete', false), ('culiad', false), ('culiao', false), ('trolo', true), ('trola', true), ('trava', true),
  ('marica', true), ('maricon', false), ('tortillera', true), ('tortilleras', true), ('mogolic', false),
  ('sudaca', false), ('violador', false), ('pedofil', false),
  ('nazi', true), ('nazis', true), ('hitler', false), ('kkk', false),
  ('admin', false), ('moderador', false), ('moderator', false),
  -- inglés
  ('fuck', false), ('motherf', false), ('shit', false), ('bitch', false), ('cunt', false), ('nigger', false),
  ('nigga', false), ('faggot', false), ('fag', true), ('whore', false), ('slut', false), ('asshole', false),
  ('bastard', false), ('retard', false), ('rape', true), ('rapist', false), ('porn', false), ('wanker', false),
  ('twat', false), ('dickhead', false), ('cocksucker', false), ('pussy', false), ('penis', true)
on conflict (word) do update set whole = excluded.whole;

create or replace function public.cp_alias_banned(p_alias text) returns boolean
language sql stable security definer set search_path = public as $$
  with n as (
    select translate(lower(coalesce(p_alias, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'aeiouunaeiouun') as plain
  ), v as (
    select plain,
           translate(plain, '013457', 'oieast') as leet
    from n
  ), f as (
    select regexp_replace(plain, '[^a-z]', '', 'g') as letters,
           regexp_replace(leet, '[^a-z]', '', 'g') as leet_letters,
           regexp_split_to_array(plain, '[^a-z]+') || regexp_split_to_array(leet, '[^a-z]+') as tokens
    from v
  )
  select exists (
    select 1 from cp_banned_words w, f
    where case when w.whole
      then w.word = any (f.tokens) or w.word in (f.letters, f.leet_letters)
      else strpos(f.letters, w.word) > 0 or strpos(f.leet_letters, w.word) > 0
    end
  );
$$;

create or replace function public.cp_register(p_alias text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  perform cp_rate_check('register:' || cp_client_ip(), 10, interval '1 hour');
  p_alias := btrim(p_alias);
  if p_pin !~ '^\d{4,6}$' then
    raise exception 'El PIN debe tener de 4 a 6 dígitos.';
  end if;
  if p_alias !~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_.-]{3,20}$' then
    raise exception 'Alias inválido.';
  end if;
  if cp_alias_banned(p_alias) then
    raise exception 'Ese alias no está permitido.';
  end if;
  begin
    insert into cp_players (alias, pin_hash) values (p_alias, crypt(p_pin, gen_salt('bf'))) returning id into v_id;
  exception when unique_violation then
    raise exception 'Ese alias ya está en uso.';
  end;
  return cp_new_session(v_id);
end $$;

-- ---------- Progreso del tablero en el servidor ----------
alter table public.cp_attempts add column if not exists board jsonb;
alter table public.cp_attempts add column if not exists board_updated_at timestamptz;

create or replace function public.cp_save_progress(p_token text, p_attempt_id uuid, p_board jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
  v_solved boolean;
  v_at timestamptz := now();
begin
  perform cp_rate_check('progress:' || v_player, 40, interval '1 minute');
  if p_board is null or jsonb_typeof(p_board) <> 'object' then
    raise exception 'Progreso inválido.';
  end if;
  if octet_length(p_board::text) > 16384 then
    raise exception 'El progreso es demasiado grande para guardarlo.';
  end if;
  select t.solved into v_solved from cp_attempts t where t.id = p_attempt_id and t.player_id = v_player for update;
  if v_solved is null then
    raise exception 'Intento inexistente.';
  end if;
  if v_solved then
    raise exception 'Este caso ya está resuelto: el progreso no se modifica.';
  end if;
  update cp_attempts set board = p_board, board_updated_at = v_at where id = p_attempt_id;
  return v_at;
end $$;

-- El intento ahora trae el tablero guardado y el hash del caso publicado.
create or replace function public.cp_get_attempt(p_token text, p_puzzle_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
begin
  return (
    select json_build_object(
      'attempt_id', t.id, 'started_at', t.started_at, 'hints_used', t.hints_used,
      'wrong_submits', t.wrong_submits, 'solved', t.solved, 'score', t.score, 'strict', t.strict,
      'seconds', extract(epoch from t.finished_at - t.started_at)::int,
      'board', t.board, 'board_updated_at', t.board_updated_at, 'content_hash', pz.content_hash
    )
    from cp_attempts t join cp_puzzles pz on pz.id = t.puzzle_id
    where t.player_id = v_player and t.puzzle_id = p_puzzle_id
  );
end $$;

-- ---------- Envío: rechaza acusaciones hechas sobre otra versión del caso ----------
-- La firma cambia (p_content_hash, opcional para no romper el front anterior), así que hay que borrar la anterior.
drop function if exists public.cp_submit(text, uuid, jsonb, text);

create function public.cp_submit(
  p_token text, p_attempt_id uuid, p_placements jsonb, p_killer text, p_content_hash text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
  v_puzzle text;
  v_started timestamptz;
  v_finished timestamptz;
  v_hints int;
  v_wrong int;
  v_solved boolean;
  v_score int;
  v_strict boolean;
  v_difficulty int;
  v_size int;
  v_hash text;
  v_sol_placements jsonb;
  v_killer text;
  v_correct boolean;
  v_seconds int;
begin
  perform cp_rate_check('submit:' || v_player, 30, interval '10 minutes');
  select t.puzzle_id, t.started_at, t.finished_at, t.hints_used, t.wrong_submits, t.solved, t.score, t.strict
    into v_puzzle, v_started, v_finished, v_hints, v_wrong, v_solved, v_score, v_strict
    from cp_attempts t where t.id = p_attempt_id and t.player_id = v_player for update;
  if v_puzzle is null then
    raise exception 'Intento inexistente.';
  end if;
  select pz.difficulty, pz.size, pz.content_hash into v_difficulty, v_size, v_hash from cp_puzzles pz where pz.id = v_puzzle;
  if p_content_hash is not null and v_hash is not null and p_content_hash <> v_hash then
    raise exception 'Este caso cambió desde que abriste la página. Recargá para jugar la versión actual.';
  end if;
  select s.placements, s.killer into v_sol_placements, v_killer from cp_solutions s where s.puzzle_id = v_puzzle;
  v_correct := p_killer = v_killer and p_placements = v_sol_placements;

  if v_solved then
    return json_build_object('correct', v_correct, 'wrong_submits', v_wrong, 'score', v_score,
      'seconds', extract(epoch from v_finished - v_started)::int, 'killer', v_killer);
  end if;

  if not v_correct then
    update cp_attempts set wrong_submits = wrong_submits + 1 where id = p_attempt_id returning wrong_submits into v_wrong;
    return json_build_object('correct', false, 'wrong_submits', v_wrong);
  end if;

  v_seconds := extract(epoch from now() - v_started)::int;
  v_score := round(cp_score(v_difficulty, v_size, v_seconds, v_hints, v_wrong) * case when v_strict then 1.25 else 1 end)::int;
  -- El tablero guardado queda con la solución (por si el último guardado no llegó antes de acusar).
  update cp_attempts
    set solved = true, finished_at = now(), score = v_score,
        board = jsonb_set(coalesce(board, '{"marks": [], "notes": {}}'::jsonb), '{placements}', p_placements),
        board_updated_at = now()
    where id = p_attempt_id;
  return json_build_object('correct', true, 'wrong_submits', v_wrong, 'score', v_score,
    'seconds', v_seconds, 'killer', v_killer);
end $$;

-- ---------- Hash de cada caso publicado (para que el front detecte que su copia quedó vieja) ----------
create or replace view public.cp_puzzle_meta as
  select id, difficulty, content_hash from cp_puzzles;

-- ---------- Permisos ----------
-- Supabase da execute/select a anon por defecto en objetos nuevos: lo interno se revoca explícitamente.
revoke execute on function public.cp_alias_banned(text) from public, anon, authenticated;
revoke execute on function public.cp_logout(text), public.cp_save_progress(text, uuid, jsonb),
  public.cp_submit(text, uuid, jsonb, text, text)
  from public;
grant execute on function public.cp_logout(text), public.cp_save_progress(text, uuid, jsonb),
  public.cp_submit(text, uuid, jsonb, text, text)
  to anon, authenticated;
revoke all on public.cp_puzzle_meta from anon, authenticated;
grant select on public.cp_puzzle_meta to anon, authenticated;
