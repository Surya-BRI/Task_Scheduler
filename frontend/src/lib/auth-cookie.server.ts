import { ACCESS_TOKEN_COOKIE } from '@/middleware';

type AccessTokenCookieOptions = {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
};

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

function parseDurationToSeconds(value: string | undefined): number {
  const raw = (value ?? '1d').trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) return DEFAULT_MAX_AGE_SECONDS;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };
  return amount * (multipliers[unit] ?? multipliers.d);
}

export function buildAccessTokenCookieOptions(): Omit<AccessTokenCookieOptions, 'value'> {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: ACCESS_TOKEN_COOKIE,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: parseDurationToSeconds(process.env.JWT_ACCESS_EXPIRES_IN),
  };
}

export function extractAccessTokenFromSetCookies(setCookies: string[]): string | null {
  for (const header of setCookies) {
    if (!header.startsWith(`${ACCESS_TOKEN_COOKIE}=`)) continue;
    const value = header.slice(`${ACCESS_TOKEN_COOKIE}=`.length).split(';')[0]?.trim();
    if (!value) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export function readSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}
