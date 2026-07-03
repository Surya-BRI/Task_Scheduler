import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from '../common/constants/roles.enum';

describe('UsersService IDOR protection', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
  };

  const service = new UsersService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows users to read their own profile', async () => {
    const profile = { id: 'self-id', email: 'me@example.com' };
    prisma.user.findUnique.mockResolvedValue(profile);

    await expect(service.findByIdForViewer('self-id', 'self-id', UserRole.DESIGNER)).resolves.toEqual(
      profile,
    );
  });

  it('allows HOD to read any profile', async () => {
    const profile = { id: 'other-id', email: 'other@example.com' };
    prisma.user.findUnique.mockResolvedValue(profile);

    await expect(service.findByIdForViewer('other-id', 'hod-id', UserRole.HOD)).resolves.toEqual(profile);
  });

  it('blocks designers from reading another user profile', async () => {
    await expect(
      service.findByIdForViewer('other-id', 'designer-id', UserRole.DESIGNER),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('findById throws when user is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing-id')).rejects.toThrow(NotFoundException);
  });
});
