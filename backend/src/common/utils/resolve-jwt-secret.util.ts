import { ConfigService } from '@nestjs/config';

/** Resolve JWT signing/verification secret from configuration (no hardcoded fallbacks). */
export function resolveJwtSecret(configService: ConfigService): string {
  const authMode = (configService.get<string>('auth.mode') ?? 'demo').toLowerCase();
  const secret =
    authMode === 'external'
      ? configService.get<string>('auth.externalJwtSecret') ?? configService.get<string>('jwt.accessSecret')
      : configService.get<string>('jwt.accessSecret');

  if (!secret) {
    throw new Error('JWT secret is not configured. Set JWT_ACCESS_SECRET (and EXTERNAL_JWT_SECRET for external auth).');
  }

  return secret;
}
