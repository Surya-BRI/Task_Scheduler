import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';

function makeReq(cookieHeader?: string): Request {
  return { headers: { cookie: cookieHeader } } as unknown as Request;
}

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
  it('validates demo-mode tokens with sub, username, and role', () => {
    const strategy = new JwtStrategy(makeConfig());
    expect(strategy.validate(makeReq(), { sub: 'u1', username: 'a@b.com', role: 'HOD' })).toEqual({
      sub: 'u1',
      username: 'a@b.com',
      role: 'HOD',
    });
  });

  it('rejects demo-mode tokens missing required claims', () => {
    const strategy = new JwtStrategy(makeConfig());
    expect(() => strategy.validate(makeReq(), { sub: 'u1', username: 'a@b.com' })).toThrow(
      UnauthorizedException,
    );
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
      strategy.validate(makeReq(), {
        userId: 'ext-1',
        mail: 'ext@example.com',
        userRole: 'Hod',
      }),
    ).toEqual({
      sub: 'ext-1',
      username: 'ext@example.com',
      role: 'HOD',
    });
  });

  it('falls back to username as sub when external sub is missing', () => {
    const strategy = new JwtStrategy(
      makeConfig({
        'auth.mode': 'external',
        'auth.externalJwtSecret': 'external-secret',
      }),
    );

    expect(
      strategy.validate(makeReq(), {
        sub: '',
        email: 'fallback@example.com',
        role: 'DESIGNER',
      }),
    ).toEqual({
      sub: 'fallback@example.com',
      username: 'fallback@example.com',
      role: 'DESIGNER',
    });
  });

  it('reads nested claims via dot-path field names (BRI ERP token shape)', () => {
    const strategy = new JwtStrategy(
      makeConfig({
        'auth.mode': 'external',
        'auth.externalSubField': 'data.user_id',
        'auth.externalEmailField': 'data.user_name',
        'auth.externalRoleMap': '{"DESIGN HOD":"HOD"}',
        'auth.externalRoleCookie': 'role',
        'auth.externalJwtSecret': 'external-secret',
      }),
    );

    const req = makeReq('role=%7B%22role%22%3A%22102033%22%2C%22roleName%22%3A%22Design%20HOD%22%7D');

    expect(
      strategy.validate(req, {
        data: { user_id: 3092, user_name: 'Gopan-UAT' },
      }),
    ).toEqual({
      sub: '3092',
      username: 'Gopan-UAT',
      role: 'HOD',
    });
  });

  it('rejects an external role with no EXTERNAL_ROLE_MAP entry', () => {
    const strategy = new JwtStrategy(
      makeConfig({
        'auth.mode': 'external',
        'auth.externalRoleMap': '{"DESIGN HOD":"HOD"}',
        'auth.externalJwtSecret': 'external-secret',
      }),
    );

    expect(() =>
      strategy.validate(makeReq(), {
        sub: 'u1',
        email: 'a@b.com',
        role: 'Some Unmapped Role',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('falls back to the JWT role claim when the role cookie is absent', () => {
    const strategy = new JwtStrategy(
      makeConfig({
        'auth.mode': 'external',
        'auth.externalRoleCookie': 'role',
        'auth.externalRoleMap': '{"HOD":"HOD"}',
        'auth.externalJwtSecret': 'external-secret',
      }),
    );

    expect(
      strategy.validate(makeReq(), {
        sub: 'u1',
        email: 'a@b.com',
        role: 'HOD',
      }),
    ).toEqual({
      sub: 'u1',
      username: 'a@b.com',
      role: 'HOD',
    });
  });
});
