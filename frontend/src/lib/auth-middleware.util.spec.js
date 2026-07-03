import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasUsableAccessToken,
  isAccessTokenExpired,
  shouldAllowLoginPage,
} from './auth-middleware.util.ts';

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('auth-middleware.util', () => {
  const now = 1_700_000_000_000;

  it('treats malformed tokens as expired', () => {
    assert.equal(isAccessTokenExpired('not-a-jwt', now), true);
    assert.equal(hasUsableAccessToken('not-a-jwt', now), false);
  });

  it('treats past exp as expired', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) - 60 });
    assert.equal(isAccessTokenExpired(token, now), true);
    assert.equal(hasUsableAccessToken(token, now), false);
  });

  it('treats future exp as usable', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) + 3600 });
    assert.equal(isAccessTokenExpired(token, now), false);
    assert.equal(hasUsableAccessToken(token, now), true);
  });

  it('treats tokens without exp as expired', () => {
    const token = makeJwt({ sub: 'user-1' });
    assert.equal(isAccessTokenExpired(token, now), true);
    assert.equal(hasUsableAccessToken(token, now), false);
  });

  it('allows login when token is expired even without expired=1', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) - 60 });
    assert.equal(shouldAllowLoginPage(token, false, now), true);
  });

  it('allows login when expired=1 even with a valid token', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) + 3600 });
    assert.equal(shouldAllowLoginPage(token, true, now), true);
  });

  it('blocks login when a usable token exists and session is not expired', () => {
    const token = makeJwt({ exp: Math.floor(now / 1000) + 3600 });
    assert.equal(shouldAllowLoginPage(token, false, now), false);
  });
});
