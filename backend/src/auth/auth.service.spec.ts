import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  const usersService = {
    validateErpLogin: jest.fn(),
    findById: jest.fn(),
  } as unknown as UsersService;

  const jwtService = {
    signAsync: jest.fn(),
  } as unknown as JwtService;

  const service = new AuthService(usersService, jwtService);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('is disabled — accounts are ERP-managed', () => {
      expect(() => service.register()).toThrow(NotFoundException);
    });
  });

  describe('login', () => {
    const dto = { email: 'Sithara-UAT', password: 'tester@321' };

    it('throws when the ERP account does not validate', async () => {
      (usersService.validateErpLogin as jest.Mock).mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('returns access token and user on valid credentials', async () => {
      (usersService.validateErpLogin as jest.Mock).mockResolvedValue({
        userId: 3090n,
        userName: 'Sithara-UAT',
        role: 'SALESPERSON',
      });
      jwtService.signAsync = jest.fn().mockResolvedValue('signed-jwt');

      await expect(service.login(dto)).resolves.toEqual({
        accessToken: 'signed-jwt',
        user: {
          id: '3090',
          username: 'Sithara-UAT',
          role: 'SALESPERSON',
        },
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: '3090',
        username: 'Sithara-UAT',
        role: 'SALESPERSON',
      });
    });
  });

  describe('getMe', () => {
    it('delegates to usersService.findById', async () => {
      const profile = { id: '3090', userName: 'Sithara-UAT' };
      (usersService.findById as jest.Mock).mockResolvedValue(profile);

      await expect(service.getMe('3090')).resolves.toEqual(profile);
      expect(usersService.findById).toHaveBeenCalledWith('3090');
    });
  });
});
