import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../constants/roles.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new RolesGuard(reflector);

  afterEach(() => {
    jest.clearAllMocks();
  });

  function makeContext(role?: UserRole) {
    const request = { user: role ? { role } : undefined };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return context;
  }

  it('allows access when no roles are required', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(UserRole.DESIGNER))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('allows access when user role matches required roles', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue([UserRole.HOD, UserRole.ADMIN]);
    expect(guard.canActivate(makeContext(UserRole.HOD))).toBe(true);
  });

  it('denies access when user role is not in required roles', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue([UserRole.HOD]);
    expect(guard.canActivate(makeContext(UserRole.DESIGNER))).toBe(false);
  });

  it('denies access when user is missing', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue([UserRole.HOD]);
    expect(guard.canActivate(makeContext())).toBe(false);
  });
});
