-- Autores y casos publicados desde el editor.
-- - Los autores ingresan con Supabase Auth (email + contraseña) y tienen que estar en cp_authors.
--   La lista se carga con `npm run add-author` (service role): ningún email queda en el repo.
-- - Los casos viven en la base: cp_puzzles.data guarda el caso v2 (sin solución) y la vista pública
--   cp_public_puzzles es lo que lista el juego. Publicar desde el editor no requiere deploy.
-- - Las funciones de autor solo se pueden llamar con un JWT de Supabase Auth (rol authenticated).

-- ---------- Tablas ----------
create table if not exists public.cp_authors (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.cp_puzzles add column if not exists data jsonb;
alter table public.cp_puzzles add column if not exists title text;
alter table public.cp_puzzles add column if not exists published boolean not null default true;
alter table public.cp_puzzles add column if not exists author_id uuid references auth.users on delete set null;
alter table public.cp_puzzles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.cp_drafts (
  author_id uuid not null references auth.users on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9_-]{1,64}$'),
  data jsonb not null check (octet_length(data::text) <= 262144),
  updated_at timestamptz not null default now(),
  primary key (author_id, key)
);

alter table public.cp_authors enable row level security;
alter table public.cp_drafts enable row level security;
revoke all on public.cp_authors, public.cp_drafts from anon, authenticated;

-- ---------- Helper: exige ser autor ----------
create or replace function public.cp_require_author() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from cp_authors a where a.user_id = v_uid) then
    raise exception 'No tenés permiso de autor. Ingresá con una cuenta de autor.';
  end if;
  return v_uid;
end $$;

-- ---------- Vista pública: casos jugables ----------
create or replace view public.cp_public_puzzles as
  select p.id, p.data, p.difficulty, p.content_hash, p.published_at, p.updated_at
  from cp_puzzles p
  where p.published and p.data is not null;

revoke all on public.cp_public_puzzles from anon, authenticated;
grant select on public.cp_public_puzzles to anon, authenticated;

-- ---------- API de autores ----------
create or replace function public.cp_author_whoami() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('email', a.email) from cp_authors a where a.user_id = cp_require_author();
$$;

create or replace function public.cp_author_publish(p_puzzle jsonb, p_solution jsonb, p_killer text, p_content_hash text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := cp_require_author();
  v_id text := p_puzzle ->> 'id';
  v_size int;
  v_difficulty int;
  v_people text[];
  v_sol_keys text[];
begin
  if jsonb_typeof(p_puzzle) <> 'object' or octet_length(p_puzzle::text) > 65536 then
    raise exception 'El caso no tiene un formato válido.';
  end if;
  if v_id is null or v_id !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'El identificador del caso es inválido (minúsculas, números y guiones).';
  end if;
  if coalesce(p_puzzle ->> 'theme', '') !~ '^[a-z0-9-]{1,40}$' or coalesce(length(p_puzzle ->> 'title'), 0) < 3 then
    raise exception 'El caso necesita un tema válido y un título.';
  end if;
  begin
    v_size := (p_puzzle ->> 'size')::int;
    v_difficulty := (p_puzzle ->> 'difficulty')::int;
  exception when others then
    raise exception 'Tamaño o dificultad inválidos.';
  end;
  if v_size is null or v_size not between 3 and 9 or v_difficulty is null or v_difficulty not between 1 and 5 then
    raise exception 'Tamaño o dificultad fuera de rango.';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Falta el hash de la lógica del caso.';
  end if;
  if jsonb_typeof(p_solution) <> 'object' then
    raise exception 'La solución no tiene un formato válido.';
  end if;

  select array_agg(x ->> 'id' order by x ->> 'id') into v_people from jsonb_array_elements(p_puzzle -> 'people') x;
  select array_agg(k order by k) into v_sol_keys from jsonb_object_keys(p_solution) k;
  if v_people is null or array_length(v_people, 1) <> v_size or v_sol_keys is distinct from v_people then
    raise exception 'La solución tiene que ubicar exactamente a las personas del caso.';
  end if;
  if not (p_killer = any (v_people)) then
    raise exception 'El culpable no es una persona del caso.';
  end if;

  insert into cp_puzzles (id, theme, size, difficulty, content_hash, data, title, published, author_id, updated_at)
  values (v_id, p_puzzle ->> 'theme', v_size, v_difficulty, p_content_hash, p_puzzle, p_puzzle ->> 'title', true, v_uid, now())
  on conflict (id) do update set
    theme = excluded.theme,
    size = excluded.size,
    difficulty = excluded.difficulty,
    content_hash = excluded.content_hash,
    data = excluded.data,
    title = excluded.title,
    author_id = excluded.author_id,
    updated_at = now(),
    -- Volver a publicar un caso despublicado lo pone primero en la lista.
    published_at = case when cp_puzzles.published then cp_puzzles.published_at else now() end,
    published = true;

  insert into cp_solutions (puzzle_id, placements, killer) values (v_id, p_solution, p_killer)
  on conflict (puzzle_id) do update set placements = excluded.placements, killer = excluded.killer;

  return json_build_object('id', v_id, 'content_hash', p_content_hash);
end $$;

create or replace function public.cp_author_unpublish(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform cp_require_author();
  update cp_puzzles set published = false, updated_at = now() where id = p_id;
  if not found then
    raise exception 'No existe el caso %.', p_id;
  end if;
end $$;

create or replace function public.cp_author_list() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', p.id, 'title', coalesce(p.title, p.data ->> 'title', p.id), 'theme', p.theme, 'size', p.size,
    'difficulty', p.difficulty, 'content_hash', p.content_hash, 'published', p.published,
    'published_at', p.published_at, 'updated_at', p.updated_at, 'has_data', p.data is not null
  ) order by p.published desc, p.published_at desc), '[]'::json)
  from cp_puzzles p
  where cp_require_author() is not null;
$$;

create or replace function public.cp_author_get(p_id text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('puzzle', p.data, 'solution', s.placements, 'killer', s.killer,
    'content_hash', p.content_hash, 'published', p.published, 'published_at', p.published_at)
  from cp_puzzles p left join cp_solutions s on s.puzzle_id = p.id
  where p.id = p_id and cp_require_author() is not null;
$$;

create or replace function public.cp_author_list_drafts() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('key', d.key, 'data', d.data, 'updated_at', d.updated_at)
    order by d.updated_at desc), '[]'::json)
  from cp_drafts d
  where d.author_id = cp_require_author();
$$;

create or replace function public.cp_author_get_draft(p_key text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('key', d.key, 'data', d.data, 'updated_at', d.updated_at)
  from cp_drafts d
  where d.author_id = cp_require_author() and d.key = p_key;
$$;

create or replace function public.cp_author_save_draft(p_key text, p_data jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := cp_require_author();
  v_at timestamptz := now();
begin
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'El borrador no tiene un formato válido.';
  end if;
  if (select count(*) from cp_drafts where author_id = v_uid and key <> p_key) >= 200 then
    raise exception 'Llegaste al máximo de 200 borradores. Borrá alguno para seguir.';
  end if;
  insert into cp_drafts (author_id, key, data, updated_at) values (v_uid, p_key, p_data, v_at)
  on conflict (author_id, key) do update set data = excluded.data, updated_at = v_at;
  return v_at;
end $$;

create or replace function public.cp_author_delete_draft(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from cp_drafts where author_id = cp_require_author() and key = p_key;
end $$;

-- ---------- Permisos: solo usuarios autenticados (y la verificación de autor adentro) ----------
revoke execute on function public.cp_require_author() from public, anon, authenticated;
revoke execute on function
  public.cp_author_whoami(), public.cp_author_publish(jsonb, jsonb, text, text), public.cp_author_unpublish(text),
  public.cp_author_list(), public.cp_author_get(text), public.cp_author_list_drafts(), public.cp_author_get_draft(text),
  public.cp_author_save_draft(text, jsonb), public.cp_author_delete_draft(text)
  from public, anon;
grant execute on function
  public.cp_author_whoami(), public.cp_author_publish(jsonb, jsonb, text, text), public.cp_author_unpublish(text),
  public.cp_author_list(), public.cp_author_get(text), public.cp_author_list_drafts(), public.cp_author_get_draft(text),
  public.cp_author_save_draft(text, jsonb), public.cp_author_delete_draft(text)
  to authenticated;
