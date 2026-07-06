import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import type { UserRole } from '../common/constants/roles.enum';
import { resolveJwtSecret } from '../common/utils/resolve-jwt-secret.util';
import { ACCESS_TOKEN_COOKIE } from '../common/constants/auth-cookie.constants';
import { parseCookieHeader } from '../common/utils/auth-cookie.util';

/**
 * JWT Strategy — supports two auth modes:
 *
 *  MODE: "demo"     (AUTH_MODE=demo | default)
 *  ─────────────────────────────────────────────────────
 *  Validates tokens signed by this app's own JWT_ACCESS_SECRET.
 *  Payload: { sub, email, role }
 *
 *  MODE: "external" (AUTH_MODE=external)
 *  ─────────────────────────────────────────────────────
 *  Validates tokens signed by the pre-existing ERP website using EXTERNAL_JWT_SECRET.
 *  The external payload format may differ — we normalise it here via normalisePayload().
 *  Map EXTERNAL_ROLE_FIELD / EXTERNAL_SUB_FIELD / EXTERNAL_EMAIL_FIELD to customise
 *  which JWT claims map to our internal fields.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly authMode: string;
  private readonly subField: string;
  private readonly emailField: string;
  private readonly roleField: string;

  constructor(private readonly configService: ConfigService) {
    const authMode = (configService.get<string>('auth.mode') ?? 'demo').toLowerCase();

    super({
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
    this.subField   = configService.get<string>('auth.externalSubField')   ?? 'sub';
    this.emailField = configService.get<string>('auth.externalEmailField') ?? 'email';
    this.roleField  = configService.get<string>('auth.externalRoleField')  ?? 'role';
  }

  validate(rawPayload: Record<string, unknown>): JwtPayload {
    if (this.authMode === 'external') {
      return this.normaliseExternalPayload(rawPayload);
    }
    // Demo / internal mode — our own format: { sub, email, role }
    const { sub, email, role } = rawPayload as unknown as JwtPayload;
    if (!sub || !email || !role) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return { sub, email, role };
  }

  /**
   * Map the external ERP website's JWT payload to our internal JwtPayload shape.
   * Configured entirely through environment variables — no code changes needed
   * when the external site payload format changes.
   */
  private readClaim(payload: Record<string, unknown>, field: string): string {
    const value = payload[field];
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private normaliseExternalPayload(payload: Record<string, unknown>): JwtPayload {
    const sub = this.readClaim(payload, this.subField);
    const email = this.readClaim(payload, this.emailField);
    const rawRole = this.readClaim(payload, this.roleField).toUpperCase();

    if (!sub) {
      this.logger.warn('External JWT missing sub field; using email as sub');
    }

    // Map external role labels to our internal UserRole enum values
    const roleMap = this.buildExternalRoleMap();
    const role = (roleMap[rawRole] ?? rawRole) as UserRole;

    return { sub: sub || email, email, role };
  }

  /**
   * Reads EXTERNAL_ROLE_MAP as a JSON string like:
   *   '{"Hod":"HOD","Designer":"DESIGNER"}'
   * Falls back to identity mapping.
   */
  private buildExternalRoleMap(): Record<string, string> {
    try {
      const raw = this.configService.get<string>('auth.externalRoleMap') ?? '{}';
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
}
