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

  // Numeric ERP user ids (ErpAuthUsers.userId is bigint) — a distinct range
  // for this spec file to avoid confusion with other services' fixtures.
  const designerId = '6001';
  const otherDesignerId = '6002';
  const hodId = '6003';
  const extraCandidateId = '6004';
  const taskId = '22222222-2222-2222-2222-222222222222';

  const mockPrisma: any = {
    task: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
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
      assigneeId: BigInt(designerId),
      taskNo: 'T-1',
      title: 'Signage',
      designType: 'Project',
      taskDesigners: [{ designerId: BigInt(designerId) }],
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
      requesterId: BigInt(designerId),
      suggestedDesignerId: BigInt(otherDesignerId),
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
      requester: { userId: BigInt(designerId), userName: 'Alex Johnson' },
      suggestedDesigner: { userId: BigInt(otherDesignerId), userName: 'Benjamin Harris' },
      targetDesigner: null,
      approver: null,
    });
    mockPrisma.$queryRaw.mockResolvedValue([]);
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
      assigneeId: BigInt(otherDesignerId),
      taskDesigners: [{ designerId: BigInt(otherDesignerId) }],
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

  // listEligibleDesigners used to query prisma.user by department/role and
  // fullName OR-matching. ErpAuthUsers has no local role/department table, so
  // eligible designers now come from a raw-SQL role-bucket join
  // (findErpUsersByRoleBuckets, backed by $queryRaw) instead — see
  // reallocation-requests.service.ts around line 246-291.
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
      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: BigInt(designerId), userName: 'Requester Self', roleName: 'Designer' },
        { userId: BigInt(otherDesignerId), userName: 'Benjamin Harris', roleName: 'Designer' },
        { userId: BigInt(extraCandidateId), userName: 'Alex Johnson', roleName: 'Designer' },
        { userId: BigInt('6099'), userName: 'Not On Team', roleName: 'Designer' },
      ]);

      const result = await service.listEligibleDesigners(taskId, designerId);

      // Requester excluded, off-team designer filtered out by name match.
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
      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: BigInt(designerId), userName: 'Requester Self', roleName: 'Designer' },
        { userId: BigInt(otherDesignerId), userName: 'Anyone', roleName: 'Designer' },
      ]);

      const result = await service.listEligibleDesigners(taskId, designerId);

      // No team names to match against -> falls back to the full Designer/HOD
      // directory (minus the requester), unfiltered by name.
      expect(result.map((d: { fullName: string }) => d.fullName)).toEqual(['Anyone']);
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
      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: BigInt(extraCandidateId), userName: 'Alex Johnson', roleName: 'Designer' },
        { userId: BigInt(otherDesignerId), userName: 'Outsider', roleName: 'Designer' },
      ]);

      const result = await service.listEligibleDesigners(taskId, designerId);

      expect(result).toEqual([{ id: extraCandidateId, fullName: 'Alex Johnson' }]);
    });
  });
});
