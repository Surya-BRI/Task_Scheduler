import { NextRequest, NextResponse } from 'next/server';
import { resolveBackendApiBase } from '@/lib/backend-origin';
import {
  buildAccessTokenCookieOptions,
  extractAccessTokenFromSetCookies,
  readSetCookieHeaders,
} from '@/lib/auth-cookie.server';

type LoginResponseBody = {
  accessToken?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
  message?: string | string[];
  statusCode?: number;
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const loginUrl = `${resolveBackendApiBase()}/auth/login`;
  let backendResponse: Response;
  try {
    backendResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        message: `Cannot reach the API at ${loginUrl}. Start the backend and confirm NEXT_PUBLIC_API_BASE_URL / BACKEND_ORIGIN match its PORT.`,
      },
      { status: 503 },
    );
  }

  const text = await backendResponse.text();
  let payload: LoginResponseBody = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as LoginResponseBody;
    } catch {
      return NextResponse.json({ message: 'Invalid response from authentication server' }, { status: 502 });
    }
  }

  if (!backendResponse.ok) {
    return NextResponse.json(payload, { status: backendResponse.status });
  }

  if (!payload.user) {
    return NextResponse.json({ message: 'Authentication response missing user profile' }, { status: 502 });
  }

  const token =
    payload.accessToken ??
    extractAccessTokenFromSetCookies(readSetCookieHeaders(backendResponse));

  if (!token) {
    return NextResponse.json({ message: 'Authentication response missing access token' }, { status: 502 });
  }

  const response = NextResponse.json({ user: payload.user });
  response.cookies.set({ ...buildAccessTokenCookieOptions(), value: token });
  return response;
}
