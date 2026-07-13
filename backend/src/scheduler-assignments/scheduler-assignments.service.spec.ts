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
    schedulerAssignment: { findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn(), groupBy: jest.fn(), create: jest.fn() },
    taskDesigner: { deleteMany: jest.fn(), createMany: jest.fn() },
    overtimeRequest: { findMany: jest.fn() },
    leaveRequest: { findMany: jest.fn() },
    regularizationRequest: { findMany: jest.fn() },
    taskWorkSession: { findMany: jest.fn() },
    schedulerTaskFragment: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    task: { findMany: jest.fn(), update: jest.fn() },
    schedulerWeek: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    schedulerAssignmentHistory: { create: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn((cb: (tx: any) => Promise<unknown>) => cb(prisma)),
  };
  const activityLogger: any = { log: jest.fn() };
  const notificationsService: any = { create: jest.fn() };
  const cronLockService: any = {
    tryAcquire: jest.fn().mockResolvedValue(async () => undefined),
  };
  const service = new SchedulerAssignmentsService(
    prisma,
    {} as any,
    activityLogger,
    notificationsService,
    cronLockService,
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.schedulerAssignment.findMany.mockResolvedValue([]);
    prisma.schedulerAssignment.groupBy.mockResolvedValue([]);
    prisma.taskDesigner.deleteMany.mockResolvedValue({ count: 0 });
    prisma.taskDesigner.createMany.mockResolvedValue({ count: 0 });
    prisma.task.update.mockResolvedValue({});
    prisma.overtimeRequest.findMany.mockResolvedValue([]);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    prisma.regularizationRequest.findMany.mockResolvedValue([]);
    prisma.taskWorkSession.findMany.mockResolvedValue([]);
    prisma.schedulerTaskFragment.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.schedulerWeek.create.mockResolvedValue({});
    prisma.schedulerWeek.findUnique.mockResolvedValue({ version: 0 });
    prisma.schedulerWeek.update.mockResolvedValue({});
    prisma.schedulerWeek.upsert.mockResolvedValue({});
    prisma.schedulerAssignment.update.mockResolvedValue({});
    prisma.schedulerAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prisma.schedulerAssignment.createMany.mockResolvedValue({ count: 0 });
    prisma.schedulerAssignmentHistory.create.mockResolvedValue({});
    prisma.schedulerAssignmentHistory.findMany.mockResolvedValue([]);
    prisma.schedulerAssignmentHistory.deleteMany.mockResolvedValue({ count: 0 });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.$executeRawUnsafe.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation((cb: (tx: any) => Promise<unknown>) => cb(prisma));
    notificationsService.create.mockResolvedValue({});
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
      {
        id: 'reg-2',
        designerId: 'designer-1',
        taskId: 'task-2',
        date: new Date('2026-06-11T00:00:00.000Z'),
        duration: '30 mins',
        reason: 'Late start',
        status: 'Approved',
        task: { taskNo: 'T-101', title: 'Short fix', opNo: 'OP-2' },
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
          task: null,
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
        expect.objectContaining({
          id: 'regularization-reg-2',
          requestType: 'REGULARIZATION',
          isSystemBlock: true,
          designerId: 'designer-1',
          taskId: 'task-2',
          dayIndex: 3,
          scheduledHours: 0.5,
          regularizationHours: 0.5,
          regularizationRequestIds: ['reg-2'],
        }),
      ]),
    );
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('attaches task summaries only for real task UUIDs', async () => {
    const taskUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    prisma.schedulerAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        designerId: 'designer-1',
        taskId: taskUuid,
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
    prisma.task.findMany.mockResolvedValue([
      {
        id: taskUuid,
        opNo: 'OP-1',
        title: 'Facade',
        signType: null,
        revisionCode: null,
        designType: 'Project',
        disciplineType: null,
        status: 'IN_PROGRESS',
        priority: null,
        assigneeId: 'designer-1',
        holdPreviousStatus: null,
        projectId: null,
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        project: null,
        taskDesigners: [],
        retailDetails: [{ hoursRequired: 6 }],
        projectDetails: [],
      },
    ]);

    const rows = await service.findForWeekStart('2026-06-08', 'designer-1');

    const summaryCall = prisma.task.findMany.mock.calls.find(
      (call: [{ where?: { id?: { in?: string[] } } }]) =>
        Array.isArray(call[0]?.where?.id?.in) && call[0].where.id.in.includes(taskUuid),
    );
    expect(summaryCall).toBeDefined();
    expect(rows[0].task).toMatchObject({ id: taskUuid, opNo: 'OP-1', estimatedHours: 6 });
  });

  it('includes otherScheduledAssignmentCount for cross-week split awareness', async () => {
    const taskUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    prisma.schedulerAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-week2',
        designerId: 'designer-b',
        taskId: taskUuid,
        dayIndex: 0,
        assignedHours: '4',
        parentId: taskUuid,
        splitIndex: 2,
        totalParts: 3,
        weekStartDate: new Date('2026-06-15T00:00:00.000Z'),
        weekEndDate: new Date('2026-06-21T00:00:00.000Z'),
        notes: null,
        isLocked: false,
        assignedBy: 'hod-1',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    prisma.schedulerAssignment.groupBy.mockResolvedValue([
      { taskId: taskUuid, _count: { _all: 3 } },
    ]);

    const rows = await service.findForWeekStart('2026-06-15');

    expect(prisma.schedulerAssignment.groupBy).toHaveBeenCalledWith({
      by: ['taskId'],
      where: { taskId: { in: [taskUuid] } },
      _count: { _all: true },
    });
    expect(rows[0]).toMatchObject({
      id: 'assignment-week2',
      taskId: taskUuid,
      otherScheduledAssignmentCount: 2,
    });
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

  it('incremental save replaces only affected task rows and merges when version is stale but tasks do not overlap', async () => {
    const taskA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const taskB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const designer1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const existingRows = [
      {
        id: 'row-a',
        designerId: designer1,
        taskId: taskA,
        dayIndex: 0,
        assignedHours: '4',
        parentId: null,
        splitIndex: null,
        totalParts: null,
        weekStartDate: new Date('2026-06-08T00:00:00.000Z'),
        weekEndDate: new Date('2026-06-14T00:00:00.000Z'),
        notes: null,
        position: 0,
        isLocked: false,
        isPinned: false,
        assignedBy: 'hod-1',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
      {
        id: 'row-b',
        designerId: designer1,
        taskId: taskB,
        dayIndex: 1,
        assignedHours: '6',
        parentId: null,
        splitIndex: null,
        totalParts: null,
        weekStartDate: new Date('2026-06-08T00:00:00.000Z'),
        weekEndDate: new Date('2026-06-14T00:00:00.000Z'),
        notes: null,
        position: 0,
        isLocked: false,
        isPinned: false,
        assignedBy: 'hod-1',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ];

    prisma.user.findMany.mockResolvedValue([{ id: designer1, fullName: 'Alex Johnson' }]);
    prisma.task.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in.map((id) => ({
          id,
          status: 'DESIGN_NEW',
          assigneeId: null,
          projectId: null,
          project: null,
        })),
      ),
    );
    prisma.schedulerAssignment.findMany
      .mockResolvedValueOnce(existingRows)
      .mockResolvedValueOnce(existingRows);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'week-1',
        version: 2,
        isLocked: false,
        lastPayloadHash: null,
        updatedAt: new Date('2026-06-08T00:00:00.000Z'),
        updatedBy: 'hod-2',
      },
    ]);
    prisma.schedulerWeek.update.mockResolvedValue({
      version: 3,
      isLocked: false,
      updatedAt: new Date('2026-06-08T01:00:00.000Z'),
      updatedBy: 'hod-1',
    });
    prisma.schedulerAssignmentHistory.findMany.mockResolvedValue([
      {
        beforeJson: JSON.stringify([{ taskId: taskB }]),
        afterJson: JSON.stringify([{ taskId: taskB, designerId: designer1, dayIndex: 2, assignedHours: 6 }]),
      },
    ]);

    await service.saveWeekSnapshot('2026-06-08', 'hod-1', {
      version: 1,
      affectedTaskIds: [taskA],
      assignments: [
        {
          designerId: designer1,
          taskId: taskA,
          dayIndex: 2,
          assignedHours: 4,
        },
      ],
    });

    expect(prisma.schedulerAssignment.deleteMany).toHaveBeenCalledWith({
      where: {
        weekStartDate: new Date('2026-06-08T00:00:00.000Z'),
        taskId: { in: [taskA] },
      },
    });
    expect(prisma.schedulerAssignment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            taskId: taskA,
            dayIndex: 2,
          }),
        ],
      }),
    );
  });

  it('incremental cross-designer split save syncs junction via Prisma and nulls assigneeId', async () => {
    const taskMoved = '79bde5e5-d694-4728-88ab-33d71f238e11';
    const taskOther = 'bcf7f830-0a44-4e68-84a3-ea12317e0a5f';
    const alex = 'cbfa197a-d2ca-463c-adf3-ea6f8457e2c3';
    const benjamin = 'fb3aa354-5497-4d93-bd44-88c869b2281a';

    prisma.user.findMany.mockResolvedValue([
      { id: alex, fullName: 'Alex Johnson' },
      { id: benjamin, fullName: 'Benjamin' },
    ]);
    prisma.task.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in.map((id) => ({
          id,
          status: 'DESIGN_PLANNED',
          assigneeId: alex,
          projectId: null,
          project: null,
        })),
      ),
    );
    prisma.schedulerAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'week-1',
        version: 157,
        isLocked: false,
        lastPayloadHash: null,
        updatedAt: new Date('2026-07-06T00:00:00.000Z'),
        updatedBy: 'hod-1',
      },
    ]);
    prisma.schedulerWeek.update.mockResolvedValue({
      version: 158,
      isLocked: false,
      updatedAt: new Date('2026-07-06T01:00:00.000Z'),
      updatedBy: 'hod-1',
    });

    await service.saveWeekSnapshot('2026-07-06', 'hod-1', {
      version: 157,
      affectedTaskIds: [taskMoved, taskOther],
      assignments: [
        { designerId: alex, taskId: taskMoved, dayIndex: 2, assignedHours: 2, parentId: taskMoved, splitIndex: 1, totalParts: 2, isPinned: true },
        { designerId: alex, taskId: taskOther, dayIndex: 2, assignedHours: 4 },
        { designerId: alex, taskId: taskOther, dayIndex: 3, assignedHours: 4 },
        { designerId: benjamin, taskId: taskMoved, dayIndex: 3, assignedHours: 6, parentId: taskMoved, splitIndex: 2, totalParts: 2, isPinned: true },
      ],
    });

    expect(prisma.taskDesigner.deleteMany).toHaveBeenCalledWith({
      where: { taskId: { in: [taskMoved, taskOther] } },
    });
    expect(prisma.taskDesigner.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        { taskId: taskMoved, designerId: alex },
        { taskId: taskMoved, designerId: benjamin },
        { taskId: taskOther, designerId: alex },
      ]),
    });
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: taskMoved },
      data: { assigneeId: null },
    });
  });

  it('recomputes cross-week split labels via Prisma assignment updates', async () => {
    const taskId = '79bde5e5-d694-4728-88ab-33d71f238e11';
    const alex = 'cbfa197a-d2ca-463c-adf3-ea6f8457e2c3';
    const otherWeekRowId = 'other-week-row-1';

    prisma.user.findMany.mockResolvedValue([{ id: alex, fullName: 'Alex Johnson' }]);
    prisma.task.findMany.mockResolvedValue([
      { id: taskId, status: 'DESIGN_PLANNED', assigneeId: alex, projectId: null, project: null },
    ]);
    prisma.schedulerAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: otherWeekRowId,
          taskId,
          dayIndex: 0,
          weekStartDate: new Date('2026-06-29T00:00:00.000Z'),
          splitIndex: 9,
          totalParts: 9,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'week-1',
        version: 5,
        isLocked: false,
        lastPayloadHash: null,
        updatedAt: new Date('2026-07-06T00:00:00.000Z'),
        updatedBy: 'hod-1',
      },
    ]);
    prisma.schedulerWeek.update.mockResolvedValue({
      version: 6,
      isLocked: false,
      updatedAt: new Date('2026-07-06T01:00:00.000Z'),
      updatedBy: 'hod-1',
    });

    await service.saveWeekSnapshot('2026-07-06', 'hod-1', {
      version: 5,
      assignments: [
        {
          designerId: alex,
          taskId,
          dayIndex: 2,
          assignedHours: 8,
          parentId: taskId,
          splitIndex: 1,
          totalParts: 2,
        },
      ],
    });

    expect(prisma.schedulerAssignment.update).toHaveBeenCalledWith({
      where: { id: otherWeekRowId },
      data: { splitIndex: 1, totalParts: 2 },
    });
  });

  it('incremental save rejects when stale version overlaps another editor task', async () => {
    const taskA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const designer1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    prisma.user.findMany.mockResolvedValue([{ id: designer1, fullName: 'Alex Johnson' }]);
    prisma.task.findMany.mockResolvedValue([
      { id: taskA, status: 'DESIGN_NEW', assigneeId: null, projectId: null, project: null },
    ]);
    prisma.schedulerAssignment.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'week-1',
        version: 2,
        isLocked: false,
        lastPayloadHash: null,
        updatedAt: new Date('2026-06-08T00:00:00.000Z'),
        updatedBy: 'hod-2',
      },
    ]);
    prisma.schedulerAssignmentHistory.findMany.mockResolvedValue([
      {
        beforeJson: JSON.stringify([{ taskId: taskA }]),
        afterJson: JSON.stringify([{ taskId: taskA }]),
      },
    ]);

    await expect(
      service.saveWeekSnapshot('2026-06-08', 'hod-1', {
        version: 1,
        affectedTaskIds: [taskA],
        assignments: [
          {
            designerId: designer1,
            taskId: taskA,
            dayIndex: 2,
            assignedHours: 4,
          },
        ],
      }),
    ).rejects.toThrow('Scheduler tasks were updated by someone else');
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

  describe('clearTaskSchedule', () => {
    it('deletes unconditionally when no expectedAssignmentIds given (back-compat)', async () => {
      await service.clearTaskSchedule('task-1');

      expect(prisma.schedulerAssignment.findMany).not.toHaveBeenCalled();
      expect(prisma.schedulerAssignment.deleteMany).toHaveBeenCalledWith({
        where: { taskId: 'task-1', weekStartDate: { gte: expect.any(Date) } },
      });
    });

    it('proceeds when every live row is in expectedAssignmentIds', async () => {
      prisma.schedulerAssignment.findMany.mockResolvedValue([{ id: 'row-a' }, { id: 'row-b' }]);

      await service.clearTaskSchedule('task-1', ['row-a', 'row-b']);

      expect(prisma.schedulerAssignment.deleteMany).toHaveBeenCalledWith({
        where: { taskId: 'task-1', weekStartDate: { gte: expect.any(Date) } },
      });
    });

    it('rejects and does not delete when a live row is outside expectedAssignmentIds', async () => {
      // Simulates a sibling scheduled in a week the caller never loaded, created after its last reload.
      prisma.schedulerAssignment.findMany.mockResolvedValue([{ id: 'row-a' }, { id: 'row-unknown' }]);

      await expect(
        service.clearTaskSchedule('task-1', ['row-a']),
      ).rejects.toThrow('Another scheduled part of this task changed');

      expect(prisma.schedulerAssignment.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('saveWeekSnapshot — cross-week overflow placement', () => {
    const DESIGNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const TASK_ID = '79bde5e5-d694-4728-88ab-33d71f238e11';
    const HOD_ID = 'hod-1';
    // 2026-07-06 is a Monday; 2026-07-13 (the following Monday) is the first overflow candidate.

    function mockQueryRaw(weekVersion = 0, holidayDates: string[] = []) {
      prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('ErpTSHoliday')) {
          return Promise.resolve(holidayDates.map((date) => ({ date })));
        }
        if (sql.includes('ErpTSSchedulerWeek')) {
          return Promise.resolve([
            { id: 'week-row', version: weekVersion, isLocked: false, lastPayloadHash: null, updatedAt: new Date(), updatedBy: null },
          ]);
        }
        return Promise.resolve([]);
      });
    }

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([{ id: DESIGNER_ID, fullName: 'Alex Johnson' }]);
      prisma.task.findMany.mockResolvedValue([
        { id: TASK_ID, status: 'DESIGN_PLANNED', assigneeId: DESIGNER_ID, projectId: null, project: null },
      ]);
      prisma.schedulerWeek.findUnique.mockResolvedValue({ version: 1 });
      prisma.schedulerWeek.update.mockResolvedValue({
        version: 1,
        isLocked: false,
        updatedAt: new Date('2026-07-06T01:00:00.000Z'),
        updatedBy: HOD_ID,
      });
      prisma.schedulerAssignment.create.mockResolvedValue({});
      mockQueryRaw(0, []);
    });

    it('places overflow on the next available day when it does not fit this week', async () => {
      // Live capacity check for the destination day — nothing else scheduled, full room.
      prisma.schedulerAssignment.findMany.mockImplementation(({ where, select }: any) => {
        if (where?.dayIndex !== undefined && select?.assignedHours) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const result = await service.saveWeekSnapshot('2026-07-06', HOD_ID, {
        version: 0,
        assignments: [
          {
            designerId: DESIGNER_ID, taskId: TASK_ID, dayIndex: 4, assignedHours: 1.67,
            parentId: TASK_ID, splitIndex: 1, totalParts: 2,
          },
        ],
        overflow: [{ designerId: DESIGNER_ID, taskId: TASK_ID, hours: 0.33 }],
      } as any);

      expect(prisma.schedulerAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          designerId: DESIGNER_ID,
          taskId: TASK_ID,
          dayIndex: 0,
          weekStartDate: new Date('2026-07-13T00:00:00.000Z'),
          parentId: TASK_ID,
        }),
      });
      expect(prisma.schedulerWeek.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { weekStartDate: new Date('2026-07-13T00:00:00.000Z') } }),
      );
      expect(result.overflowPlacements).toEqual([
        expect.objectContaining({ weekStart: '2026-07-13', dayIndex: 0, hours: 0.33, taskId: TASK_ID, designerId: DESIGNER_ID }),
      ]);
      expect(result.unplacedOverflow).toEqual([]);
    });

    it('splits overflow across multiple days when one day is not enough', async () => {
      // First candidate day (Mon 07-13) already has 7h used — only 1h of room; the rest (1h) must roll to Tuesday.
      prisma.schedulerAssignment.findMany.mockImplementation(({ where, select }: any) => {
        if (where?.dayIndex !== undefined && select?.assignedHours) {
          const isMonday = where.dayIndex === 0;
          return Promise.resolve(isMonday ? [{ assignedHours: 7 }] : []);
        }
        return Promise.resolve([]);
      });

      const result = await service.saveWeekSnapshot('2026-07-06', HOD_ID, {
        version: 0,
        assignments: [
          { designerId: DESIGNER_ID, taskId: TASK_ID, dayIndex: 4, assignedHours: 8, parentId: TASK_ID, splitIndex: 1, totalParts: 2 },
        ],
        overflow: [{ designerId: DESIGNER_ID, taskId: TASK_ID, hours: 2 }],
      } as any);

      expect(result.overflowPlacements).toEqual([
        expect.objectContaining({ weekStart: '2026-07-13', dayIndex: 0, hours: 1 }),
        expect.objectContaining({ weekStart: '2026-07-13', dayIndex: 1, hours: 1 }),
      ]);
      expect(result.unplacedOverflow).toEqual([]);
    });

    it('skips weekends and holidays when finding a day', async () => {
      // Block Mon 07-13 with a holiday so the first real candidate is Tue 07-14.
      mockQueryRaw(0, ['2026-07-13']);
      prisma.schedulerAssignment.findMany.mockImplementation(({ where, select }: any) => {
        if (where?.dayIndex !== undefined && select?.assignedHours) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const result = await service.saveWeekSnapshot('2026-07-06', HOD_ID, {
        version: 0,
        assignments: [
          { designerId: DESIGNER_ID, taskId: TASK_ID, dayIndex: 4, assignedHours: 1, parentId: TASK_ID, splitIndex: 1, totalParts: 2 },
        ],
        overflow: [{ designerId: DESIGNER_ID, taskId: TASK_ID, hours: 1 }],
      } as any);

      expect(result.overflowPlacements).toEqual([
        expect.objectContaining({ weekStart: '2026-07-13', dayIndex: 1 }),
      ]);
    });

    it('reports unplaced hours instead of dropping them when no capacity is found within the lookahead bound', async () => {
      // Every candidate day reports full capacity already used.
      prisma.schedulerAssignment.findMany.mockImplementation(({ where, select }: any) => {
        if (where?.dayIndex !== undefined && select?.assignedHours) return Promise.resolve([{ assignedHours: 8 }]);
        return Promise.resolve([]);
      });

      const result = await service.saveWeekSnapshot('2026-07-06', HOD_ID, {
        version: 0,
        assignments: [
          { designerId: DESIGNER_ID, taskId: TASK_ID, dayIndex: 4, assignedHours: 1, parentId: TASK_ID, splitIndex: 1, totalParts: 2 },
        ],
        overflow: [{ designerId: DESIGNER_ID, taskId: TASK_ID, hours: 1 }],
      } as any);

      expect(result.overflowPlacements).toEqual([]);
      expect(result.unplacedOverflow).toEqual([
        expect.objectContaining({ taskId: TASK_ID, designerId: DESIGNER_ID, hours: 1 }),
      ]);
      expect(prisma.schedulerAssignment.create).not.toHaveBeenCalled();
    });

    it('live-checks the destination day rather than trusting a stale assumption', async () => {
      // Simulates a concurrent change: the destination day already has 7.7h used by the time
      // this transaction actually reads it, leaving only 0.3h of real room.
      prisma.schedulerAssignment.findMany.mockImplementation(({ where, select }: any) => {
        if (where?.dayIndex !== undefined && select?.assignedHours) {
          const isMonday = where.dayIndex === 0;
          return Promise.resolve(isMonday ? [{ assignedHours: 7.7 }] : []);
        }
        return Promise.resolve([]);
      });

      const result = await service.saveWeekSnapshot('2026-07-06', HOD_ID, {
        version: 0,
        assignments: [
          { designerId: DESIGNER_ID, taskId: TASK_ID, dayIndex: 4, assignedHours: 1, parentId: TASK_ID, splitIndex: 1, totalParts: 2 },
        ],
        overflow: [{ designerId: DESIGNER_ID, taskId: TASK_ID, hours: 1 }],
      } as any);

      // 0.3h fits Monday (live capacity, not the naive assumption of a full 8h day), remaining 0.7h rolls to Tuesday.
      expect(result.overflowPlacements).toEqual([
        expect.objectContaining({ weekStart: '2026-07-13', dayIndex: 0, hours: 0.3 }),
        expect.objectContaining({ weekStart: '2026-07-13', dayIndex: 1, hours: 0.7 }),
      ]);
    });
  });

  describe('purgeExpiredAssignmentHistory', () => {
    const originalRetention = process.env.SCHEDULER_HISTORY_RETENTION_MONTHS;

    afterEach(() => {
      if (originalRetention === undefined) {
        delete process.env.SCHEDULER_HISTORY_RETENTION_MONTHS;
      } else {
        process.env.SCHEDULER_HISTORY_RETENTION_MONTHS = originalRetention;
      }
    });

    it('deletes history older than the retention window', async () => {
      process.env.SCHEDULER_HISTORY_RETENTION_MONTHS = '18';
      prisma.schedulerAssignmentHistory.deleteMany.mockResolvedValue({ count: 42 });

      const result = await service.purgeExpiredAssignmentHistory();

      expect(result.deletedCount).toBe(42);
      expect(result.cutoff).toBeInstanceOf(Date);
      expect(prisma.schedulerAssignmentHistory.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });
    });

    it('skips delete when retention is disabled (0)', async () => {
      process.env.SCHEDULER_HISTORY_RETENTION_MONTHS = '0';

      const result = await service.purgeExpiredAssignmentHistory();

      expect(result).toEqual({ deletedCount: 0, cutoff: null });
      expect(prisma.schedulerAssignmentHistory.deleteMany).not.toHaveBeenCalled();
    });
  });

  it('bounds cross-week split recompute to ±SCHEDULER_SPLIT_RECOMPUTE_WEEK_WINDOW', async () => {
    const originalWindow = process.env.SCHEDULER_SPLIT_RECOMPUTE_WEEK_WINDOW;
    process.env.SCHEDULER_SPLIT_RECOMPUTE_WEEK_WINDOW = '4';
    try {
      const taskId = '79bde5e5-d694-4728-88ab-33d71f238e11';
      const alex = 'cbfa197a-d2ca-463c-adf3-ea6f8457e2c3';
      prisma.user.findMany.mockResolvedValue([{ id: alex, fullName: 'Alex Johnson' }]);
      prisma.task.findMany.mockResolvedValue([
        { id: taskId, status: 'DESIGN_PLANNED', assigneeId: alex, projectId: null, project: null },
      ]);
      prisma.schedulerAssignment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'week-1',
          weekStartDate: new Date('2026-07-06T00:00:00.000Z'),
          version: 0,
          isLocked: false,
          updatedAt: new Date(),
          updatedBy: null,
          lastPayloadHash: null,
        },
      ]);
      prisma.schedulerWeek.update.mockResolvedValue({
        version: 1,
        isLocked: false,
        updatedAt: new Date(),
        updatedBy: alex,
      });

      await service.saveWeekSnapshot('2026-07-06', alex, {
        version: 0,
        assignments: [
          {
            designerId: alex,
            taskId,
            dayIndex: 0,
            assignedHours: 4,
            parentId: taskId,
            splitIndex: 1,
            totalParts: 2,
          },
        ],
      } as any);

      const crossWeekCall = prisma.schedulerAssignment.findMany.mock.calls.find(
        (call: any[]) => call[0]?.where?.weekStartDate?.gte && call[0]?.where?.weekStartDate?.lte,
      );
      expect(crossWeekCall).toBeTruthy();
      expect(crossWeekCall[0].where.weekStartDate.gte.toISOString()).toBe('2026-06-08T00:00:00.000Z');
      expect(crossWeekCall[0].where.weekStartDate.lte.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    } finally {
      if (originalWindow === undefined) delete process.env.SCHEDULER_SPLIT_RECOMPUTE_WEEK_WINDOW;
      else process.env.SCHEDULER_SPLIT_RECOMPUTE_WEEK_WINDOW = originalWindow;
    }
  });
});
