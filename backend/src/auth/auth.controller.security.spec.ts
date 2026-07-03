import { NotFoundException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController security', () => {
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    getMe: jest.fn(),
  } as unknown as AuthService;

  const controller = new AuthController(authService);

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('disables public registration in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      controller.register({
        email: 'attacker@example.com',
        password: 'password123',
        fullName: 'Attacker',
        role: 'HOD' as never,
      }),
    ).toThrow(NotFoundException);
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('allows registration outside production', async () => {
    process.env.NODE_ENV = 'development';
    authService.register = jest.fn().mockResolvedValue({ id: '1' });
    await controller.register({
      email: 'dev@example.com',
      password: 'password123',
      fullName: 'Dev User',
      role: 'DESIGNER' as never,
    });
    expect(authService.register).toHaveBeenCalled();
  });
});
