import { DashboardService } from './dashboard.service';
import { UserRole } from '../common/constants/roles.enum';

describe('DashboardService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    task: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    taskDesigner: { findMany: jest.fn() },
    project: { count: jest.fn() },
    schedulerAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    schedulerTaskFragment: { findMany: jest.fn().mockResolvedValue([]) },
    activityLog: { findMany: jest.fn().mockResolvedValue([]) },
    regularizationRequest: { findMany: jest.fn().mockResolvedValue([]) },
    overtimeRequest: { findMany: jest.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const service = new DashboardService(prisma as any);

  const emptyOverviewMocks = () => {
    prisma.schedulerAssignment.findMany.mockResolvedValue([]);
    prisma.schedulerTaskFragment.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.activityLog.findMany.mockResolvedValue([]);
    prisma.task.groupBy.mockResolvedValue([]);
    prisma.regularizationRequest.findMany.mockResolvedValue([]);
    prisma.overtimeRequest.findMany.mockResolvedValue([]);
    prisma.leaveRequest.findMany.mockResolvedValue([]);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.taskDesigner.findMany.mockResolvedValue([]);
    emptyOverviewMocks();
  });

  describe('getMetrics', () => {
    it('scopes designer metrics to direct and split assignments', async () => {
      prisma.task.count.mockResolvedValue(4);
      prisma.task.groupBy.mockResolvedValue([
        { status: 'DESIGN_NEW', _count: { status: 4 } },
      ]);
      prisma.task.findMany.mockResolvedValue([{ projectId: 'p1' }, { projectId: 'p2' }]);
      prisma.taskDesigner.findMany.mockResolvedValue([{ taskId: 'split-task-1' }]);

      await service.getMetrics('designer-1', UserRole.DESIGNER);

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { assigneeId: 'designer-1' },
            { id: { in: ['split-task-1'] } },
          ],
        },
      });
      expect(prisma.task.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { assigneeId: 'designer-1' },
              { id: { in: ['split-task-1'] } },
            ],
          },
        }),
      );
    });

    it('includes DESIGN_NEW in active bucket totals', async () => {
      prisma.task.count.mockResolvedValue(37);
      prisma.project.count.mockResolvedValue(76);
      prisma.task.groupBy.mockResolvedValue([
        { status: 'DESIGN_NEW', _count: { status: 34 } },
        { status: 'ON_HOLD', _count: { status: 1 } },
        { status: 'CLIENT_ACCEPTED', _count: { status: 2 } },
      ]);

      prisma.user.findUnique.mockResolvedValue({ departmentId: null });
      const result = await service.getMetrics('hod-1', UserRole.HOD);

      expect(result.bucketTotals.total).toBe(37);
      expect(result.activeTasks).toBe(34);
      expect(result.onHoldTasks).toBe(1);
      expect(result.completedTasks).toBe(2);
    });

    it('scopes HOD metrics to department assignees, junction designers, and unassigned backlog', async () => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: 'dept-1' });
      prisma.task.count.mockResolvedValue(10);
      prisma.project.count.mockResolvedValue(5);
      prisma.task.groupBy.mockResolvedValue([]);

      await service.getMetrics('hod-1', UserRole.HOD);

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { assignee: { departmentId: 'dept-1' } },
            { taskDesigners: { some: { designer: { departmentId: 'dept-1' } } } },
            { AND: [{ assigneeId: null }, { taskDesigners: { none: {} } }] },
          ],
        },
      });
    });

    it('falls back to all tasks for HOD without department', async () => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: null });
      prisma.task.count.mockResolvedValue(37);
      prisma.project.count.mockResolvedValue(76);
      prisma.task.groupBy.mockResolvedValue([]);

      await service.getMetrics('hod-1', UserRole.HOD);

      expect(prisma.task.count).toHaveBeenCalledWith({ where: {} });
    });
  });

  describe('getProjectsOverview — hold / realloc / rework', () => {
    const project = { name: 'Project One', projectNo: 'P-1' };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: 'dept-1' });
    });

    it('returns unassigned ON_HOLD tasks for department HOD and merges fragment holds', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([]) // completed
        .mockResolvedValueOnce([
          {
            taskNo: 'T-HOLD-1',
            title: 'Held unassigned',
            designType: 'PROJECT',
            revisionCode: 'R0',
            updatedAt: new Date('2026-06-09T12:00:00.000Z'),
            project,
          },
        ]) // on hold whole-task
        .mockResolvedValueOnce([]) // rework
        .mockResolvedValueOnce([]); // completedWithDue
      prisma.schedulerTaskFragment.findMany.mockResolvedValue([
        {
          id: 'frag-1',
          updatedAt: new Date('2026-06-10T08:00:00.000Z'),
          createdAt: new Date('2026-06-10T08:00:00.000Z'),
          task: {
            taskNo: 'T-PART-1',
            title: 'Partial hold',
            designType: 'PROJECT',
            revisionCode: 'R1',
            project,
          },
        },
      ]);
      prisma.task.groupBy.mockResolvedValue([
        { status: 'IN_PROGRESS', _count: { status: 5 } },
        { status: 'ON_HOLD', _count: { status: 1 } },
      ]);

      const result = await service.getProjectsOverview('2026-06-08', 'hod-1', UserRole.HOD);

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ON_HOLD',
            OR: expect.arrayContaining([
              { assignee: { departmentId: 'dept-1' } },
              { AND: [{ assigneeId: null }, { taskDesigners: { none: {} } }] },
            ]),
          }),
        }),
      );
      expect(result.onHoldTasks.map((t) => t.taskNo).sort()).toEqual(['T-HOLD-1', 'T-PART-1']);
      expect(result.onHoldTasks.find((t) => t.taskNo === 'T-PART-1')?.reason).toBe('Part on hold');
      expect(result.summary.onHold).toBe(2);
    });

    it('skips fragment hold row when whole task is already ON_HOLD', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            taskNo: 'T-SAME',
            title: 'Full hold',
            designType: 'PROJECT',
            revisionCode: 'R0',
            updatedAt: new Date('2026-06-09T12:00:00.000Z'),
            project,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.schedulerTaskFragment.findMany.mockResolvedValue([
        {
          id: 'frag-dup',
          updatedAt: new Date('2026-06-10T08:00:00.000Z'),
          createdAt: new Date('2026-06-10T08:00:00.000Z'),
          task: {
            taskNo: 'T-SAME',
            title: 'Full hold',
            designType: 'PROJECT',
            revisionCode: 'R0',
            project,
          },
        },
      ]);
      prisma.task.groupBy.mockResolvedValue([{ status: 'ON_HOLD', _count: { status: 1 } }]);

      const result = await service.getProjectsOverview('2026-06-08', 'hod-1', UserRole.HOD);
      expect(result.onHoldTasks).toHaveLength(1);
      expect(result.onHoldTasks[0].reason).toBe('On hold');
      expect(result.summary.onHold).toBe(1);
    });

    it('lists reallocation when oldAssigneeId is present even if name is missing', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      prisma.activityLog.findMany
        .mockResolvedValueOnce([
          {
            id: 'log-1',
            createdAt: new Date('2026-06-09T10:00:00.000Z'),
            details: {
              changes: {
                oldAssigneeId: 'designer-a',
                oldAssigneeName: null,
                newAssigneeName: 'Designer B',
              },
            },
            task: {
              taskNo: 'T-RE-1',
              title: 'Moved',
              designType: 'PROJECT',
              revisionCode: 'R0',
              project,
            },
          },
          {
            id: 'log-first',
            createdAt: new Date('2026-06-09T11:00:00.000Z'),
            details: {
              changes: {
                oldAssigneeId: null,
                oldAssigneeName: null,
                newAssigneeName: 'Designer B',
              },
            },
            task: {
              taskNo: 'T-FIRST',
              title: 'First assign',
              designType: 'PROJECT',
              revisionCode: 'R0',
              project,
            },
          },
        ])
        .mockResolvedValueOnce([]); // inbox activity
      prisma.task.groupBy.mockResolvedValue([{ status: 'IN_PROGRESS', _count: { status: 2 } }]);

      const result = await service.getProjectsOverview('2026-06-08', 'hod-1', UserRole.HOD);

      expect(result.reallocatedTasks).toHaveLength(1);
      expect(result.reallocatedTasks[0].taskNo).toBe('T-RE-1');
      expect(result.reallocatedTasks[0].fromAssigneeName).toBe('Unknown');
      expect(result.reallocatedTasks[0].newAssigneeName).toBe('Designer B');
    });

    it('returns REWORK tasks and summary.reworkCount', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([]) // completed
        .mockResolvedValueOnce([]) // on hold
        .mockResolvedValueOnce([
          {
            taskNo: 'T-RW-1',
            title: 'Needs fix',
            designType: 'PROJECT',
            revisionCode: 'R0',
            updatedAt: new Date('2026-06-09T15:00:00.000Z'),
            project,
            assignee: { fullName: 'Sarah Mitchell' },
            taskDesigners: [],
          },
        ]) // rework
        .mockResolvedValueOnce([]); // completedWithDue
      prisma.task.groupBy.mockResolvedValue([
        { status: 'REWORK', _count: { status: 1 } },
        { status: 'IN_PROGRESS', _count: { status: 3 } },
      ]);

      const result = await service.getProjectsOverview('2026-06-08', 'hod-1', UserRole.HOD);

      expect(result.reworkTasks).toHaveLength(1);
      expect(result.reworkTasks[0].taskNo).toBe('T-RW-1');
      expect(result.reworkTasks[0].assigneeName).toBe('Sarah Mitchell');
      expect(result.summary.reworkCount).toBe(1);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'REWORK' }),
        }),
      );
    });
  });

  describe('buildApprovalInbox', () => {
    it('returns leave items for HOD without department (org-wide)', async () => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: null });
      prisma.regularizationRequest.findMany.mockResolvedValue([]);
      prisma.overtimeRequest.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-1',
          userId: 'designer-1',
          startDate: new Date('2026-06-10'),
          endDate: new Date('2026-06-12'),
          createdAt: new Date(),
          type: 'Full Day',
          user: { id: 'designer-1', fullName: 'Alex Johnson' },
        },
      ]);
      prisma.schedulerAssignment.findMany.mockResolvedValue([]);
      prisma.task.findMany.mockResolvedValue([]);
      prisma.activityLog.findMany.mockResolvedValue([]);
      prisma.task.groupBy.mockResolvedValue([]);
      const result = await service.getProjectsOverview('2026-06-08', 'hod-1', UserRole.HOD);
      const leaveItems = result.inbox.filter((i) => i.requestType === 'leave');
      expect(leaveItems.length).toBeGreaterThan(0);
      expect(leaveItems[0].requiresAction).toBe(true);
    });
  });

  describe('parseWeekStart', () => {
    it('parses UTC Monday dates', () => {
      const d = service.parseWeekStart('2026-06-08');
      expect(d.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    });

    it('returns current UTC Monday string', () => {
      const monday = service.getCurrentMonday();
      expect(monday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
