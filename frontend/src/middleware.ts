import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasUsableAccessToken, shouldAllowLoginPage } from './lib/auth-middleware.util';

export const ACCESS_TOKEN_COOKIE = 'access_token';

const PUBLIC_PATHS = new Set(['/login']);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const hasToken = hasUsableAccessToken(token);

  if (isPublicPath(pathname)) {
    // A cookie from another app on the same parent domain (BRI ERP SSO) counts here too —
    // skip the form and let '/' resolve the right home route instead of a second login.
    const sessionExpired = request.nextUrl.searchParams.get('expired') === '1';
    if (!shouldAllowLoginPage(token, sessionExpired)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!hasToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude /socket.io so Engine.IO handshake is not redirected to /login (BUG-008).
    '/((?!api|socket\\.io|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
