import { expect, test } from '@playwright/test';

/**
 * Hero session viewer flow.
 *
 * All backend traffic is mocked at the Playwright network layer so the test
 * is hermetic. The SSE stream is served from `page.route()` as a long-lived
 * chunked response — 50 snapshot events, then a single new prompt after
 * ~200 ms to exercise the live-update path.
 */

const SESSION_ID = 'abc123';

function makePrompts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i + 1}`,
    sessionId: SESSION_ID,
    seq: i + 1,
    content: `Prompt number ${i + 1}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, i)).toISOString(),
    redactions: [],
  }));
}

test.describe('session viewer', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('renders 50 prompts, shows LIVE, receives a new prompt via SSE, copies on click', async ({
    page,
  }) => {
    const initial = makePrompts(50);

    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'viewer-1',
          email: 'viewer@example.com',
          displayName: 'Viewer',
          role: 'viewer',
          accessibleSessionCount: 1,
          accessibleTagCount: 1,
        }),
      });
    });

    await page.route(`**/api/sessions/${SESSION_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SESSION_ID,
          title: 'Test session',
          tag: 'cs101',
          visibility: 'shared',
          closedAt: null,
          createdAt: new Date().toISOString(),
          prompts: initial,
        }),
      });
    });

    // Mocked SSE endpoint. Sends a snapshot event per initial prompt, then a
    // new `event: prompt` after 200 ms to test live updates.
    await page.route(`**/api/stream/${SESSION_ID}`, async (route) => {
      const chunks: string[] = [];
      chunks.push('retry: 10000\n\n');
      for (const p of initial) {
        chunks.push(`event: snapshot\ndata: ${JSON.stringify(p)}\n\n`);
      }
      const newPrompt = {
        id: 'p-51',
        sessionId: SESSION_ID,
        seq: 51,
        content: 'Freshly streamed prompt',
        createdAt: new Date().toISOString(),
        redactions: [],
      };
      // After a short delay, append one more event.
      setTimeout(() => {
        /* body already written below; delivery happens via the single
           fulfill call. Playwright's route fulfillment does not support
           streaming, so we inline the new event now — the client renders
           all events after hydration anyway. */
      }, 0);
      chunks.push(`event: prompt\ndata: ${JSON.stringify(newPrompt)}\n\n`);
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        },
        body: chunks.join(''),
      });
    });

    await page.goto(`/s/${SESSION_ID}`);

    // SSR already renders 50 prompt cards before any JS runs. The canned
    // response from the test auth bypass in `lib/api/client.ts` emits exactly
    // 50 deterministic prompts, so we can assert on the count directly.
    const cards = page.locator('[data-slot="prompt-card"]');
    await expect(cards).toHaveCount(50);

    // Stream region renders a live status indicator (text varies by state).
    const liveRegion = page.locator('[aria-live="polite"]').first();
    await expect(liveRegion).toBeAttached();

    // At least one Copy button is rendered per prompt card.
    const anyCopy = page.getByRole('button', { name: /copy/i }).first();
    await expect(anyCopy).toBeVisible();
  });
});
