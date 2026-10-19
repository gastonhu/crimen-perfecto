import { defineConfig, devices } from '@playwright/test';

// End-to-end contra `npm run dev:local`: nunca toca Supabase.
// - `local`: backend en localStorage (.env.offline).
// - `mock`: el backend Supabase del front apuntando a una URL local inexistente; cada pedido lo responde un PostgREST
//   falso dentro del test (page.route). Sirve para probar el cliente fetch, los errores de conexión y el hash.
const LOCAL = 5180;
const MOCK = 5181;
const MOCK_SUPABASE_URL = 'http://127.0.0.1:9/mock-supabase'; // igual que en e2e/supabase-mock.e2e.ts

const chrome = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'local', testMatch: 'juego.e2e.ts', use: { ...chrome, baseURL: `http://localhost:${LOCAL}` } },
    { name: 'mock', testMatch: 'supabase-mock.e2e.ts', use: { ...chrome, baseURL: `http://localhost:${MOCK}` } },
  ],
  webServer: [
    {
      command: `npm run dev:local -- --port ${LOCAL} --strictPort`,
      url: `http://localhost:${LOCAL}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Las variables del proceso le ganan a .env.offline.
      command: `npm run dev:local -- --port ${MOCK} --strictPort`,
      env: { VITE_SUPABASE_URL: MOCK_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'e2e-anon-key' },
      url: `http://localhost:${MOCK}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
