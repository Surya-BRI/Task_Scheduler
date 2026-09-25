import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { UserRole } from '../common/constants/roles.enum';
import { resolveJwtSecret } from '../common/utils/resolve-jwt-secret.util';
import { ACCESS_TOKEN_COOKIE } from '../common/constants/auth-cookie.constants';
import { parseCookieHeader } from '../common/utils/auth-cookie.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly authMode: string;
  private readonly subField: string;
  private readonly usernameField: string;
  private readonly roleField: string;
  private readonly roleCookie: string;
  private readonly roleNameField: string;

  constructor(private readonly configService: ConfigService) {
    const authMode = (configService.get<string>('auth.mode') ?? 'demo').toLowerCase();

    super({
      passReqToCallback: true,
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          const cookieHeader = req?.headers?.cookie;
          if (!cookieHeader) return null;
          return parseCookieHeader(cookieHeader)[ACCESS_TOKEN_COOKIE] ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
    });

    this.authMode = authMode;
    this.subField      = configService.get<string>('auth.externalSubField')   ?? 'sub';
    this.usernameField = configService.get<string>('auth.externalEmailField') ?? 'email';
    this.roleField     = configService.get<string>('auth.externalRoleField')  ?? 'role';
    this.roleCookie     = configService.get<string>('auth.externalRoleCookie')     ?? '';
    this.roleNameField  = configService.get<string>('auth.externalRoleNameField')  ?? 'roleName';
  }

  validate(req: Request, rawPayload: Record<string, unknown>): JwtPayload {
    if (this.authMode === 'external') {
      return this.normaliseExternalPayload(req, rawPayload);
    }
    // Demo / internal mode — our own format: { sub, username, role }
    const { sub, username, role } = rawPayload as unknown as JwtPayload;
    if (!sub || !username || !role) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return { sub, username, role };
  }

  private readClaim(payload: Record<string, unknown>, field: string): string {
    const value = field
      .split('.')
      .reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), payload);
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private readExternalRoleName(req: Request, payload: Record<string, unknown>): string {
    if (this.roleCookie) {
      const cookieHeader = req?.headers?.cookie;
      const raw = cookieHeader ? parseCookieHeader(cookieHeader)[this.roleCookie] : undefined;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const roleName = parsed[this.roleNameField];
          if (typeof roleName === 'string' && roleName.trim()) {
            return roleName.trim();
          }
        } catch {
          this.logger.warn(`Could not parse "${this.roleCookie}" cookie as JSON`);
        }
      }
    }
    return this.readClaim(payload, this.roleField);
  }

  private normaliseExternalPayload(req: Request, payload: Record<string, unknown>): JwtPayload {
    const sub = this.readClaim(payload, this.subField);
    const username = this.readClaim(payload, this.usernameField);
    const rawRole = this.readExternalRoleName(req, payload).toUpperCase();

    if (!sub) {
      this.logger.warn('External JWT missing sub field; using username as sub');
    }

    const roleMap = this.buildExternalRoleMap();
    const isCanonicalRole = (Object.values(UserRole) as string[]).includes(rawRole);
    const mapped = roleMap[rawRole] ?? (isCanonicalRole ? rawRole : undefined);
    if (!mapped) {
      throw new UnauthorizedException(`Unmapped external role: "${rawRole}"`);
    }

    return { sub: sub || username, username, role: mapped as UserRole };
  }

  private buildExternalRoleMap(): Record<string, string> {
    try {
      const raw = this.configService.get<string>('auth.externalRoleMap') ?? '{}';
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
}
