// El front con el backend Supabase, contra un PostgREST falso (page.route): ningún pedido sale de la máquina.
import { expect, test, type Page } from '@playwright/test';

const MOCK_SUPABASE_URL = 'http://127.0.0.1:9/mock-supabase'; // igual que en playwright.config.ts
const HOTEL = { 'Don Ruiz': '4,3', Ana: '0,1', Bruno: '1,2', Clara: '3,4', Diego: '2,0' };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

interface Fake {
  /** content_hash publicado; null = no compara. */
  hash: string | null;
  /** Token que el servidor acepta. */
  token: string;
  /** Todo pedido falla como sin conexión. */
  offline: boolean;
  /** Cuántas veces más falla (sin conexión) cada función o vista. */
  fail: Record<string, number>;
  calls: { name: string; apikey?: string; auth?: string; body?: Record<string, unknown> }[];
}

async function fakeSupabase(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const s: Fake = { hash: null, token: 'tok-1', offline: false, fail: {}, calls: [], ...init };
  const attempt = {
    attempt_id: '00000000-0000-4000-8000-000000000001',
    started_at: new Date(Date.now() - 60_000).toISOString(),
    hints_used: 0,
    wrong_submits: 0,
    solved: false,
    strict: false,
    score: null,
    seconds: null,
    board: null,
    board_updated_at: null,
  };
  await page.route(`${MOCK_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const name = new URL(req.url()).pathname.split('/').pop()!;
    const body = req.method() === 'POST' ? (req.postDataJSON() as Record<string, unknown>) : undefined;
    const h = req.headers();
    s.calls.push({ name, apikey: h['apikey'], auth: h['authorization'], body });
    if (s.offline || (s.fail[name] ?? 0) > 0) {
      s.fail[name] = (s.fail[name] ?? 0) - 1;
      return route.abort('internetdisconnected');
    }
    const ok = (data: unknown) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(data) });
    const raise = (message: string) =>
      route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message }) });
    if (body && 'p_token' in body && body.p_token !== s.token) return raise('Sesión inválida. Volvé a ingresar.');
    switch (name) {
      case 'cp_login':
        return ok(body?.p_pin === '4821' ? s.token : null);
      case 'cp_logout':
        return route.fulfill({ status: 204, headers: CORS });
      case 'cp_solved_puzzles':
        return ok([]);
      case 'cp_get_attempt':
      case 'cp_start_attempt':
        return ok(attempt);
      case 'cp_save_progress':
        return ok(new Date().toISOString());
      case 'cp_submit':
        if (s.hash && body?.p_content_hash !== s.hash)
          return raise('Este caso cambió desde que abriste la página. Recargá para jugar la versión actual.');
        return ok({ correct: body?.p_killer === 'clara', wrong_submits: 0, score: 150, seconds: 60, killer: 'clara' });
      case 'cp_puzzle_meta':
        return ok([{ difficulty: 1, content_hash: s.hash }]);
      case 'cp_leaderboard':
      case 'cp_puzzle_leaderboard':
        return ok([]);
      default:
        return route.fulfill({ status: 404, headers: CORS, body: '{"code":"PGRST202","message":"no existe"}' });
    }
  });
  return s;
}

async function openHotelLoggedIn(page: Page, token = 'tok-1') {
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('e2e-init')) {
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('crimen-perfecto:session', JSON.stringify({ alias: 'ana', token: t }));
      localStorage.setItem('crimen-perfecto:settings', JSON.stringify({ tutorialSeen: true }));
    }
  }, token);
  await page.goto('/#hotel-01');
}

const person = (page: Page, name: string) =>
  page.locator('.people .person', { has: page.locator('.name', { hasText: new RegExp(`^\\d\\s*${name}`) }) });

async function solveBoard(page: Page, skip: string[] = []) {
  for (const [name, rc] of Object.entries(HOTEL)) {
    if (skip.includes(name)) continue; // tocar de nuevo la misma casilla la saca del plano
    await person(page, name).locator(':scope > button').click();
    await page.locator(`[data-cell="${rc}"]`).click();
  }
}

test('usa fetch contra PostgREST con apikey y Bearer', async ({ page }) => {
  const s = await fakeSupabase(page, { hash: null });
  await openHotelLoggedIn(page);
  await expect(page.getByRole('grid', { name: 'Plano de la escena' })).toBeVisible();
  expect(s.calls.map((c) => c.name)).toEqual(expect.arrayContaining(['cp_get_attempt', 'cp_puzzle_meta', 'cp_leaderboard']));
  for (const c of s.calls) {
    expect(c.apikey).toBe('e2e-anon-key');
    expect(c.auth).toBe('Bearer e2e-anon-key');
  }
});

test('si el caso publicado cambió, avisa y no deja acusar', async ({ page }) => {
  await fakeSupabase(page, { hash: 'hash-de-otra-version' });
  await openHotelLoggedIn(page);
  await expect(page.getByRole('alert')).toContainText('Este caso cambió desde que se cargó la página');
  await solveBoard(page);
  await expect(page.getByRole('button', { name: /Acusar/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();
});

test('con el mismo hash, la acusación lo manda y el servidor la acepta', async ({ page }) => {
  // El hash del front se calcula con logicHash: lo leemos del primer envío y lo publicamos igual.
  const s = await fakeSupabase(page, { hash: null });
  await openHotelLoggedIn(page);
  await solveBoard(page);
  await page.getByRole('button', { name: /Acusar/ }).click();
  await page.locator('dialog .suspects button', { hasText: 'Clara' }).click();
  await expect(page.getByRole('dialog', { name: 'Caso resuelto' })).toBeVisible({ timeout: 10_000 });
  const sent = s.calls.find((c) => c.name === 'cp_submit')!.body!;
  expect(sent.p_content_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(sent.p_killer).toBe('clara');
});

test('sin conexión: lo indica, guarda en el dispositivo y reintenta la acusación', async ({ page }) => {
  const s = await fakeSupabase(page);
  await openHotelLoggedIn(page);
  await expect(page.getByRole('grid', { name: 'Plano de la escena' })).toBeVisible();

  s.offline = true;
  await person(page, 'Ana').locator(':scope > button').click();
  await page.locator(`[data-cell="${HOTEL.Ana}"]`).click();
  await expect(page.locator('.save-chip')).toHaveText('Sin conexión · guardado en este dispositivo', { timeout: 15_000 });
  await expect(page.locator('header.top').getByText('Sin conexión')).toBeVisible();
  // Durante la partida el marcador se abre desde el encabezado.
  await page.locator('header.top').getByRole('button', { name: /Marcador/ }).click();
  await expect(page.getByRole('complementary', { name: 'Marcador' })).toContainText('Sin conexión con el servidor');
  await page.keyboard.press('Escape');

  // Vuelve la conexión, pero el envío falla dos veces más: se reintenta solo y termina bien.
  s.offline = false;
  s.fail.cp_submit = 2;
  await solveBoard(page, ['Ana']);
  await page.getByRole('button', { name: /Acusar/ }).click();
  await page.locator('dialog .suspects button', { hasText: 'Clara' }).click();
  await expect(page.getByText(/reintentando el envío/)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Caso resuelto' })).toBeVisible({ timeout: 15_000 });
  expect(s.calls.filter((c) => c.name === 'cp_submit')).toHaveLength(3);
  await expect(page.locator('header.top').getByText('Sin conexión')).toHaveCount(0);
});

test('si el servidor dice "Sesión inválida", vuelve al ingreso con aviso y se puede seguir', async ({ page }) => {
  const s = await fakeSupabase(page, { token: 'tok-nuevo' });
  await openHotelLoggedIn(page, 'tok-vencido');
  await expect(page.getByText('Tu sesión venció o se cerró')).toBeVisible();
  await expect(page.getByLabel('Alias')).toHaveValue('ana');
  await page.getByLabel('PIN').fill('0000');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Alias o PIN incorrectos.')).toBeVisible();
  await page.getByLabel('PIN').fill('4821');
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Vuelve al caso que estaba abierto.
  await expect(page.getByRole('grid', { name: 'Plano de la escena' })).toBeVisible();
  expect(s.calls.some((c) => c.name === 'cp_get_attempt' && c.body?.p_token === 'tok-nuevo')).toBe(true);

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect.poll(() => s.calls.some((c) => c.name === 'cp_logout' && c.body?.p_token === 'tok-nuevo')).toBe(true);
});
