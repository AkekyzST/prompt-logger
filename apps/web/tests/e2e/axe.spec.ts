import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

/**
 * Axe-core accessibility sweep across every top-level page. Asserts zero
 * serious or critical violations. `color-contrast` is disabled because the
 * dev server's CSS layering occasionally produces false positives against
 * Tailwind v4 `@theme` tokens that resolve correctly in production.
 */

async function scan(page: Page, path: string) {
  await page.goto(path);
  // Let the page settle (no networkidle in SvelteKit with SSE — use domcontentloaded).
  await page.waitForLoadState('domcontentloaded');
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(severe, `axe violations on ${path}: ${JSON.stringify(severe, null, 2)}`).toEqual([]);
}

test.describe('axe-core a11y sweep', () => {
  test.beforeEach(async ({ page }) => {
    // Mock all backend traffic so pages render fully regardless of server state.
    await page.route('**/api/me', async (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin',
          role: 'admin',
          accessibleSessionCount: 0,
          accessibleTagCount: 0,
        }),
      })
    );
    await page.route('**/api/admin/**', async (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], nextCursor: null, users: [], codes: [], entries: [] }),
      })
    );
    await page.route('**/api/sessions/**', async (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'abc123',
          title: 'Sample',
          tag: 'cs101',
          visibility: 'shared',
          closedAt: null,
          createdAt: new Date().toISOString(),
          prompts: [],
        }),
      })
    );
    await page.route('**/api/stream/**', async (r) =>
      r.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'retry: 10000\n\n',
      })
    );
  });

  for (const path of [
    '/login-landing',
    '/me',
    '/admin',
    '/admin/sessions',
    '/admin/users',
    '/admin/codes',
    '/admin/audit',
  ]) {
    test(`has no serious/critical violations on ${path}`, async ({ page }) => {
      await scan(page, path);
    });
  }
});
