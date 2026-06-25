import { SchedulerAssignmentsService } from './scheduler-assignments.service';

describe('SchedulerAssignmentsService', () => {
  const prisma: any = {
    schedulerAssignment: { findMany: jest.fn() },
    overtimeRequest: { findMany: jest.fn() },
    leaveRequest: { findMany: jest.fn() },
    regularizationRequest: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    schedulerWeek: {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    schedulerAssignmentHistory: { create: jest.fn() },
    $queryRaw: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.schedulerAssignment.findMany.mockResolvedValue([]);
    prisma.overtimeRequest.findMany.mockResolvedValue([]);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
    prisma.regularizationRequest.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.schedulerWeek.create.mockResolvedValue({});
    prisma.schedulerWeek.update.mockResolvedValue({});
    prisma.schedulerWeek.upsert.mockResolvedValue({});
    prisma.schedulerAssignmentHistory.create.mockResolvedValue({});
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((cb: (tx: any) => Promise<unknown>) => cb(prisma));
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
});
