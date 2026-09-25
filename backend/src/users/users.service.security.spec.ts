import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from '../common/constants/roles.enum';

describe('UsersService IDOR protection', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };

  const service = new UsersService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows users to read their own profile', async () => {
    prisma.$queryRaw.mockResolvedValue([{ userId: 42n, userName: 'me', roleName: 'Designer' }]);

    await expect(service.findByIdForViewer('42', '42', UserRole.DESIGNER)).resolves.toEqual({
      id: '42',
      userName: 'me',
      role: UserRole.DESIGNER,
    });
  });

  it('allows HOD to read any profile', async () => {
    prisma.$queryRaw.mockResolvedValue([{ userId: 43n, userName: 'other', roleName: 'SalesRep' }]);

    await expect(service.findByIdForViewer('43', '99', UserRole.HOD)).resolves.toEqual({
      id: '43',
      userName: 'other',
      role: UserRole.SALESPERSON,
    });
  });

  it.each(['Admin', 'Sub Admin'])('maps the ERP "%s" role to HOD', async (roleName) => {
    prisma.$queryRaw.mockResolvedValue([{ userId: 44n, userName: 'boss', roleName }]);

    await expect(service.findByIdForViewer('44', '44', UserRole.HOD)).resolves.toEqual({
      id: '44',
      userName: 'boss',
      role: UserRole.HOD,
    });
  });

  it('blocks designers from reading another user profile', async () => {
    await expect(
      service.findByIdForViewer('43', '99', UserRole.DESIGNER),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('findById throws when user is missing', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.findById('999')).rejects.toThrow(NotFoundException);
  });

});
