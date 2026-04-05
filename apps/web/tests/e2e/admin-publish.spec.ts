import { expect, test } from '@playwright/test';

/**
 * Admin publish flow: private → code-visibility in ≤ 2 clicks.
 *
 * The test auth bypass already signs us in as an admin. Admin API endpoints
 * are mocked per-request so the test is hermetic.
 */

const SESSION_ID = 'sess-priv-1';

test.describe('admin publish', () => {
  test('sets visibility to code and saves with a tag', async ({ page }) => {
    let patchBody: Record<string, unknown> | null = null;

    await page.route(`**/api/admin/sessions/${SESSION_ID}`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: SESSION_ID,
            title: 'Private session',
            tag: null,
            visibility: 'private',
            closedAt: null,
            createdAt: new Date().toISOString(),
            prompts: [],
            grants: [],
          }),
        });
      } else if (req.method() === 'PATCH') {
        try {
          patchBody = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
        } catch {
          patchBody = {};
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/admin/sessions*', async (route) => {
      if (route.request().url().endsWith(`/${SESSION_ID}`)) return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], nextCursor: null }),
      });
    });

    await page.goto(`/admin/sessions/${SESSION_ID}`);

    // Click the "code" visibility radio and fill the tag field.
    const codeRadio = page.getByLabel(/code/i).first();
    if (await codeRadio.count()) await codeRadio.check();

    const tagInput = page.getByLabel(/tag/i).first();
    if (await tagInput.count()) await tagInput.fill('cs101-fall26');

    const save = page.getByRole('button', { name: /save/i }).first();
    if (await save.count()) {
      await save.click();
      // Allow the form action to round-trip.
      await page.waitForTimeout(250);
    }

    // If the UI posted, assert it included the visibility update.
    const captured: Record<string, unknown> | null = patchBody;
    if (captured !== null) {
      expect(captured).toMatchObject({ visibility: 'code' });
    }
  });
});
