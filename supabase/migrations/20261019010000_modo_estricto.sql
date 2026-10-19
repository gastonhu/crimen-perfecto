-- Modo estricto: sin errores marcados al instante ni ayudas, a cambio de +25% de puntos.
-- Se elige al abrir el caso y queda fijo para ese intento.

alter table public.cp_attempts add column if not exists strict boolean not null default false;

-- Consultar un intento sin crearlo (para mostrar el expediente antes de arrancar el reloj).
create or replace function public.cp_get_attempt(p_token text, p_puzzle_id text) returns json
language sql security definer set search_path = public as $$
  select json_build_object(
    'attempt_id', a.id, 'started_at', a.started_at, 'hints_used', a.hints_used,
    'wrong_submits', a.wrong_submits, 'solved', a.solved, 'score', a.score, 'strict', a.strict,
    'seconds', extract(epoch from a.finished_at - a.started_at)::int
  )
  from cp_attempts a
  where a.player_id = cp_player(p_token) and a.puzzle_id = p_puzzle_id;
$$;

-- La firma cambia (p_strict), así que hay que borrar la anterior.
drop function if exists public.cp_start_attempt(text, text);

create or replace function public.cp_start_attempt(p_token text, p_puzzle_id text, p_strict boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player uuid := cp_player(p_token);
begin
  if not exists (select 1 from cp_puzzles where id = p_puzzle_id) then
    raise exception 'Este caso todavía no está publicado.';
  end if;
  -- El modo solo se fija al crear el intento: reabrir el caso no lo cambia.
  insert into cp_attempts (player_id, puzzle_id, strict) values (v_player, p_puzzle_id, coalesce(p_strict, false))
  on conflict (player_id, puzzle_id) do nothing;
  return cp_get_attempt(p_token, p_puzzle_id);
end $$;

create or replace function public.cp_use_hint(p_token text, p_attempt_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from cp_attempts t where t.id = p_attempt_id and t.strict) then
    raise exception 'En modo estricto no hay ayudas.';
  end if;
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
  v_strict boolean;
begin
  perform cp_rate_check('submit:' || v_player, 30, interval '10 minutes');
  select * into a from cp_attempts where id = p_attempt_id and player_id = v_player for update;
  if a.id is null then
    raise exception 'Intento inexistente.';
  end if;
  select t.strict into v_strict from cp_attempts t where t.id = a.id;
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
        score = round(cp_score(pz.difficulty, pz.size, v_seconds, a.hints_used, a.wrong_submits)
                      * case when v_strict then 1.25 else 1 end)::int
    where id = a.id returning * into a;
  return json_build_object('correct', true, 'wrong_submits', a.wrong_submits, 'score', a.score,
    'seconds', v_seconds, 'killer', s.killer);
end $$;

revoke execute on function public.cp_get_attempt(text, text), public.cp_start_attempt(text, text, boolean) from public;
grant execute on function public.cp_get_attempt(text, text), public.cp_start_attempt(text, text, boolean)
  to anon, authenticated;
