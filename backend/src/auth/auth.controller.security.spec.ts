import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController security', () => {
  const authService = {
    register: jest.fn(() => {
      throw new NotFoundException();
    }),
    login: jest.fn(),
    getMe: jest.fn(),
  } as unknown as AuthService;

  function makeConfig(authMode?: string, externalLogoutCookies: string[] = []) {
    return {
      get: jest.fn((key: string) => {
        if (key === 'app.nodeEnv') return process.env.NODE_ENV ?? 'development';
        if (key === 'jwt.accessExpiresIn') return '1d';
        if (key === 'auth.mode') return authMode;
        if (key === 'auth.externalLogoutCookies') return externalLogoutCookies;
        return undefined;
      }),
    } as unknown as ConfigService;
  }

  const configService = makeConfig();
  const controller = new AuthController(authService, configService);

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('disables public registration — accounts are ERP-managed', () => {
    expect(() => controller.register()).toThrow(NotFoundException);
  });

  it('rejects local login when AUTH_MODE=external — avoids the wrong-secret cookie collision', async () => {
    const externalController = new AuthController(authService, makeConfig('external'));
    const res = { cookie: jest.fn() } as unknown as Response;

    await expect(
      externalController.login({ email: 'a@b.com', password: 'x' }, res),
    ).rejects.toThrow(ConflictException);
    expect(authService.login).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('still allows local login when AUTH_MODE=demo', async () => {
    (authService.login as jest.Mock).mockResolvedValue({
      accessToken: 'tok',
      user: { id: '1', username: 'a', role: 'HOD' },
    });
    const res = { cookie: jest.fn() } as unknown as Response;

    await controller.login({ email: 'a@b.com', password: 'x' }, res);
    expect(authService.login).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalled();
  });

  it('logout clears access_token plus every configured sibling cookie (full SSO logout)', () => {
    const externalController = new AuthController(
      authService,
      makeConfig('external', ['role', 'department', 'session_id', 'user_name']),
    );
    const res = { clearCookie: jest.fn() } as unknown as Response;

    const result = externalController.logout(res);

    expect(result).toEqual({ ok: true });
    expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('role', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('department', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('session_id', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('user_name', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledTimes(5);
  });

  it('logout only clears access_token when no sibling cookies are configured', () => {
    const res = { clearCookie: jest.fn() } as unknown as Response;

    controller.logout(res);

    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
  });
});
