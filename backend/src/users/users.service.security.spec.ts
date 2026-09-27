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

  it.each(['Admin', 'Sub Admin'])('maps the ERP "%s" role to ADMIN, not HOD', async (roleName) => {
    prisma.$queryRaw.mockResolvedValue([{ userId: 44n, userName: 'boss', roleName }]);

    await expect(service.findByIdForViewer('44', '44', UserRole.ADMIN)).resolves.toEqual({
      id: '44',
      userName: 'boss',
      role: UserRole.ADMIN,
    });
  });

  it('allows ADMIN to read any profile (HOD-level access)', async () => {
    prisma.$queryRaw.mockResolvedValue([{ userId: 43n, userName: 'other', roleName: 'SalesRep' }]);

    await expect(service.findByIdForViewer('43', '99', UserRole.ADMIN)).resolves.toMatchObject({ id: '43' });
  });

  it('keeps Admin users out of the HOD role filter', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { userId: 1n, userName: 'hod', roleName: 'Design HOD' },
      { userId: 2n, userName: 'admin', roleName: 'Admin' },
    ]);

    const hods = await service.findAll({ role: UserRole.HOD });
    expect(hods.map((u) => u.userName)).toEqual(['hod']);
  });

  describe('backup HOD reviewers in the HOD/DESIGNER role filters', () => {
    const ORIGINAL_ENV = process.env.BACKUP_HOD_REVIEWER_USER_IDS;

    beforeEach(() => {
      process.env.BACKUP_HOD_REVIEWER_USER_IDS = '208,202';
      prisma.$queryRaw.mockResolvedValue([
        { userId: 216n, userName: 'Gopan', roleName: 'Design HOD' },
        { userId: 208n, userName: 'ArjunEljo', roleName: 'Designer' },
        { userId: 202n, userName: 'Saji', roleName: 'Designer' },
        { userId: 200n, userName: 'Sebastian', roleName: 'Designer' },
      ]);
    });

    afterEach(() => {
      process.env.BACKUP_HOD_REVIEWER_USER_IDS = ORIGINAL_ENV;
    });

    it('lists listed backup reviewers alongside real HODs when filtering role=HOD', async () => {
      const hods = await service.findAll({ role: UserRole.HOD });
      expect(hods.map((u) => u.userName).sort()).toEqual(['ArjunEljo', 'Gopan', 'Saji']);
      // Their reported role stays the truth (DESIGNER) — only the filter match is widened.
      expect(hods.find((u) => u.userName === 'ArjunEljo')?.role).toBe(UserRole.DESIGNER);
    });

    it('still lists backup reviewers when filtering role=DESIGNER (normal designer work unaffected)', async () => {
      const designers = await service.findAll({ role: UserRole.DESIGNER });
      expect(designers.map((u) => u.userName).sort()).toEqual(['ArjunEljo', 'Saji', 'Sebastian']);
    });

    it('does not widen the filter for a designer not on the backup-reviewer list', async () => {
      const hods = await service.findAll({ role: UserRole.HOD });
      expect(hods.map((u) => u.userName)).not.toContain('Sebastian');
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
