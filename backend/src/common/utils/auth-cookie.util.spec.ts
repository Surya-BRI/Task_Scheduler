import { ACCESS_TOKEN_COOKIE } from '../constants/auth-cookie.constants';
import { extractAccessTokenFromHeaders, parseCookieHeader } from './auth-cookie.util';

describe('auth-cookie.util', () => {
  it('parses cookie header values', () => {
    expect(parseCookieHeader(`${ACCESS_TOKEN_COOKIE}=abc123; other=value`)).toEqual({
      [ACCESS_TOKEN_COOKIE]: 'abc123',
      other: 'value',
    });
  });

  it('prefers bearer authorization header', () => {
    const token = extractAccessTokenFromHeaders({
      authorization: 'Bearer header-token',
      cookie: `${ACCESS_TOKEN_COOKIE}=cookie-token`,
    });
    expect(token).toBe('header-token');
  });

  it('falls back to access_token cookie', () => {
    const token = extractAccessTokenFromHeaders({
      cookie: `${ACCESS_TOKEN_COOKIE}=cookie-token`,
    });
    expect(token).toBe('cookie-token');
  });
});
