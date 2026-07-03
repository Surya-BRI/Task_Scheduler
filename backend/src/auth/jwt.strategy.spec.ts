import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'auth.mode': 'demo',
    'jwt.accessSecret': 'test-jwt-secret',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('JwtStrategy', () => {
  it('validates demo-mode tokens with sub, email, and role', () => {
    const strategy = new JwtStrategy(makeConfig());
    expect(strategy.validate({ sub: 'u1', email: 'a@b.com', role: 'HOD' })).toEqual({
      sub: 'u1',
      email: 'a@b.com',
      role: 'HOD',
    });
  });

  it('rejects demo-mode tokens missing required claims', () => {
    const strategy = new JwtStrategy(makeConfig());
    expect(() => strategy.validate({ sub: 'u1', email: 'a@b.com' })).toThrow(UnauthorizedException);
  });

  it('normalises external-mode tokens using configured field names', () => {
    const strategy = new JwtStrategy(
      makeConfig({
        'auth.mode': 'external',
        'auth.externalSubField': 'userId',
        'auth.externalEmailField': 'mail',
        'auth.externalRoleField': 'userRole',
        'auth.externalRoleMap': '{"Hod":"HOD"}',
        'auth.externalJwtSecret': 'external-secret',
      }),
    );

    expect(
      strategy.validate({
        userId: 'ext-1',
        mail: 'ext@example.com',
        userRole: 'Hod',
      }),
    ).toEqual({
      sub: 'ext-1',
      email: 'ext@example.com',
      role: 'HOD',
    });
  });

  it('falls back to email as sub when external sub is missing', () => {
    const strategy = new JwtStrategy(
      makeConfig({
        'auth.mode': 'external',
        'auth.externalJwtSecret': 'external-secret',
      }),
    );

    expect(
      strategy.validate({
        sub: '',
        email: 'fallback@example.com',
        role: 'DESIGNER',
      }),
    ).toEqual({
      sub: 'fallback@example.com',
      email: 'fallback@example.com',
      role: 'DESIGNER',
    });
  });
});
