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
    it('delegates to usersService.findById and adds the backup-HOD-reviewer flag', async () => {
      const profile = { id: '3090', userName: 'Sithara-UAT' };
      (usersService.findById as jest.Mock).mockResolvedValue(profile);

      await expect(service.getMe('3090')).resolves.toEqual({
        ...profile,
        isBackupHodReviewer: false,
      });
      expect(usersService.findById).toHaveBeenCalledWith('3090');
    });

    it('flags a listed backup HOD reviewer', async () => {
      const ORIGINAL_ENV = process.env.BACKUP_HOD_REVIEWER_USER_IDS;
      process.env.BACKUP_HOD_REVIEWER_USER_IDS = '208';
      const profile = { id: '208', userName: 'ArjunEljo' };
      (usersService.findById as jest.Mock).mockResolvedValue(profile);

      await expect(service.getMe('208')).resolves.toMatchObject({ isBackupHodReviewer: true });

      process.env.BACKUP_HOD_REVIEWER_USER_IDS = ORIGINAL_ENV;
    });
  });
});
