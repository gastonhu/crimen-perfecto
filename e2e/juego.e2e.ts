import { expect, test, type Page } from '@playwright/test';

// Solución del hotel-01 ("Corte de luz en el Gran Hotel"), en casillas "fila,columna" 0-based.
const HOTEL = {
  'Don Ruiz': '4,3', // D5
  Ana: '0,1', // B1
  Bruno: '1,2', // C2
  Clara: '3,4', // E4
  Diego: '2,0', // A3
};
const BOARD_KEY = (alias: string) => `crimen-perfecto:board:${alias}:hotel-01`;

async function register(page: Page, alias: string, pin = '4821') {
  await page.goto('/');
  await page.getByLabel('Alias').fill(alias);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page.getByText(`🕵️ ${alias}`)).toBeVisible();
}

const person = (page: Page, name: string) =>
  page.locator('.people .person', { has: page.locator('.name', { hasText: new RegExp(`^\\d\\s*${name}`) }) });
const cell = (page: Page, rc: string) => page.locator(`[data-cell="${rc}"]`);

async function openHotel(page: Page) {
  await page.getByRole('button', { name: /Corte de luz en el Gran Hotel/ }).click();
  await expect(page.getByRole('heading', { name: 'Corte de luz en el Gran Hotel' })).toBeVisible();
}

test('registro → expediente del hotel → resolverlo → puntaje y marcador', async ({ page }) => {
  const alias = `det_${Date.now() % 1e8}`;
  await register(page, alias);
  await openHotel(page);
  // Expediente: el reloj arranca recién al abrir el caso.
  await page.getByRole('button', { name: /Abrir el caso/ }).click();
  await expect(page.getByRole('grid', { name: 'Plano de la escena' })).toBeVisible();

  for (const [name, rc] of Object.entries(HOTEL)) {
    await person(page, name).locator(':scope > button').click();
    await cell(page, rc).click();
    await expect(person(page, name).locator('.chip')).toContainText('En el plano');
  }
  // El progreso se sube al servidor (acá, el backend local) a los ~2 s del último cambio.
  await expect(page.locator('.save-chip')).toHaveText('✓ Guardado', { timeout: 10_000 });

  await page.getByRole('button', { name: /Acusar/ }).click();
  await page.locator('dialog .suspects button', { hasText: 'Clara' }).click();

  const solved = page.getByRole('dialog', { name: 'Caso resuelto' });
  await expect(solved).toBeVisible({ timeout: 10_000 });
  await expect(solved).toContainText('¡Lo resolviste!');
  await expect(solved).toContainText('Clara');
  const points = Number(await solved.locator('.score dd').innerText());
  expect(points).toBeGreaterThanOrEqual(10);

  // Marcador: el caso (mejores tiempos) y el ranking general muestran al jugador con sus puntos.
  const board = page.getByRole('complementary', { name: 'Marcador' });
  await expect(board.locator('tr.is-me').first()).toContainText(alias);
  await expect(board.locator('tr.is-me').last()).toContainText(String(points));

  await solved.getByRole('button', { name: 'Otro caso' }).click();
  await expect(page.getByRole('button', { name: /Corte de luz en el Gran Hotel/ })).toContainText('Resuelto');
});

test('el progreso guardado en el servidor vuelve aunque se borre el del dispositivo', async ({ page }) => {
  const alias = `prog_${Date.now() % 1e8}`;
  await register(page, alias);
  await openHotel(page);
  await page.getByRole('button', { name: /Abrir el caso/ }).click();
  await person(page, 'Ana').locator(':scope > button').click();
  await cell(page, HOTEL.Ana).click();
  await page.getByRole('button', { name: /Marcar/ }).click();
  await cell(page, '0,0').click();
  await expect(page.locator('.save-chip')).toHaveText('✓ Guardado', { timeout: 10_000 });

  // Otro dispositivo: sin el tablero local, el caso se abre con el del servidor.
  await page.evaluate((k) => localStorage.removeItem(k), BOARD_KEY(alias));
  await page.reload();
  await expect(person(page, 'Ana').locator('.chip')).toContainText('En el plano · B1');
  await expect(cell(page, '0,0')).toHaveAttribute('aria-label', /marcada/);
});

test('salir revoca la sesión y una sesión inválida vuelve al ingreso con aviso', async ({ page }) => {
  const alias = `ses_${Date.now() % 1e8}`;
  await register(page, alias);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('crimen-perfecto:session')!).token as string);

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('button', { name: 'Registrarme' })).toBeVisible();

  // Reusar el token revocado (como si hubiera quedado en otra pestaña) lleva al ingreso con un aviso claro.
  await page.evaluate(([a, t]) => localStorage.setItem('crimen-perfecto:session', JSON.stringify({ alias: a, token: t })), [alias, token]);
  await page.reload();
  await expect(page.getByText('Tu sesión venció o se cerró')).toBeVisible();
  await expect(page.getByLabel('Alias')).toHaveValue(alias);

  await page.getByLabel('PIN').fill('4821');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(`🕵️ ${alias}`)).toBeVisible();
  await expect(page.getByText('Elegí un expediente')).toBeVisible();
});

test('tutorial completo', async ({ page }) => {
  await register(page, `tuto_${Date.now() % 1e8}`);
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByText('Tutorial · paso 1 de 5')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // Vera ya está elegida: va a la silla de A1. Después Xavi y Yael quedan elegidos solos.
  await cell(page, '0,0').click();
  await expect(page.getByText('Tutorial · paso 3 de 5')).toBeVisible();
  await cell(page, '0,1').click(); // error a propósito: no está en la sala libre
  await expect(page.locator('.tutorial-step .error')).toContainText('no cumple');
  await cell(page, '1,1').click();
  await cell(page, '2,2').click();
  await expect(page.getByText('Tutorial · paso 5 de 5')).toBeVisible();

  await page.locator('.tutorial-step button', { hasText: 'Yael' }).click();
  await expect(page.locator('.tutorial-step .error')).toContainText('no estaba en la sala');
  await page.locator('.tutorial-step button', { hasText: 'Xavi' }).click();
  await expect(page.getByText('¡Exacto, fue Xavi!')).toBeVisible();
  await page.getByRole('button', { name: 'Ir a los casos' }).click();
  await expect(page.getByText('Elegí un expediente')).toBeVisible();
  await expect(page.getByText('¿Primera vez?')).toHaveCount(0);
});
