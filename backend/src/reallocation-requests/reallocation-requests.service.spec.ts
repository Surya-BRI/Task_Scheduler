import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { UserRole } from '../common/constants/roles.enum';
import { SchedulerAssignmentsService } from '../scheduler-assignments/scheduler-assignments.service';
import { ReallocationRequestsService } from './reallocation-requests.service';

describe('ReallocationRequestsService', () => {
  let service: ReallocationRequestsService;

  const designerId = '11111111-1111-1111-1111-111111111111';
  const otherDesignerId = '44444444-4444-4444-4444-444444444444';
  const taskId = '22222222-2222-2222-2222-222222222222';
  const hodId = '33333333-3333-3333-3333-333333333333';

  const mockPrisma: any = {
    task: { findUnique: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    schedulerAssignment: { findMany: jest.fn(), groupBy: jest.fn() },
    reallocationRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    notification: { create: jest.fn() },
    taskWorkSession: { findFirst: jest.fn() },
  };

  const mockActivityLogger = { log: jest.fn() };
  const mockScheduler = {
    assertDesignerOnProjectTeam: jest.fn(),
    applyReallocationHandoff: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReallocationRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLoggerService, useValue: mockActivityLogger },
        { provide: SchedulerAssignmentsService, useValue: mockScheduler },
      ],
    }).compile();

    service = module.get(ReallocationRequestsService);
    jest.clearAllMocks();

    mockPrisma.task.findUnique.mockResolvedValue({
      id: taskId,
      status: 'IN_PROGRESS',
      assigneeId: designerId,
      taskNo: 'T-1',
      title: 'Signage',
      designType: 'Project',
      taskDesigners: [{ designerId }],
      project: {
        technicalHead: 'Alex Johnson',
        teamLead: null,
        subTeamLead: null,
        designers: 'Benjamin Harris',
      },
    });
    mockPrisma.schedulerAssignment.findMany.mockResolvedValue([
      { assignedHours: 4 },
    ]);
    mockPrisma.reallocationRequest.findFirst.mockResolvedValue(null);
    mockPrisma.reallocationRequest.create.mockResolvedValue({
      id: 'req-1',
      taskId,
      requesterId: designerId,
      suggestedDesignerId: otherDesignerId,
      reason: 'Overloaded',
      status: 'Pending',
      targetDesignerId: null,
      approverId: null,
      approverRemarks: null,
      reviewedAt: null,
      createdAt: new Date(),
      task: {
        id: taskId,
        title: 'Signage',
        taskNo: 'T-1',
        opNo: 'OP-1',
        status: 'IN_PROGRESS',
        designType: 'Project',
        projectId: 'p1',
        project: { id: 'p1', name: 'Proj', projectNo: 'P1' },
      },
      requester: { id: designerId, fullName: 'Alex Johnson', department: { name: 'Design' } },
      suggestedDesigner: { id: otherDesignerId, fullName: 'Benjamin Harris' },
      targetDesigner: null,
      approver: null,
    });
    mockPrisma.user.findMany.mockResolvedValue([{ id: hodId }]);
    mockPrisma.notification.create.mockResolvedValue({});
    mockScheduler.assertDesignerOnProjectTeam.mockResolvedValue(undefined);
  });

  it('rejects create when designer has no remaining unlocked hours (post-reallocation)', async () => {
    mockPrisma.schedulerAssignment.findMany.mockResolvedValue([]);
    await expect(
      service.create(designerId, UserRole.DESIGNER, {
        taskId,
        suggestedDesignerId: otherDesignerId,
        reason: 'Need help',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects create when designer does not own the task', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      id: taskId,
      status: 'IN_PROGRESS',
      assigneeId: otherDesignerId,
      taskDesigners: [{ designerId: otherDesignerId }],
      taskNo: 'T-1',
      title: 'Signage',
      designType: 'Project',
    });
    await expect(
      service.create(designerId, UserRole.DESIGNER, {
        taskId,
        suggestedDesignerId: otherDesignerId,
        reason: 'Need help',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects create when a pending request already exists', async () => {
    mockPrisma.reallocationRequest.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create(designerId, UserRole.DESIGNER, {
        taskId,
        suggestedDesignerId: otherDesignerId,
        reason: 'Need help',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects suggested designer equal to requester', async () => {
    await expect(
      service.create(designerId, UserRole.DESIGNER, {
        taskId,
        suggestedDesignerId: designerId,
        reason: 'Need help',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates pending request when remaining hours exist', async () => {
    const result = await service.create(designerId, UserRole.DESIGNER, {
      taskId,
      suggestedDesignerId: otherDesignerId,
      reason: 'Overloaded',
    });
    expect(result.status).toBe('Pending');
    expect(mockPrisma.reallocationRequest.create).toHaveBeenCalled();
    expect(mockScheduler.assertDesignerOnProjectTeam).toHaveBeenCalledWith(
      taskId,
      otherDesignerId,
    );
  });

  it('maps unique-index race on create to the same pending error', async () => {
    mockPrisma.reallocationRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['taskId', 'requesterId'] },
      }),
    );
    await expect(
      service.create(designerId, UserRole.DESIGNER, {
        taskId,
        suggestedDesignerId: otherDesignerId,
        reason: 'Overloaded',
      }),
    ).rejects.toThrow('You already have a pending reallocation request for this task.');
  });

  it('approves without a separate pre-handoff timer freeze', async () => {
    mockPrisma.reallocationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      status: 'Pending',
      taskId,
      requesterId: designerId,
      suggestedDesignerId: otherDesignerId,
      task: {
        id: taskId,
        taskNo: 'T-1',
        title: 'Signage',
        opNo: 'OP-1',
        status: 'IN_PROGRESS',
        designType: 'Project',
        projectId: 'p1',
        project: { id: 'p1', name: 'Proj', projectNo: 'P1' },
      },
      requester: { id: designerId, fullName: 'Alex Johnson', department: { name: 'Design' } },
      suggestedDesigner: { id: otherDesignerId, fullName: 'Benjamin Harris' },
      targetDesigner: null,
      approver: null,
      reason: 'Overloaded',
      targetDesignerId: null,
      approverId: null,
      approverRemarks: null,
      reviewedAt: null,
      createdAt: new Date(),
    });
    mockScheduler.applyReallocationHandoff.mockResolvedValue({
      remainingHoursMoved: 4,
      unplacedHours: 0,
      affectedWeekStarts: ['2026-07-27'],
    });
    mockPrisma.reallocationRequest.update.mockResolvedValue({
      id: 'req-1',
      status: 'Approved',
      taskId,
      requesterId: designerId,
      suggestedDesignerId: otherDesignerId,
      targetDesignerId: otherDesignerId,
      task: {
        id: taskId,
        taskNo: 'T-1',
        title: 'Signage',
        opNo: 'OP-1',
        status: 'IN_PROGRESS',
        designType: 'Project',
        projectId: 'p1',
        project: { id: 'p1', name: 'Proj', projectNo: 'P1' },
      },
      requester: { id: designerId, fullName: 'Alex Johnson', department: { name: 'Design' } },
      suggestedDesigner: { id: otherDesignerId, fullName: 'Benjamin Harris' },
      targetDesigner: { id: otherDesignerId, fullName: 'Benjamin Harris' },
      approver: { id: hodId, fullName: 'HOD' },
      reason: 'Overloaded',
      approverId: hodId,
      approverRemarks: null,
      reviewedAt: new Date(),
      createdAt: new Date(),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: otherDesignerId });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await service.review('req-1', hodId, UserRole.HOD, {
      status: 'Approved',
      targetDesignerId: otherDesignerId,
    });

    expect(mockScheduler.applyReallocationHandoff).toHaveBeenCalledWith({
      taskId,
      fromDesignerId: designerId,
      toDesignerId: otherDesignerId,
      assignedBy: hodId,
    });
    expect(result.status).toBe('Approved');
    expect('remainingHoursMoved' in result && result.remainingHoursMoved).toBe(4);
    expect('unplacedHours' in result && result.unplacedHours).toBe(0);
  });

  it('leaves request pending when handoff fails (no pre-freeze side effect)', async () => {
    mockPrisma.reallocationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      status: 'Pending',
      taskId,
      requesterId: designerId,
      suggestedDesignerId: otherDesignerId,
      task: { taskNo: 'T-1', designType: 'Project' },
      requester: { id: designerId, fullName: 'Alex' },
      suggestedDesigner: { fullName: 'Ben' },
      targetDesigner: null,
      approver: null,
    });
    mockScheduler.applyReallocationHandoff.mockRejectedValue(
      new BadRequestException('Cannot reallocate: week 2026-07-27 is locked. Unlock it before approving.'),
    );

    await expect(
      service.review('req-1', hodId, UserRole.HOD, {
        status: 'Approved',
        targetDesignerId: otherDesignerId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.reallocationRequest.update).not.toHaveBeenCalled();
  });

  it('rejects review when not pending', async () => {
    mockPrisma.reallocationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      status: 'Approved',
      taskId,
      requesterId: designerId,
      suggestedDesignerId: otherDesignerId,
      task: { taskNo: 'T-1', designType: 'Project' },
      requester: { fullName: 'Alex' },
      suggestedDesigner: { fullName: 'Ben' },
      targetDesigner: null,
      approver: null,
    });
    await expect(
      service.review('req-1', hodId, UserRole.HOD, { status: 'Approved' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires remarks when disagreeing', async () => {
    mockPrisma.reallocationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      status: 'Pending',
      taskId,
      requesterId: designerId,
      suggestedDesignerId: otherDesignerId,
      task: { taskNo: 'T-1', designType: 'Project' },
      requester: { id: designerId, fullName: 'Alex' },
      suggestedDesigner: { fullName: 'Ben' },
      targetDesigner: null,
      approver: null,
    });
    await expect(
      service.review('req-1', hodId, UserRole.HOD, { status: 'Rejected' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects approve when target equals requester', async () => {
    mockPrisma.reallocationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      status: 'Pending',
      taskId,
      requesterId: designerId,
      suggestedDesignerId: otherDesignerId,
      task: { taskNo: 'T-1', designType: 'Project' },
      requester: { id: designerId, fullName: 'Alex' },
      suggestedDesigner: { fullName: 'Ben' },
      targetDesigner: null,
      approver: null,
    });
    await expect(
      service.review('req-1', hodId, UserRole.HOD, {
        status: 'Approved',
        targetDesignerId: designerId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cancel by non-requester', async () => {
    mockPrisma.reallocationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      status: 'Pending',
      requesterId: designerId,
      taskId,
      task: { taskNo: 'T-1', designType: 'Project' },
      requester: { fullName: 'Alex' },
      suggestedDesigner: { fullName: 'Ben' },
      targetDesigner: null,
      approver: null,
    });
    await expect(service.cancel('req-1', otherDesignerId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('batches remaining hours for pending list via one groupBy', async () => {
    const taskB = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const designerB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const baseRow = {
      suggestedDesignerId: otherDesignerId,
      reason: 'Overloaded',
      targetDesignerId: null,
      approverId: null,
      approverRemarks: null,
      reviewedAt: null,
      createdAt: new Date(),
      suggestedDesigner: { id: otherDesignerId, fullName: 'Benjamin Harris' },
      targetDesigner: null,
      approver: null,
    };
    mockPrisma.reallocationRequest.findMany.mockResolvedValue([
      {
        ...baseRow,
        id: 'req-1',
        taskId,
        requesterId: designerId,
        status: 'Pending',
        task: {
          id: taskId,
          title: 'Signage',
          taskNo: 'T-1',
          opNo: 'OP-1',
          status: 'IN_PROGRESS',
          designType: 'Project',
          projectId: 'p1',
          project: { id: 'p1', name: 'Proj', projectNo: 'P1' },
        },
        requester: { id: designerId, fullName: 'Alex Johnson', department: { name: 'Design' } },
      },
      {
        ...baseRow,
        id: 'req-2',
        taskId: taskB,
        requesterId: designerB,
        status: 'Pending',
        task: {
          id: taskB,
          title: 'Wayfinding',
          taskNo: 'T-2',
          opNo: 'OP-2',
          status: 'IN_PROGRESS',
          designType: 'Project',
          projectId: 'p1',
          project: { id: 'p1', name: 'Proj', projectNo: 'P1' },
        },
        requester: { id: designerB, fullName: 'Casey', department: { name: 'Design' } },
      },
    ]);
    mockPrisma.schedulerAssignment.groupBy.mockResolvedValue([
      { taskId, designerId, _sum: { assignedHours: 3.5 } },
      { taskId: taskB, designerId: designerB, _sum: { assignedHours: 6 } },
    ]);

    const result = await service.findPendingApprovals();

    expect(mockPrisma.schedulerAssignment.groupBy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.schedulerAssignment.findMany).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].remainingHours).toBe(3.5);
    expect(result[1].remainingHours).toBe(6);
  });

  describe('listEligibleDesigners', () => {
    it('queries by team names when project team is present (not all users)', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        project: {
          technicalHead: 'Alex Johnson',
          teamLead: null,
          subTeamLead: null,
          designers: 'Benjamin Harris',
        },
      });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: otherDesignerId, fullName: 'Benjamin Harris' },
        { id: '55555555-5555-5555-5555-555555555555', fullName: 'Alex Johnson' },
      ]);

      const result = await service.listEligibleDesigners(taskId, designerId);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: designerId },
            OR: expect.arrayContaining([
              { fullName: 'Alex Johnson' },
              { fullName: 'Benjamin Harris' },
            ]),
          }),
        }),
      );
      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
      expect(result.map((d: { fullName: string }) => d.fullName).sort()).toEqual([
        'Alex Johnson',
        'Benjamin Harris',
      ]);
    });

    it('falls back to all Designer/HOD when team names are empty', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        project: {
          technicalHead: null,
          teamLead: '  ',
          subTeamLead: null,
          designers: null,
        },
      });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: otherDesignerId, fullName: 'Anyone' },
      ]);

      await service.listEligibleDesigners(taskId, designerId);

      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
      expect(where.id).toEqual({ not: designerId });
      expect(where.role).toEqual({ name: { in: [UserRole.DESIGNER, UserRole.HOD] } });
    });

    it('excludes requester and filters by normalized name match', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        project: {
          technicalHead: 'alex johnson',
          teamLead: null,
          subTeamLead: null,
          designers: null,
        },
      });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '55555555-5555-5555-5555-555555555555', fullName: 'Alex Johnson' },
        { id: otherDesignerId, fullName: 'Outsider' },
      ]);

      const result = await service.listEligibleDesigners(taskId, designerId);

      expect(result).toEqual([
        { id: '55555555-5555-5555-5555-555555555555', fullName: 'Alex Johnson' },
      ]);
    });
  });
});
