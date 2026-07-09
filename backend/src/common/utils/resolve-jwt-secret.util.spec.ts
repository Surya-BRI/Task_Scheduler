import type { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './resolve-jwt-secret.util';

describe('resolveJwtSecret', () => {
  it('returns jwt.accessSecret in demo mode', () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'auth.mode') return 'demo';
        if (key === 'jwt.accessSecret') return 'demo-secret';
        return undefined;
      }),
    } as unknown as ConfigService;

    expect(resolveJwtSecret(config)).toBe('demo-secret');
  });

  it('prefers externalJwtSecret in external mode', () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'auth.mode') return 'external';
        if (key === 'auth.externalJwtSecret') return 'external-secret';
        if (key === 'jwt.accessSecret') return 'fallback-secret';
        return undefined;
      }),
    } as unknown as ConfigService;

    expect(resolveJwtSecret(config)).toBe('external-secret');
  });

  it('throws when no secret is configured', () => {
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    expect(() => resolveJwtSecret(config)).toThrow(/JWT secret is not configured/);
  });
});
