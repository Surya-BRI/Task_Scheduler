import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    return user;
  }

  /**
   * Short-lived token for the dashboard Socket.IO handshake (auth.token) — used
   * instead of the long-lived httpOnly session cookie so a cross-origin frontend
   * deployment (e.g. Vercel, which can't proxy the WS upgrade same-origin) can
   * open the socket directly against the backend without exposing the full
   * session token to client JS for longer than a single connection attempt.
   */
  async mintSocketToken(userId: string, email: string, role: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, email, role }, { expiresIn: '2m' });
  }
}
