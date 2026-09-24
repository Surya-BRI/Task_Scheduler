import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendApiBase } from '@/lib/backend-origin';
import { buildAccessTokenCookieOptions, getExternalLogoutCookieNames } from '@/lib/auth-cookie.server';

const ERP_SESSION_COOKIE = 'session_id';

/** Ends the session on the ERP server too (GET {ERP_LOGOUT_URL}/{session_id}); cookies alone can't do that. */
async function endErpSession(request: NextRequest) {
  const baseUrl = process.env.ERP_LOGOUT_URL?.trim().replace(/\/+$/, '');
  const sessionId = request.cookies.get(ERP_SESSION_COOKIE)?.value;
  if (!baseUrl || !sessionId || !/^[\w-]+$/.test(sessionId)) return;
  await fetch(`${baseUrl}/${sessionId}`, {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
}

/**
 * This is the route the browser actually calls (logoutSession() posts here) — the backend's
 * own /auth/logout only runs server-to-server underneath and its Set-Cookie response never
 * reaches the browser, so the cookie-clearing that matters for the browser happens here, not
 * there. With COOKIE_DOMAIN set to the shared parent domain, this is a full SSO logout: it
 * removes the browser's one shared copy of these cookies, signing the user out of the ERP
 * portal too, not just this app's view of the session.
 */
export async function POST(request: NextRequest) {
  // Best-effort: a failure in either call must never block clearing the cookies below.
  await Promise.allSettled([
    fetch(`${resolveBackendApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    }),
    endErpSession(request),
  ]);

  const response = NextResponse.json({ ok: true });
  const cookieOptions = buildAccessTokenCookieOptions();
  response.cookies.set({ ...cookieOptions, value: '', maxAge: 0 });
  for (const name of getExternalLogoutCookieNames()) {
    response.cookies.set({ ...cookieOptions, name, value: '', maxAge: 0 });
  }
  return response;
}
