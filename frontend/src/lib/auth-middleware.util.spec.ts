import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasUsableAccessToken,
  isAccessTokenExpired,
  shouldAllowLoginPage,
} from './auth-middleware.util';

function makeJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('auth-middleware.util', () => {
  const now = 1_700_000_000_000;

  it('treats malformed tokens as expired', () => {
    expect(isAccessTokenExpired('not-a-jwt', now)).toBe(true);
    expect(hasUsableAccessToken('not-a-jwt', now)).toBe(false);
  });

  it('treats past exp as expired', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) - 60 });
    expect(isAccessTokenExpired(token, now)).toBe(true);
    expect(hasUsableAccessToken(token, now)).toBe(false);
  });

  it('treats future exp as usable', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) + 3600 });
    expect(isAccessTokenExpired(token, now)).toBe(false);
    expect(hasUsableAccessToken(token, now)).toBe(true);
  });

  it('allows login when session expired flag is set', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) + 3600 });
    expect(shouldAllowLoginPage(token, true, now)).toBe(true);
  });

  it('blocks login when a usable token exists', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) + 3600 });
    expect(shouldAllowLoginPage(token, false, now)).toBe(false);
  });
});
