import { SchedulerAssignmentsService } from './scheduler-assignments.service';

describe('SchedulerAssignmentsService', () => {
  const originalRuntimeBootstrap = process.env.RUNTIME_SCHEMA_BOOTSTRAP;

  beforeAll(() => {
    process.env.RUNTIME_SCHEMA_BOOTSTRAP = 'false';
  });

  afterAll(() => {
    if (originalRuntimeBootstrap === undefined) {
      delete process.env.RUNTIME_SCHEMA_BOOTSTRAP;
    } else {
      process.env.RUNTIME_SCHEMA_BOOTSTRAP = originalRuntimeBootstrap;
    }
  });

  const prisma: any = {
    schedulerAssignment: { findMany: jest.fn(), update: jest.fn() },
    overtimeRequest: { findMany: jest.fn() },
    leaveRequest: { findMany: jest.fn() },
    regularizationRequest: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    schedulerWeek: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    schedulerAssignmentHistory: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn((cb: (tx: any) => Promise<unknown>) => cb(prisma)),
  };
  const activityLogger: any = { log: jest.fn() };
  const notificationsService: any = { create: jest.fn() };
  const service = new SchedulerAssignmentsService(
    prisma,
    {} as any,
    activityLogger,
    notificationsService,
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.schedulerAssignment.findMany.mockResolvedValue([]);
    prisma.overtimeRequest.findMany.mockResolvedValue([]);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    prisma.regularizationRequest.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.schedulerWeek.create.mockResolvedValue({});
    prisma.schedulerWeek.findUnique.mockResolvedValue({ version: 0 });
    prisma.schedulerWeek.update.mockResolvedValue({});
    prisma.schedulerWeek.upsert.mockResolvedValue({});
    prisma.schedulerAssignment.update.mockResolvedValue({});
    prisma.schedulerAssignmentHistory.create.mockResolvedValue({});
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.$executeRawUnsafe.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation((cb: (tx: any) => Promise<unknown>) => cb(prisma));
    await service.onModuleInit();
  });

  it('returns approved leave and regularization as locked scheduler system blocks', async () => {
    prisma.leaveRequest.findMany.mockResolvedValue([
      {
        id: 'leave-1',
        userId: 'designer-1',
        type: 'Full Day',
        startDate: new Date('2026-06-09T00:00:00.000Z'),
        endDate: new Date('2026-06-09T00:00:00.000Z'),
        halfDaySession: null,
        status: 'Approved',
        user: { fullName: 'Alex Johnson' },
      },
    ]);
    prisma.regularizationRequest.findMany.mockResolvedValue([
      {
        id: 'reg-1',
        designerId: 'designer-1',
        taskId: 'task-1',
        date: new Date('2026-06-10T00:00:00.000Z'),
        duration: '2.5 hours',
        reason: 'Missed punch',
        status: 'Approved',
        task: { taskNo: 'T-100', title: 'Design task', opNo: 'OP-1' },
      },
    ]);

    const rows = await service.findForWeekStart('2026-06-08', 'designer-1');

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'leave-leave-1-1',
          requestType: 'LEAVE',
          isSystemBlock: true,
          designerId: 'designer-1',
          dayIndex: 1,
          scheduledHours: 8,
          leaveHours: 8,
          leaveRequestIds: ['leave-1'],
        }),
        expect.objectContaining({
          id: 'regularization-reg-1',
          requestType: 'REGULARIZATION',
          isSystemBlock: true,
          designerId: 'designer-1',
          taskId: 'task-1',
          dayIndex: 2,
          scheduledHours: 2.5,
          regularizationHours: 2.5,
          regularizationRequestIds: ['reg-1'],
        }),
      ]),
    );
  });

  it('merges approved overtime into matching assignment rows', async () => {
    prisma.schedulerAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        designerId: 'designer-1',
        taskId: 'task-1',
        dayIndex: 0,
        assignedHours: '6',
        parentId: null,
        splitIndex: null,
        totalParts: null,
        weekStartDate: new Date('2026-06-08T00:00:00.000Z'),
        weekEndDate: new Date('2026-06-14T00:00:00.000Z'),
        notes: null,
        isLocked: false,
        assignedBy: 'hod-1',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prisma.overtimeRequest.findMany.mockResolvedValue([
      {
        id: 'ot-1',
        designerId: 'designer-1',
        taskId: 'task-1',
        date: new Date('2026-06-08T00:00:00.000Z'),
        approvedHours: '2',
      },
    ]);

    const rows = await service.findForWeekStart('2026-06-08', 'designer-1');

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'assignment-1',
        scheduledHours: 6,
        approvedOvertimeHours: 2,
        assignedHours: 8,
        overtimeRequestIds: ['ot-1'],
      }),
    ]);
  });

  it('rejects saving an assignment on approved full-day leave', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'designer-1' }]);
    prisma.task.findMany.mockResolvedValue([{ id: 'task-1', status: 'DESIGN_NEW', assigneeId: null }]);
    prisma.schedulerAssignment.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'week-1',
        version: 0,
        isLocked: false,
        lastPayloadHash: null,
        updatedAt: new Date('2026-06-08T00:00:00.000Z'),
        updatedBy: null,
      },
    ]);
    prisma.leaveRequest.findMany.mockResolvedValue([
      {
        id: 'leave-1',
        userId: 'designer-1',
        type: 'Full Day',
        startDate: new Date('2026-06-09T00:00:00.000Z'),
        endDate: new Date('2026-06-09T00:00:00.000Z'),
        user: { fullName: 'Alex Johnson' },
      },
    ]);

    await expect(
      service.saveWeekSnapshot('2026-06-08', 'hod-1', {
        version: 0,
        assignments: [
          {
            designerId: 'designer-1',
            taskId: 'task-1',
            dayIndex: 1,
            assignedHours: 2,
          },
        ],
      }),
    ).rejects.toThrow('Cannot schedule task task-1 for Alex Johnson on approved full-day leave.');
  });

  it('reschedules leave conflicts as an ordered chain around weekends, holidays, and approved leave', async () => {
    const makeRow = (id: string, weekStartDate: string, dayIndex: number, taskId: string) => ({
      id,
      designerId: 'designer-1',
      taskId,
      dayIndex,
      assignedHours: '8',
      parentId: null,
      splitIndex: null,
      totalParts: null,
      weekStartDate: new Date(`${weekStartDate}T00:00:00.000Z`),
      weekEndDate: new Date('2026-06-14T00:00:00.000Z'),
      notes: null,
      position: 0,
      isLocked: false,
      assignedBy: 'hod-old',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const rows = [
      makeRow('assignment-1', '2026-06-08', 4, 'task-1'),
      makeRow('assignment-2', '2026-06-15', 0, 'task-2'),
    ];

    prisma.schedulerAssignment.findMany
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows);
    prisma.leaveRequest.findMany.mockResolvedValue([
      {
        id: 'leave-1',
        type: 'Full Day',
        startDate: new Date('2026-06-12T00:00:00.000Z'),
        endDate: new Date('2026-06-12T00:00:00.000Z'),
      },
      {
        id: 'leave-2',
        type: 'Full Day',
        startDate: new Date('2026-06-16T00:00:00.000Z'),
        endDate: new Date('2026-06-16T00:00:00.000Z'),
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ date: new Date('2026-06-15T00:00:00.000Z') }]);

    const result = await service.rescheduleForApprovedLeave(
      {
        id: 'leave-1',
        userId: 'designer-1',
        type: 'Full Day',
        startDate: new Date('2026-06-12T00:00:00.000Z'),
        endDate: new Date('2026-06-12T00:00:00.000Z'),
      },
      'hod-1',
    );

    expect(result).toEqual({ movedCount: 2, affectedWeeks: ['2026-06-08', '2026-06-15'] });
    expect(prisma.schedulerAssignment.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          weekStartDate: new Date('2026-06-15T00:00:00.000Z'),
          dayIndex: 2,
          assignedBy: 'hod-1',
        }),
      }),
    );
    expect(prisma.schedulerAssignment.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'assignment-2' },
        data: expect.objectContaining({
          weekStartDate: new Date('2026-06-15T00:00:00.000Z'),
          dayIndex: 3,
          assignedBy: 'hod-1',
        }),
      }),
    );
    expect(prisma.schedulerWeek.update).toHaveBeenCalledTimes(2);
    expect(prisma.schedulerAssignmentHistory.create).toHaveBeenCalledTimes(2);
    expect(activityLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SCHEDULER_LEAVE_RESCHEDULED' }),
    );
  });

  it('restores revoked leave displacement from the approval snapshot', async () => {
    const makeRow = (id: string, weekStartDate: string, dayIndex: number, taskId: string) => ({
      id,
      designerId: 'designer-1',
      taskId,
      dayIndex,
      assignedHours: '8',
      parentId: null,
      splitIndex: null,
      totalParts: null,
      weekStartDate: new Date(`${weekStartDate}T00:00:00.000Z`),
      weekEndDate: new Date('2026-06-21T00:00:00.000Z'),
      notes: null,
      position: 0,
      isLocked: false,
      assignedBy: 'hod-old',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const rows = [
      makeRow('assignment-1', '2026-06-15', 0, 'task-1'),
      makeRow('assignment-2', '2026-06-15', 1, 'task-2'),
    ];
    const originalRows = [
      { ...makeRow('assignment-1', '2026-06-08', 4, 'task-1'), weekEndDate: new Date('2026-06-14T00:00:00.000Z') },
      makeRow('assignment-2', '2026-06-15', 0, 'task-2'),
    ];

    prisma.schedulerAssignment.findMany
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows);
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        assignmentId: 'assignment-1',
        originalJson: JSON.stringify(originalRows[0]),
      },
      {
        assignmentId: 'assignment-2',
        originalJson: JSON.stringify(originalRows[1]),
      },
    ]);

    const result = await service.rescheduleAfterLeaveRevocation(
      {
        id: 'leave-1',
        userId: 'designer-1',
        type: 'Full Day',
        startDate: new Date('2026-06-12T00:00:00.000Z'),
        endDate: new Date('2026-06-12T00:00:00.000Z'),
      },
      'hod-1',
    );

    expect(result).toEqual({ movedCount: 2, affectedWeeks: ['2026-06-08', '2026-06-15'] });
    expect(prisma.schedulerAssignment.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({
          weekStartDate: new Date('2026-06-08T00:00:00.000Z'),
          dayIndex: 4,
          assignedBy: 'hod-old',
        }),
      }),
    );
    expect(prisma.schedulerAssignment.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'assignment-2' },
        data: expect.objectContaining({
          weekStartDate: new Date('2026-06-15T00:00:00.000Z'),
          dayIndex: 0,
          assignedBy: 'hod-old',
        }),
      }),
    );
    expect(prisma.schedulerWeek.update).toHaveBeenCalledTimes(2);
    expect(prisma.schedulerAssignmentHistory.create).toHaveBeenCalledTimes(2);
    expect(activityLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SCHEDULER_LEAVE_RESCHEDULED',
        details: expect.objectContaining({
          context: expect.objectContaining({ source: 'leave.revocation' }),
        }),
      }),
    );
  });
});
