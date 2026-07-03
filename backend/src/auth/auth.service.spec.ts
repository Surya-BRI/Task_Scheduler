import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
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
    it('creates a user and returns safe profile fields', async () => {
      usersService.create = jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        fullName: 'New User',
        role: { name: 'DESIGNER' },
      });

      await expect(
        service.register({
          email: 'new@example.com',
          password: 'password123',
          fullName: 'New User',
          role: 'DESIGNER' as never,
        }),
      ).resolves.toEqual({
        id: 'user-1',
        email: 'new@example.com',
        fullName: 'New User',
        role: 'DESIGNER',
      });
    });
  });

  describe('login', () => {
    const dto = { email: 'user@example.com', password: 'secret123' };

    it('throws when user is not found', async () => {
      usersService.findByEmail = jest.fn().mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when password does not match', async () => {
      usersService.findByEmail = jest.fn().mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: 'hashed',
        fullName: 'User',
        role: { name: 'DESIGNER' },
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('returns access token and user on valid credentials', async () => {
      const user = {
        id: 'user-1',
        email: dto.email,
        passwordHash: 'hashed',
        fullName: 'User',
        role: { name: 'HOD' },
      };
      usersService.findByEmail = jest.fn().mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync = jest.fn().mockResolvedValue('signed-jwt');

      await expect(service.login(dto)).resolves.toEqual({
        accessToken: 'signed-jwt',
        user: {
          id: 'user-1',
          email: dto.email,
          fullName: 'User',
          role: 'HOD',
        },
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: dto.email,
        role: 'HOD',
      });
    });
  });

  describe('getMe', () => {
    it('delegates to usersService.findById', async () => {
      const profile = { id: 'user-1', email: 'me@example.com' };
      usersService.findById = jest.fn().mockResolvedValue(profile);

      await expect(service.getMe('user-1')).resolves.toEqual(profile);
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });
  });
});
