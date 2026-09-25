import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ErpSessionService } from './erp-session.service';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { UserRole } from '../common/constants/roles.enum';

describe('AuthController security', () => {
  const authService = {
    register: jest.fn(() => {
      throw new NotFoundException();
    }),
    login: jest.fn(),
    getMe: jest.fn(),
  } as unknown as AuthService;

  const erpSessionService = { endSession: jest.fn() } as unknown as ErpSessionService;
  const user: JwtPayload = { sub: '3103', username: 'surya-uat', role: UserRole.HOD };

  function makeConfig(authMode?: string, externalLogoutCookies: string[] = [], sessionCookie = '') {
    return {
      get: jest.fn((key: string) => {
        if (key === 'app.nodeEnv') return process.env.NODE_ENV ?? 'development';
        if (key === 'jwt.accessExpiresIn') return '1d';
        if (key === 'auth.mode') return authMode;
        if (key === 'auth.externalLogoutCookies') return externalLogoutCookies;
        if (key === 'auth.externalSessionCookie') return sessionCookie;
        return undefined;
      }),
    } as unknown as ConfigService;
  }

  function makeReq(cookie?: string) {
    return { headers: { cookie } } as unknown as Request;
  }

  function makeController(config = makeConfig()) {
    return new AuthController(authService, config, erpSessionService);
  }

  const controller = makeController();

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('disables public registration — accounts are ERP-managed', () => {
    expect(() => controller.register()).toThrow(NotFoundException);
  });

  it('rejects local login when AUTH_MODE=external — avoids the wrong-secret cookie collision', async () => {
    const externalController = makeController(makeConfig('external'));
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

  it('logout clears access_token plus every configured sibling cookie (full SSO logout)', async () => {
    const externalController = makeController(
      makeConfig('external', ['role', 'department', 'session_id', 'user_name']),
    );
    const res = { clearCookie: jest.fn() } as unknown as Response;

    const result = await externalController.logout(user, makeReq(), res);

    expect(result).toEqual({ ok: true, sessionEnded: false });
    expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('role', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('department', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('session_id', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('user_name', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledTimes(5);
  });

  it('logout only clears access_token when no sibling cookies are configured', async () => {
    const res = { clearCookie: jest.fn() } as unknown as Response;

    await controller.logout(user, makeReq(), res);

    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
  });

  describe('ending the ERP session on logout', () => {
    const makeRes = () => ({ clearCookie: jest.fn() }) as unknown as Response;

    it("ends the caller's own ERP session from the configured session cookie", async () => {
      (erpSessionService.endSession as jest.Mock).mockResolvedValue(true);
      const c = makeController(makeConfig('external', [], 'session_id'));

      const result = await c.logout(user, makeReq('access_token=x; session_id=36891'), makeRes());

      expect(erpSessionService.endSession).toHaveBeenCalledWith(36891n, 3103n);
      expect(result.sessionEnded).toBe(true);
    });

    it('does nothing when EXTERNAL_SESSION_COOKIE is not configured', async () => {
      const result = await controller.logout(user, makeReq('session_id=36891'), makeRes());

      expect(erpSessionService.endSession).not.toHaveBeenCalled();
      expect(result.sessionEnded).toBe(false);
    });

    it('ignores a missing or non-numeric session id', async () => {
      const c = makeController(makeConfig('external', [], 'session_id'));

      await c.logout(user, makeReq(), makeRes());
      await c.logout(user, makeReq('session_id=1%3B%20DROP%20TABLE%20x'), makeRes());
      await c.logout(user, makeReq('session_id=abc'), makeRes());

      expect(erpSessionService.endSession).not.toHaveBeenCalled();
    });

    it('still clears cookies and succeeds when ending the ERP session fails', async () => {
      (erpSessionService.endSession as jest.Mock).mockRejectedValue(new Error('db down'));
      const c = makeController(makeConfig('external', [], 'session_id'));
      const res = makeRes();

      const result = await c.logout(user, makeReq('session_id=36891'), res);

      expect(result).toEqual({ ok: true, sessionEnded: false });
      expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
    });
  });
});
