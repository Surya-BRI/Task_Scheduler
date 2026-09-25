import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService, ErpLoginResult } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /** Accounts are ERP-managed now — Scheduler no longer registers local users. */
  register(): never {
    throw new NotFoundException();
  }

  async login(dto: LoginDto) {
    const erpUser = await this.usersService.validateErpLogin(dto.email, dto.password);
    if (!erpUser) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueSession(erpUser);
  }

  private async issueSession(user: ErpLoginResult) {
    const sub = user.userId.toString();
    const payload = {
      sub,
      username: user.userName,
      role: user.role,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: sub,
        username: user.userName,
        role: user.role,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    return user;
  }

  async mintSocketToken(userId: string, username: string, role: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, username, role }, { expiresIn: '2m' });
  }
}
