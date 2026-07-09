import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';
import type { UserRole } from '../constants/roles.enum';

/**
 * JWT Auth Guard with an optional dev-bypass for integration testing.
 *
 * Dev bypass requires ENABLE_DEV_AUTH_BYPASS=true and NODE_ENV !== 'production'.
 * When enabled, requests without Authorization may use:
 *   X-Dev-User-Id, X-Dev-User-Email, X-Dev-User-Role
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: JwtPayload;
    }>();

    const devBypassEnabled =
      process.env.NODE_ENV !== 'production' &&
      process.env.ENABLE_DEV_AUTH_BYPASS === 'true';

    if (devBypassEnabled) {
      const hasAuthHeader = !!(request.headers['authorization'] ?? request.headers['Authorization']);
      const devId = request.headers['x-dev-user-id'];
      const devEmail = request.headers['x-dev-user-email'];
      const devRole = request.headers['x-dev-user-role'];

      if (!hasAuthHeader && devId && devEmail && devRole) {
        request.user = {
          sub: devId,
          email: devEmail,
          role: devRole as UserRole,
        };
        return true;
      }
    }

    return super.canActivate(context);
  }

  handleRequest<T = JwtPayload>(err: Error | null, user: T): T {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
