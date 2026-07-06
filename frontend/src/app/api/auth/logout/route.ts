import { NextResponse } from 'next/server';
import { resolveBackendApiBase } from '@/lib/backend-origin';
import { buildAccessTokenCookieOptions } from '@/lib/auth-cookie.server';

export async function POST() {
  try {
    await fetch(`${resolveBackendApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
  } catch {
    // Best-effort backend logout; always clear the frontend cookie.
  }

  const response = NextResponse.json({ ok: true });
  const cookieOptions = buildAccessTokenCookieOptions();
  response.cookies.set({ ...cookieOptions, value: '', maxAge: 0 });
  return response;
}
