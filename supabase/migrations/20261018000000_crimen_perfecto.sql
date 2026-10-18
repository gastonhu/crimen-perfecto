-- Crimen Perfecto: jugadores (alias + PIN), intentos, soluciones privadas y marcador público.
-- Las tablas no tienen políticas RLS: anon no puede leerlas ni escribirlas. Todo pasa por funciones
-- `security definer` y por dos vistas de ranking de solo lectura.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------- Tablas ----------
create table public.cp_players (
  id uuid primary key default gen_random_uuid(),
  alias extensions.citext not null unique
    check (alias ~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_.-]{3,20}$'),
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table public.cp_sessions (
  token_hash text primary key,
  player_id uuid not null references public.cp_players on delete cascade,
  created_at timestamptz not null default now()
);

create table public.cp_banned_words (word text primary key);
insert into public.cp_banned_words (word) values
  ('admin'), ('moderador'), ('puta'), ('puto'), ('mierda'), ('nazi'), ('pelotud'), ('boludo'), ('forro'), ('concha');

create table public.cp_puzzles (
  id text primary key,
  theme text not null,
  size int not null check (size between 3 and 9),
  difficulty int not null check (difficulty between 1 and 5),
  published_at timestamptz not null default now()
);

create table public.cp_solutions (
  puzzle_id text primary key references public.cp_puzzles on delete cascade,
  placements jsonb not null,
  killer text not null
);

create table public.cp_attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.cp_players on delete cascade,
  puzzle_id text not null references public.cp_puzzles on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  hints_used int not null default 0,
  wrong_submits int not null default 0,
  solved boolean not null default false,
  score int,
  unique (player_id, puzzle_id)
);

create table public.cp_rate (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);

alter table public.cp_players enable row level security;
alter table public.cp_sessions enable row level security;
alter table public.cp_banned_words enable row level security;
alter table public.cp_puzzles enable row level security;
alter table public.cp_solutions enable row level security;
alter table public.cp_attempts enable row level security;
alter table public.cp_rate enable row level security;

revoke all on public.cp_players, public.cp_sessions, public.cp_banned_words, public.cp_puzzles,
  public.cp_solutions, public.cp_attempts, public.cp_rate from anon, authenticated;

-- ---------- Helpers internos (no expuestos) ----------
create or replace function public.cp_client_ip() returns text
language sql stable as $$
  select coalesce(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1), 'desconocida');
$$;

create or replace function public.cp_rate_check(p_key text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hits int;
begin
  insert into cp_rate (key, window_start)
  values (p_key, date_bin(p_window, now(), timestamptz '2000-01-01'))
  on conflict (key, window_start) do update set hits = cp_rate.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'Demasiados intentos. Esperá un rato y probá de nuevo.';
  end if;
end $$;

create or replace function public.cp_player(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  select player_id into v_id from cp_sessions where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if v_id is null then
    raise exception 'Sesión inválida. Volvé a ingresar.';
  end if;
  return v_id;
end $$;

create or replace function public.cp_new_session(p_player uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  insert into cp_sessions (token_hash, player_id) values (encode(digest(v_token, 'sha256'), 'hex'), p_player);
  return v_token;
end $$;

-- Puntaje: idéntico a `score()` de src/api/types.ts.
create or replace function public.cp_score(p_difficulty int, p_size int, p_seconds int, p_hints int, p_wrong int) returns int
language sql immutable as $$
  select greatest(10, round(
    100 * p_difficulty
    * least(1.5, greatest(0.5, (p_size * p_size * 8)::numeric / greatest(p_seconds, 1)))
    * greatest(0.3, 1 - 0.15 * p_hints - 0.10 * p_wrong)
  ))::int;
$$;

-- ---------- API pública (RPC) ----------
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
  if exists (select 1 from cp_banned_words where lower(p_alias) like '%' || word || '%') then
    raise exception 'Ese alias no está permitido.';
  end if;
  begin
    insert into cp_players (alias, pin_hash) values (p_alias, crypt(p_pin, gen_salt('bf'))) returning id into v_id;
  exception when unique_violation then
    raise exception 'Ese alias ya está en uso.';
  end;
  return cp_new_session(v_id);
end $$;

create or replace function public.cp_login(p_alias text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_player cp_players;
begin
  perform cp_rate_check('login:' || lower(btrim(p_alias)), 10, interval '15 minutes');
  select * into v_player from cp_players where alias = btrim(p_alias)::citext;
  if v_player.id is null or v_player.pin_hash <> crypt(p_pin, v_player.pin_hash) then
    raise exception 'Alias o PIN incorrectos.';
  end if;
  return cp_new_session(v_player.id);
end $$;

create or replace function public.cp_start_attempt(p_token text, p_puzzle_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
  a cp_attempts;
begin
  if not exists (select 1 from cp_puzzles where id = p_puzzle_id) then
    raise exception 'Este caso todavía no está publicado.';
  end if;
  insert into cp_attempts (player_id, puzzle_id) values (v_player, p_puzzle_id)
  on conflict (player_id, puzzle_id) do nothing;
  select * into a from cp_attempts where player_id = v_player and puzzle_id = p_puzzle_id;
  return json_build_object(
    'attempt_id', a.id, 'started_at', a.started_at, 'hints_used', a.hints_used,
    'wrong_submits', a.wrong_submits, 'solved', a.solved, 'score', a.score,
    'seconds', extract(epoch from a.finished_at - a.started_at)::int
  );
end $$;

create or replace function public.cp_use_hint(p_token text, p_attempt_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update cp_attempts set hints_used = hints_used + 1
  where id = p_attempt_id and player_id = cp_player(p_token) and not solved;
end $$;

create or replace function public.cp_submit(p_token text, p_attempt_id uuid, p_placements jsonb, p_killer text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
  a cp_attempts;
  s cp_solutions;
  pz cp_puzzles;
  v_correct boolean;
  v_seconds int;
begin
  perform cp_rate_check('submit:' || v_player, 30, interval '10 minutes');
  select * into a from cp_attempts where id = p_attempt_id and player_id = v_player for update;
  if a.id is null then
    raise exception 'Intento inexistente.';
  end if;
  select * into s from cp_solutions where puzzle_id = a.puzzle_id;
  select * into pz from cp_puzzles where id = a.puzzle_id;
  v_correct := p_killer = s.killer and p_placements = s.placements;

  if a.solved then
    return json_build_object('correct', v_correct, 'wrong_submits', a.wrong_submits, 'score', a.score,
      'seconds', extract(epoch from a.finished_at - a.started_at)::int, 'killer', s.killer);
  end if;

  if not v_correct then
    update cp_attempts set wrong_submits = wrong_submits + 1 where id = a.id returning * into a;
    return json_build_object('correct', false, 'wrong_submits', a.wrong_submits);
  end if;

  v_seconds := extract(epoch from now() - a.started_at)::int;
  update cp_attempts
    set solved = true, finished_at = now(),
        score = cp_score(pz.difficulty, pz.size, v_seconds, a.hints_used, a.wrong_submits)
    where id = a.id returning * into a;
  return json_build_object('correct', true, 'wrong_submits', a.wrong_submits, 'score', a.score,
    'seconds', v_seconds, 'killer', s.killer);
end $$;

create or replace function public.cp_solved_puzzles(p_token text) returns text[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(puzzle_id), '{}') from cp_attempts where player_id = cp_player(p_token) and solved;
$$;

-- ---------- Ranking público (solo alias y números) ----------
create or replace view public.cp_leaderboard as
  select p.alias::text as alias, sum(a.score)::int as points, count(*)::int as solved
  from cp_attempts a join cp_players p on p.id = a.player_id
  where a.solved
  group by p.alias
  order by points desc, solved desc;

create or replace view public.cp_puzzle_leaderboard as
  select a.puzzle_id, p.alias::text as alias,
         extract(epoch from a.finished_at - a.started_at)::int as seconds, a.score
  from cp_attempts a join cp_players p on p.id = a.player_id
  where a.solved;

-- ---------- Permisos ----------
revoke execute on function public.cp_client_ip(), public.cp_rate_check(text, int, interval),
  public.cp_player(text), public.cp_new_session(uuid), public.cp_score(int, int, int, int, int)
  from public, anon, authenticated;
revoke execute on function public.cp_register(text, text), public.cp_login(text, text),
  public.cp_start_attempt(text, text), public.cp_use_hint(text, uuid),
  public.cp_submit(text, uuid, jsonb, text), public.cp_solved_puzzles(text)
  from public;
grant execute on function public.cp_register(text, text), public.cp_login(text, text),
  public.cp_start_attempt(text, text), public.cp_use_hint(text, uuid),
  public.cp_submit(text, uuid, jsonb, text), public.cp_solved_puzzles(text)
  to anon, authenticated;
revoke all on public.cp_leaderboard, public.cp_puzzle_leaderboard from anon, authenticated;
grant select on public.cp_leaderboard, public.cp_puzzle_leaderboard to anon, authenticated;
