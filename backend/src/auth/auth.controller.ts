import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ErpSessionService } from './erp-session.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { ACCESS_TOKEN_COOKIE } from '../common/constants/auth-cookie.constants';
import { buildAccessTokenCookieOptions, parseCookieHeader } from '../common/utils/auth-cookie.util';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly erpSessionService: ErpSessionService,
  ) {}

  /** Disabled — accounts are ERP-managed (ErpAuthUsers), not created by Scheduler. */
  @Public()
  @Post('register')
  @Throttle({ register: { limit: 3, ttl: 60_000 } })
  register() {
    return this.authService.register();
  }

  /**
   * Disabled in external auth mode — sign-in happens on the ERP site and arrives here
   * via a shared cookie (see jwt.strategy.ts). A local login here would sign a token
   * with the wrong secret (JWT_ACCESS_SECRET, not EXTERNAL_JWT_SECRET), producing a
   * cookie the app can't verify and corrupting the session alongside the real one.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    if ((this.configService.get<string>('auth.mode') ?? 'demo').toLowerCase() === 'external') {
      throw new ConflictException('Local sign-in is disabled — sign in via the ERP portal.');
    }
    const result = await this.authService.login(dto);
    const cookieOptions = buildAccessTokenCookieOptions(this.configService);
    res.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, cookieOptions);

    return {
      user: result.user,
      ...(process.env.NODE_ENV !== 'production' ? { accessToken: result.accessToken } : {}),
    };
  }

  /**
   * A full SSO logout, not just this app's view of the session: with COOKIE_DOMAIN set to the
   * shared parent domain, clearing access_token here removes the browser's one copy of it
   * regardless of which app originally set it — signing the user out of the ERP portal (and
   * anything else on that domain) too, not just Scheduler. EXTERNAL_LOGOUT_COOKIES clears the
   * sibling role/department/etc cookies the ERP site also sets, for a clean logout.
   */
  /**
   * Authenticated on purpose: ending an ERP session must be tied to the caller's own user, so
   * nobody can log out someone else's session by guessing its id. The guard is explicit because
   * JwtAuthGuard is not global (only the throttler is) — dropping @Public alone leaves it open.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionEnded = await this.endErpSession(user, req);

    const cookieOptions = buildAccessTokenCookieOptions(this.configService);
    res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions);

    const siblingCookies = this.configService.get<string[]>('auth.externalLogoutCookies') ?? [];
    for (const name of siblingCookies) {
      res.clearCookie(name, cookieOptions);
    }

    return { ok: true, sessionEnded };
  }

  /** Best-effort: marks the caller's ERP session logged out (needs EXTERNAL_SESSION_COOKIE). Never throws. */
  private async endErpSession(user: JwtPayload, req: Request): Promise<boolean> {
    const cookieName = this.configService.get<string>('auth.externalSessionCookie');
    if (!cookieName) return false;

    const rawSessionId = parseCookieHeader(req.headers.cookie)[cookieName];
    if (!rawSessionId || !/^\d+$/.test(rawSessionId) || !/^\d+$/.test(user.sub)) return false;

    try {
      return await this.erpSessionService.endSession(BigInt(rawSessionId), BigInt(user.sub));
    } catch (err) {
      this.logger.warn(`Could not end ERP session: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  /**
   * Mints a short-lived token for the dashboard Socket.IO handshake. Called by the
   * frontend's own same-origin BFF route (which holds the httpOnly session cookie),
   * not directly by the browser — see frontend/src/app/api/auth/ws-token/route.ts.
   */
  @Get('ws-token')
  @UseGuards(JwtAuthGuard)
  async getWsToken(@CurrentUser() user: JwtPayload) {
    const token = await this.authService.mintSocketToken(user.sub, user.username, user.role);
    return { token };
  }
}
