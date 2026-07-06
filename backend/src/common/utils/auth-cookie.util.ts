import type { CookieOptions } from 'express';
import type { ConfigService } from '@nestjs/config';
import { ACCESS_TOKEN_COOKIE, DEFAULT_ACCESS_TOKEN_MAX_AGE_MS } from '../constants/auth-cookie.constants';

export function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.split('=');
    const key = rawKey?.trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=').trim());
    return acc;
  }, {});
}

export function extractAccessTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  authToken?: string,
): string | null {
  if (authToken && typeof authToken === 'string') {
    return authToken.replace(/^Bearer\s+/i, '').trim() || null;
  }

  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization === 'string' && authorization.trim()) {
    return authorization.replace(/^Bearer\s+/i, '').trim() || null;
  }

  const cookieHeader = headers.cookie ?? headers.Cookie;
  if (typeof cookieHeader === 'string') {
    return parseCookieHeader(cookieHeader)[ACCESS_TOKEN_COOKIE] ?? null;
  }

  return null;
}

function parseDurationToMs(value: string | undefined): number {
  const raw = (value ?? '1d').trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) return DEFAULT_ACCESS_TOKEN_MAX_AGE_MS;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? multipliers.d);
}

export function buildAccessTokenCookieOptions(configService: ConfigService): CookieOptions {
  const isProd = configService.get<string>('app.nodeEnv') === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: parseDurationToMs(configService.get<string>('jwt.accessExpiresIn')),
  };
}
