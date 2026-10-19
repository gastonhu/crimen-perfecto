import { describe, expect, it, vi } from 'vitest';
import { withRetry } from './status';
import { supabaseBackend } from './supabase';
import { BackendError } from './types';

const URL = 'https://demo.supabase.co/';
const KEY = 'anon-key';
const sess = { alias: 'ana', token: 'tok' };

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? new Response('null');
    if (r instanceof Error) throw r;
    return r;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('cliente PostgREST', () => {
  it('llama a las RPC por POST con apikey, Bearer y argumentos en JSON', async () => {
    const f = fakeFetch(json(['hotel-01']));
    const b = supabaseBackend(URL, KEY, f.impl);
    expect(await b.solvedPuzzles(sess)).toEqual(['hotel-01']);
    const { url, init } = f.calls[0];
    expect(url).toBe('https://demo.supabase.co/rest/v1/rpc/cp_solved_puzzles');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ p_token: 'tok' });
  });

  it('lee las vistas por GET con filtros de PostgREST', async () => {
    const f = fakeFetch(json([{ alias: 'ana', seconds: 50, score: 120 }]), json([{ difficulty: 2, content_hash: 'abc' }]));
    const b = supabaseBackend(URL, KEY, f.impl);
    expect(await b.puzzleLeaderboard('hotel-01')).toHaveLength(1);
    const u = new globalThis.URL(f.calls[0].url);
    expect(u.pathname).toBe('/rest/v1/cp_puzzle_leaderboard');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      select: 'alias,seconds,score',
      puzzle_id: 'eq.hotel-01',
      order: 'seconds.asc',
      limit: '10',
    });
    expect(f.calls[0].init.method).toBe('GET');
    expect(await b.puzzleMeta('hotel-01')).toEqual({ difficulty: 2, contentHash: 'abc' });
  });

  it('acepta respuestas vacías (funciones void)', async () => {
    const f = fakeFetch(new Response(null, { status: 204 }));
    await expect(supabaseBackend(URL, KEY, f.impl).logout(sess)).resolves.toBeUndefined();
  });

  it('mapea el intento con tablero y fecha de guardado', async () => {
    const f = fakeFetch(
      json({
        attempt_id: 'a1',
        started_at: '2026-10-19T10:00:00+00:00',
        hints_used: 1,
        wrong_submits: 0,
        solved: false,
        strict: false,
        score: null,
        seconds: null,
        board: { placements: {}, marks: [], notes: {} },
        board_updated_at: '2026-10-19T10:05:00+00:00',
      }),
    );
    const a = await supabaseBackend(URL, KEY, f.impl).getAttempt(sess, 'hotel-01');
    expect(a).toMatchObject({ attemptId: 'a1', hintsUsed: 1, boardUpdatedAt: Date.parse('2026-10-19T10:05:00Z') });
    expect(a?.board).toEqual({ placements: {}, marks: [], notes: {} });
  });

  it('login con PIN incorrecto (null) es un rechazo', async () => {
    const f = fakeFetch(json(null));
    await expect(supabaseBackend(URL, KEY, f.impl).login('ana', '0000')).rejects.toMatchObject({
      message: 'Alias o PIN incorrectos.',
      kind: 'rejected',
    });
  });

  it('envía el hash del caso con la acusación', async () => {
    const f = fakeFetch(json({ correct: true, wrong_submits: 0, score: 100, seconds: 30, killer: 'clara' }));
    await supabaseBackend(URL, KEY, f.impl).submit(sess, 'a1', {}, 'clara', 'h1');
    expect(JSON.parse(f.calls[0].init.body as string)).toMatchObject({ p_killer: 'clara', p_content_hash: 'h1' });
  });

  it('clasifica los errores', async () => {
    const cases: [Response | Error, string, RegExp][] = [
      [json({ code: 'P0001', message: 'Sesión inválida. Volvé a ingresar.' }, 400), 'session', /Sesión inválida/],
      [json({ code: 'P0001', message: 'Este caso todavía no está publicado.' }, 400), 'rejected', /no está publicado/],
      [new TypeError('Failed to fetch'), 'offline', /No hay conexión/],
      [new Response('<html>Bad gateway</html>', { status: 502 }), 'server', /no está disponible.*502/],
      [json({ code: 'PGRST202', message: 'Could not find the function' }, 404), 'rejected', /cp_solved_puzzles.*migración/],
      [json({ message: 'Invalid API key' }, 401), 'rejected', /VITE_SUPABASE_ANON_KEY/],
      [new Response('no es json', { status: 200 }), 'server', /Respuesta inesperada/],
    ];
    for (const [res, kind, msg] of cases) {
      const err = await supabaseBackend(URL, KEY, fakeFetch(res).impl)
        .solvedPuzzles(sess)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BackendError);
      expect((err as BackendError).kind).toBe(kind);
      expect((err as BackendError).message).toMatch(msg);
    }
  });
});

describe('withRetry', () => {
  it('reintenta errores de conexión con backoff y termina bien', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new BackendError('x', 'offline'))
      .mockRejectedValueOnce(new BackendError('x', 'server'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();
    expect(await withRetry(fn, { baseMs: 1, onRetry })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('no reintenta rechazos ni errores de sesión', async () => {
    for (const kind of ['rejected', 'session'] as const) {
      const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new BackendError('no', kind));
      await expect(withRetry(fn, { baseMs: 1 })).rejects.toThrow('no');
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('se rinde después de los intentos pedidos', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new BackendError('caído', 'offline'));
    await expect(withRetry(fn, { attempts: 3, baseMs: 1 })).rejects.toThrow('caído');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
