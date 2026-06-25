import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { UserRole } from '../common/constants/roles.enum';
import { PrismaService } from '../prisma/prisma.service';
import { DUPLICATE_LEAVE_ERROR_MESSAGE } from './leave-request.validation';
import { RequestsService } from './requests.service';

describe('RequestsService', () => {
  let service: RequestsService;

  const designerId = '11111111-1111-4111-8111-111111111111';
  const hodId = '22222222-2222-4222-8222-222222222222';
  const leaveId = '33333333-3333-4333-8333-333333333333';

  const mockActivityLogger = { log: jest.fn() };

  const mockPrisma: any = {
    leaveRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    notification: { create: jest.fn() },
    schedulerWeek: { upsert: jest.fn() },
    $executeRawUnsafe: jest.fn(),
  };

  const designerUser = {
    id: designerId,
    fullName: 'Alex Johnson',
    role: { name: UserRole.DESIGNER },
    departmentId: 'dept-1',
  };

  const pendingLeave = {
    id: leaveId,
    userId: designerId,
    type: 'Leave',
    reason: 'Vacation',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-03T00:00:00.000Z'),
    status: 'Pending',
    createdAt: new Date(),
    approverId: null,
    approverRemarks: null,
    reviewedAt: null,
    halfDaySession: null,
    user: designerUser,
    approver: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLoggerService, useValue: mockActivityLogger },
      ],
    }).compile();

    service = module.get(RequestsService);
    jest.clearAllMocks();
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.schedulerWeek.upsert.mockResolvedValue({});
  });

  describe('create', () => {
    const futureStart = () => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 14);
      return d.toISOString().slice(0, 10);
    };

    it('rejects past dates', async () => {
      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Leave',
          startDate: '2020-01-01',
          reasonCategory: 'Vacation',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects end date before start date', async () => {
      const start = futureStart();
      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Leave',
          startDate: start,
          endDate: '2020-01-01',
          reasonCategory: 'Vacation',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects missing reason', async () => {
      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Leave',
          startDate: futureStart(),
          reasonCategory: 'Other',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects overlapping pending leave', async () => {
      const start = futureStart();
      mockPrisma.user.findUnique.mockResolvedValue({ role: { name: UserRole.DESIGNER } });
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'existing',
          startDate: new Date(`${start}T00:00:00.000Z`),
          endDate: new Date(`${start}T00:00:00.000Z`),
          status: 'Pending',
        },
      ]);

      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Leave',
          startDate: start,
          endDate: start,
          reasonCategory: 'Vacation',
        }),
      ).rejects.toThrow(DUPLICATE_LEAVE_ERROR_MESSAGE);
    });

    it('rejects multi-day overlap with existing approved leave', async () => {
      const start = futureStart();
      const endDate = new Date(start);
      endDate.setUTCDate(endDate.getUTCDate() + 4);
      const end = endDate.toISOString().slice(0, 10);
      const overlapDay = new Date(start);
      overlapDay.setUTCDate(overlapDay.getUTCDate() + 2);
      const overlapIso = overlapDay.toISOString().slice(0, 10);

      mockPrisma.user.findUnique.mockResolvedValue({ role: { name: UserRole.DESIGNER } });
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'approved-block',
          startDate: new Date(`${overlapIso}T00:00:00.000Z`),
          endDate: new Date(`${overlapIso}T00:00:00.000Z`),
          status: 'APPROVED',
        },
      ]);

      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Leave',
          startDate: start,
          endDate: end,
          reasonCategory: 'Vacation',
        }),
      ).rejects.toThrow(DUPLICATE_LEAVE_ERROR_MESSAGE);
    });

    it('allows reapplication over cancelled and revoked leave dates', async () => {
      const start = futureStart();
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: UserRole.DESIGNER },
        departmentId: 'dept-1',
      });
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'cancelled-block',
          startDate: new Date(`${start}T00:00:00.000Z`),
          endDate: new Date(`${start}T00:00:00.000Z`),
          status: 'CANCELLED',
        },
        {
          id: 'revoked-block',
          startDate: new Date(`${start}T00:00:00.000Z`),
          endDate: new Date(`${start}T00:00:00.000Z`),
          status: 'REVOKED',
        },
      ]);
      mockPrisma.leaveRequest.create.mockResolvedValue({
        ...pendingLeave,
        startDate: new Date(`${start}T00:00:00.000Z`),
        endDate: new Date(`${start}T00:00:00.000Z`),
      });

      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Full Day',
          startDate: start,
          endDate: start,
          reasonCategory: 'Vacation',
        }),
      ).resolves.toMatchObject({ status: 'PENDING' });
      expect(mockPrisma.leaveRequest.create).toHaveBeenCalled();
    });

    it('creates valid leave request', async () => {
      const start = futureStart();
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: UserRole.DESIGNER },
        departmentId: 'dept-1',
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: hodId, fullName: 'HOD' }]);
      mockPrisma.leaveRequest.create.mockResolvedValue({
        ...pendingLeave,
        startDate: new Date(`${start}T00:00:00.000Z`),
        endDate: new Date(`${start}T00:00:00.000Z`),
      });

      const result = await service.create(designerId, UserRole.DESIGNER, {
        userId: designerId,
        type: 'Full Day',
        startDate: start,
        endDate: start,
        reasonCategory: 'Vacation',
      });

      expect(result.status).toBe('PENDING');
      expect(result.type).toBe('Full Day');
      expect(result.leaveDurationDays).toBe(1);
      expect(mockPrisma.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'Full Day' }),
        }),
      );
      expect(mockActivityLogger.log).toHaveBeenCalled();
    });

    it('creates half-day leave with 0.5 day duration', async () => {
      const start = futureStart();
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: UserRole.DESIGNER },
        departmentId: 'dept-1',
      });
      mockPrisma.leaveRequest.create.mockResolvedValue({
        ...pendingLeave,
        type: 'Half Day',
        halfDaySession: 'First Half',
        startDate: new Date(`${start}T00:00:00.000Z`),
        endDate: new Date(`${start}T00:00:00.000Z`),
      });

      const result = await service.create(designerId, UserRole.DESIGNER, {
        userId: designerId,
        type: 'Half Day',
        halfDaySession: 'First Half',
        startDate: start,
        endDate: start,
        reasonCategory: 'Vacation',
      });

      expect(result.type).toBe('Half Day');
      expect(result.halfDaySession).toBe('First Half');
      expect(result.leaveDurationDays).toBe(0.5);
      expect(result.leaveDurationLabel).toBe('0.5 day');
    });

    it('rejects half-day leave without a session', async () => {
      const start = futureStart();
      mockPrisma.user.findUnique.mockResolvedValue({ role: { name: UserRole.DESIGNER } });

      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Half Day',
          startDate: start,
          endDate: start,
          reasonCategory: 'Vacation',
        }),
      ).rejects.toThrow('Half Day leave requires a session');
    });

    it('rejects multi-day half-day leave', async () => {
      const start = futureStart();
      const end = new Date(`${start}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      mockPrisma.user.findUnique.mockResolvedValue({ role: { name: UserRole.DESIGNER } });

      await expect(
        service.create(designerId, UserRole.DESIGNER, {
          userId: designerId,
          type: 'Half Day',
          halfDaySession: 'Second Half',
          startDate: start,
          endDate: end.toISOString().slice(0, 10),
          reasonCategory: 'Vacation',
        }),
      ).rejects.toThrow('Half Day leave must start and end on the same date');
    });
  });

  describe('update', () => {
    it('allows designer to update own pending leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      mockPrisma.leaveRequest.update.mockResolvedValue({
        ...pendingLeave,
        reason: 'Updated reason',
      });

      const result = await service.update(leaveId, designerId, UserRole.DESIGNER, {
        reason: 'Updated reason',
      });

      expect(result.reason).toBe('Updated reason');
      expect(mockActivityLogger.log).toHaveBeenCalled();
    });

    it('blocks update on approved leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue({ ...pendingLeave, status: 'APPROVED' });

      await expect(
        service.update(leaveId, designerId, UserRole.DESIGNER, { reason: 'Nope' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks HOD from updating leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);

      await expect(
        service.update(leaveId, hodId, UserRole.HOD, { reason: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('cancels pending leave for owner', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);
      mockPrisma.leaveRequest.update.mockResolvedValue({ ...pendingLeave, status: 'CANCELLED' });

      const result = await service.cancel(leaveId, designerId, UserRole.DESIGNER);
      expect(result.status).toBe('CANCELLED');
    });

    it('blocks cancellation of approved leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue({ ...pendingLeave, status: 'APPROVED' });

      await expect(service.cancel(leaveId, designerId, UserRole.DESIGNER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('blocks cancellation by non-owner', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);

      await expect(service.cancel(leaveId, hodId, UserRole.DESIGNER)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('review', () => {
    it('blocks HOD self-approval and self-rejection', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue({
        ...pendingLeave,
        userId: hodId,
        user: {
          id: hodId,
          fullName: 'HOD User',
          role: { name: UserRole.HOD },
          departmentId: 'dept-1',
        },
      });

      await expect(
        service.review(leaveId, hodId, UserRole.HOD, { status: 'APPROVED' }),
      ).rejects.toThrow('You cannot approve or reject your own leave request');
    });

    it('blocks review of cancelled leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue({ ...pendingLeave, status: 'CANCELLED' });

      await expect(
        service.review(leaveId, hodId, UserRole.HOD, { status: 'APPROVED' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when leave missing', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.review(leaveId, hodId, UserRole.HOD, { status: 'APPROVED' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revoke', () => {
    const approvedLeave = {
      ...pendingLeave,
      status: 'APPROVED',
      approverId: hodId,
      approver: { fullName: 'HOD User' },
      reviewedAt: new Date(),
      revokedById: null,
      revokedAt: null,
      revocationReason: null,
      revokedBy: null,
    };

    const setupHodAccess = () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        fullName: 'HOD User',
        departmentId: 'dept-1',
      });
    };

    it('revokes an approved future leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(approvedLeave);
      setupHodAccess();
      mockPrisma.leaveRequest.update.mockResolvedValue({
        ...approvedLeave,
        status: 'REVOKED',
        revokedById: hodId,
        revokedAt: new Date(),
        revocationReason: 'Resource reallocation',
        revokedBy: { fullName: 'HOD User' },
      });

      const result = await service.revoke(leaveId, hodId, UserRole.HOD, {
        reason: 'Resource reallocation',
      });

      expect(result.status).toBe('REVOKED');
      expect(result.revocationReason).toBe('Resource reallocation');
      expect(mockPrisma.notification.create).toHaveBeenCalled();
      expect(mockActivityLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LEAVE_REQUEST_REVOKED' }),
      );
    });

    it('allows HOD to revoke their own approved future leave', async () => {
      const hodOwnLeave = {
        ...approvedLeave,
        userId: hodId,
        user: {
          id: hodId,
          fullName: 'HOD User',
          role: { name: UserRole.HOD },
          departmentId: 'dept-1',
        },
      };
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(hodOwnLeave);
      setupHodAccess();
      mockPrisma.leaveRequest.update.mockResolvedValue({
        ...hodOwnLeave,
        status: 'REVOKED',
        revokedById: hodId,
        revokedAt: new Date(),
        revocationReason: 'Personal plan changed',
        revokedBy: { fullName: 'HOD User' },
      });

      const result = await service.revoke(leaveId, hodId, UserRole.HOD, {
        reason: 'Personal plan changed',
      });

      expect(result.status).toBe('REVOKED');
      expect(result.revokedById).toBe(hodId);
      expect(result.revocationReason).toBe('Personal plan changed');
    });

    it('rejects revoke without reason', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(approvedLeave);

      await expect(
        service.revoke(leaveId, hodId, UserRole.HOD, { reason: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks double revoke', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue({
        ...approvedLeave,
        status: 'REVOKED',
      });

      await expect(
        service.revoke(leaveId, hodId, UserRole.HOD, { reason: 'Again' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks revoke of pending leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(pendingLeave);

      await expect(
        service.revoke(leaveId, hodId, UserRole.HOD, { reason: 'Too early' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks revoke of past leave', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue({
        ...approvedLeave,
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: new Date('2020-01-02T00:00:00.000Z'),
      });

      await expect(
        service.revoke(leaveId, hodId, UserRole.HOD, { reason: 'Too late' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks revoke by non-HOD', async () => {
      mockPrisma.leaveRequest.findUnique.mockResolvedValue(approvedLeave);

      await expect(
        service.revoke(leaveId, designerId, UserRole.DESIGNER, { reason: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findTeamRequests', () => {
    it('includes HOD self-leave alongside designer leaves', async () => {
      const hodLeave = {
        ...pendingLeave,
        id: '44444444-4444-4444-8444-444444444444',
        userId: hodId,
        status: 'Approved',
        user: {
          id: hodId,
          fullName: 'Sarah Mitchell',
          role: { name: UserRole.HOD },
          departmentId: 'dept-1',
        },
      };
      mockPrisma.user.findUnique.mockResolvedValue({ departmentId: 'dept-1' });
      mockPrisma.leaveRequest.findMany.mockResolvedValue([pendingLeave, hodLeave]);

      await service.findTeamRequests(hodId, UserRole.HOD);

      expect(mockPrisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ userId: hodId }, { user: { role: { name: UserRole.DESIGNER }, departmentId: 'dept-1' } }],
          }),
        }),
      );
    });
  });
});
