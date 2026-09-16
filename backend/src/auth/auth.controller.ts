import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { ACCESS_TOKEN_COOKIE } from '../common/constants/auth-cookie.constants';
import { buildAccessTokenCookieOptions } from '../common/utils/auth-cookie.util';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /** Disabled — accounts are ERP-managed (ErpAuthUsers), not created by Scheduler. */
  @Public()
  @Post('register')
  @Throttle({ register: { limit: 3, ttl: 60_000 } })
  register() {
    return this.authService.register();
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    const cookieOptions = buildAccessTokenCookieOptions(this.configService);
    res.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, cookieOptions);

    return {
      user: result.user,
      ...(process.env.NODE_ENV !== 'production' ? { accessToken: result.accessToken } : {}),
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, buildAccessTokenCookieOptions(this.configService));
    return { ok: true };
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
