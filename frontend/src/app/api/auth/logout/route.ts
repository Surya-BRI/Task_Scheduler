import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendApiBase } from '@/lib/backend-origin';
import { buildAccessTokenCookieOptions, getExternalLogoutCookieNames } from '@/lib/auth-cookie.server';

const ERP_SESSION_COOKIE = 'session_id';

/** Runs one logout call and logs its outcome — these are best-effort, so failures must be visible, not thrown. */
async function loggedCall(label: string, call: () => Promise<Response>) {
  try {
    const response = await call();
    const body = (await response.text()).slice(0, 160);
    const log = response.ok ? console.info : console.warn;
    log(`[logout] ${label} -> ${response.status} ${body}`);
  } catch (err) {
    console.warn(`[logout] ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Explicit Sign Out only (Navbar) — never call this for a 401 or a stale cookie. It ends the
 * user's ERP session too, so a full SSO logout must be something the user asked for.
 *
 * This is the route the browser actually calls (logoutSession() posts here); the backend's own
 * /auth/logout only runs server-to-server underneath and its Set-Cookie never reaches the
 * browser. So the cookie-clearing that matters happens here. With COOKIE_DOMAIN set to the shared
 * parent domain it removes the browser's one shared copy of these cookies, signing the user out
 * of the ERP portal too. The two calls below end the session on the ERP side: our backend marks
 * the ErpAuthSession row logged out (and nulls fcmToken), and the ERP's own auth_logout endpoint
 * does the same — either alone is enough, both together cover one of them failing.
 */
export async function POST(request: NextRequest) {
  const erpLogoutUrl = process.env.ERP_LOGOUT_URL?.trim().replace(/\/+$/, '');
  const sessionId = request.cookies.get(ERP_SESSION_COOKIE)?.value;

  const calls = [
    loggedCall('backend /auth/logout', () =>
      fetch(`${resolveBackendApiBase()}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') ?? '' },
        body: '{}',
        cache: 'no-store',
      }),
    ),
  ];

  if (erpLogoutUrl && sessionId && /^[\w-]+$/.test(sessionId)) {
    calls.push(
      loggedCall('ERP auth_logout', () =>
        fetch(`${erpLogoutUrl}/${sessionId}`, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        }),
      ),
    );
  } else {
    console.info(
      `[logout] ERP auth_logout skipped (ERP_LOGOUT_URL set: ${Boolean(erpLogoutUrl)}, session_id cookie present: ${Boolean(sessionId)})`,
    );
  }

  await Promise.all(calls);

  const response = NextResponse.json({ ok: true });
  const cookieOptions = buildAccessTokenCookieOptions();
  response.cookies.set({ ...cookieOptions, value: '', maxAge: 0 });
  for (const name of getExternalLogoutCookieNames()) {
    response.cookies.set({ ...cookieOptions, name, value: '', maxAge: 0 });
  }
  return response;
}
