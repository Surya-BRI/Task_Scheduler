import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendApiBase } from '@/lib/backend-origin';
import { ACCESS_TOKEN_COOKIE } from '@/middleware';

/**
 * Same-origin BFF route: reads the httpOnly session cookie (only readable
 * server-side) and exchanges it for a short-lived Socket.IO auth token, so
 * client JS never touches the long-lived session token directly.
 */
export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const backendResponse = await fetch(`${resolveBackendApiBase()}/auth/ws-token`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { message: 'Unable to connect to the server. Please try again.' },
      { status: 503 },
    );
  }

  const text = await backendResponse.text();
  if (!backendResponse.ok) {
    return NextResponse.json(
      { message: 'Unable to refresh the live connection. Please try again.' },
      { status: backendResponse.status },
    );
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json(
      { message: 'Unable to refresh the live connection. Please try again.' },
      { status: 502 },
    );
  }
}
