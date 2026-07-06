import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('JwtAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new JwtAuthGuard(reflector);

  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypass = process.env.ENABLE_DEV_AUTH_BYPASS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBypass === undefined) {
      delete process.env.ENABLE_DEV_AUTH_BYPASS;
    } else {
      process.env.ENABLE_DEV_AUTH_BYPASS = originalBypass;
    }
    jest.clearAllMocks();
  });

  function makeContext(headers: Record<string, string> = {}) {
    const request = { headers, user: undefined as unknown };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('allows public routes without authentication', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    const { context } = makeContext();
    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, expect.any(Array));
  });

  it('injects dev bypass user when enabled and headers are present', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_AUTH_BYPASS = 'true';
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);

    const { context, request } = makeContext({
      'x-dev-user-id': 'dev-id',
      'x-dev-user-email': 'dev@example.com',
      'x-dev-user-role': 'HOD',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({
      sub: 'dev-id',
      email: 'dev@example.com',
      role: 'HOD',
    });
  });

  it('does not use dev bypass in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEV_AUTH_BYPASS = 'true';
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);

    const superProto = Object.getPrototypeOf(JwtAuthGuard.prototype);
    const superSpy = jest.spyOn(superProto, 'canActivate').mockReturnValue(false as never);

    const { context, request } = makeContext({
      'x-dev-user-id': 'dev-id',
      'x-dev-user-email': 'dev@example.com',
      'x-dev-user-role': 'HOD',
    });

    guard.canActivate(context);
    expect(request.user).toBeUndefined();
    expect(superSpy).toHaveBeenCalled();
    superSpy.mockRestore();
  });

  it('handleRequest throws UnauthorizedException when user is missing', () => {
    expect(() => guard.handleRequest(null, undefined as never)).toThrow(UnauthorizedException);
  });

  it('handleRequest returns user when present', () => {
    const user = { sub: 'u1', email: 'a@b.com', role: 'HOD' };
    expect(guard.handleRequest(null, user)).toEqual(user);
  });
});
