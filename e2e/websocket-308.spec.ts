import { test, expect } from '@playwright/test';

/**
 * BUG-008: WebSocket handshake must not fail with HTTP 308.
 * Realtime client: frontend/src/lib/realtime.ts → io(`${origin}/dashboard`)
 * Engine.IO path defaults to /socket.io/
 */

async function probe(request: import('@playwright/test').APIRequestContext, url: string) {
  const res = await request.get(url, { maxRedirects: 0 });
  return { status: res.status(), location: res.headers()['location'] ?? null, url };
}

test.describe('BUG-008 WebSocket / Socket.IO handshake', () => {
  test('backend socket.io polling does not return 308', async ({ request }) => {
    const apiOrigin = process.env.PLAYWRIGHT_API_ORIGIN ?? 'http://localhost:7000';
    const result = await probe(
      request,
      `${apiOrigin}/socket.io/?EIO=4&transport=polling`,
    );
    expect(
      result.status,
      `Backend ${result.url} returned ${result.status}${result.location ? ` → ${result.location}` : ''}`,
    ).not.toBe(308);
    // Engine.IO ok sessions are 200; unauthorized gateways may be 400/401/403 — all fine vs 308.
    expect([200, 400, 401, 403]).toContain(result.status);
  });

  test('frontend origin socket.io must not 308-redirect (proxy gap)', async ({ request }) => {
    // When NEXT_PUBLIC_API_BASE_URL is same-origin (/api/v1), realtime defaults WS
    // to window.location.origin. Next only rewrites /api/v1 — not /socket.io/.
    const feOrigin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5000';
    const result = await probe(
      request,
      `${feOrigin}/socket.io/?EIO=4&transport=polling`,
    );
    expect(
      result.status,
      `Frontend ${result.url} returned ${result.status}${result.location ? ` → ${result.location}` : ''} (308 = BUG-008 redirect on WS path)`,
    ).not.toBe(308);
  });

  test('login page does not log Unexpected response code: 308 for websocket', async ({
    page,
  }) => {
    const wsErrors: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (/308|websocket|socket\.io/i.test(text)) {
        wsErrors.push(text);
      }
    });
    page.on('pageerror', (err) => {
      if (/308|websocket|socket\.io/i.test(err.message)) {
        wsErrors.push(err.message);
      }
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    // Navbar realtime connects after auth; still wait briefly for any eager sockets.
    await page.waitForTimeout(2000);

    const hit308 = wsErrors.filter((t) => /Unexpected response code:\s*308|response code: 308/i.test(t));
    expect(hit308, `Console WS 308 errors:\n${wsErrors.join('\n')}`).toEqual([]);
  });
});
