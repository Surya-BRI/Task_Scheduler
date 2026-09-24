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

  function makeConfig(authMode?: string) {
    return {
      get: jest.fn((key: string) => {
        if (key === 'app.nodeEnv') return process.env.NODE_ENV ?? 'development';
        if (key === 'jwt.accessExpiresIn') return '1d';
        if (key === 'auth.mode') return authMode;
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
});
