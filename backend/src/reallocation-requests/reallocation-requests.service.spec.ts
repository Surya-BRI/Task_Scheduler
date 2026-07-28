import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { UserRole } from '../common/constants/roles.enum';
import { SchedulerAssignmentsService } from '../scheduler-assignments/scheduler-assignments.service';
import { TasksService } from '../tasks/tasks.service';
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
    schedulerAssignment: { findMany: jest.fn() },
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
  const mockTasks = {
    freezeDraftWorkSession: jest.fn(),
    peekDraftWorkSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReallocationRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLoggerService, useValue: mockActivityLogger },
        { provide: SchedulerAssignmentsService, useValue: mockScheduler },
        { provide: TasksService, useValue: mockTasks },
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
});
