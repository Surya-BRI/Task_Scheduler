import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
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

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'app.nodeEnv') return process.env.NODE_ENV ?? 'development';
      if (key === 'jwt.accessExpiresIn') return '1d';
      return undefined;
    }),
  } as unknown as ConfigService;

  const controller = new AuthController(authService, configService);

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('disables public registration — accounts are ERP-managed', () => {
    expect(() => controller.register()).toThrow(NotFoundException);
  });
});
