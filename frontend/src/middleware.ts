import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasUsableAccessToken } from './lib/auth-middleware.util';

export const ACCESS_TOKEN_COOKIE = 'access_token';

const PUBLIC_PATHS = new Set(['/login']);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root always lands on login — never skip straight to the app.
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const hasToken = hasUsableAccessToken(token);

  if (isPublicPath(pathname)) {
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
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
