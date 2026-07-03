import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
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

  /**
   * Public registration is disabled in production.
   * Use POST /users (HOD-only) for admin provisioning.
   */
  @Public()
  @Post('register')
  @Throttle({ register: { limit: 3, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return this.authService.register(dto);
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
}
