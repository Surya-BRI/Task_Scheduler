import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtPayload } from '../types/jwt-payload.type';
import type { UserRole } from '../constants/roles.enum';

/**
 * JWT Auth Guard with an optional dev-bypass for integration testing.
 *
 * In NODE_ENV=development, if no Authorization header is present, the guard
 * accepts requests that carry the following headers instead:
 *
 *   X-Dev-User-Id: <uuid>            — used as JwtPayload.sub
 *   X-Dev-User-Email: <email>        — used as JwtPayload.email
 *   X-Dev-User-Role: HOD|DESIGNER|… — used as JwtPayload.role
 *
 * This lets the frontend / Postman call the API without a JWT while
 * the production auth is being wired up.
 * These headers are IGNORED in production (NODE_ENV=production).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: JwtPayload;
    }>();

    // Dev-bypass: only enabled outside production
    if (process.env.NODE_ENV !== 'production') {
      const hasAuthHeader = !!(request.headers['authorization'] ?? request.headers['Authorization']);
      const devId    = request.headers['x-dev-user-id'];
      const devEmail = request.headers['x-dev-user-email'];
      const devRole  = request.headers['x-dev-user-role'];

      if (!hasAuthHeader && devId && devEmail && devRole) {
        request.user = {
          sub:   devId,
          email: devEmail,
          role:  devRole as UserRole,
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
