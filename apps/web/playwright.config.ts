import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Prompt Logger web UI.
 *
 * Test mode uses `VITE_TEST_AUTH_BYPASS=1` which makes `hooks.server.ts`
 * inject a synthetic admin user instead of calling the real `/api/me`. This
 * only activates when `import.meta.env.DEV === true` AND the flag is set, so
 * it can never leak into a production bundle.
 *
 * All backend interactions are mocked at the network boundary via
 * `page.route()` inside the individual specs — no real server is required.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @prompt-logger/web dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_TEST_AUTH_BYPASS: '1',
    },
  },
});
