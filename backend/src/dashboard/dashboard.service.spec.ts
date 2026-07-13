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

  describe('getProjectsOverview — hold / rework / links', () => {
    const project = { name: 'Project One', projectNo: 'P-1' };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: 'dept-1' });
    });

    it('returns unassigned ON_HOLD + fragment holds with task links; scopes scheduled by dept', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([]) // completed
        .mockResolvedValueOnce([
          {
            id: 'hold-1',
            taskNo: 'T-HOLD-1',
            title: 'Held unassigned',
            designType: 'PROJECT',
            revisionCode: 'R0',
            updatedAt: new Date('2026-06-09T12:00:00.000Z'),
            project,
          },
        ])
        .mockResolvedValueOnce([]) // rework
        .mockResolvedValueOnce([]); // completedWithDue
      prisma.schedulerTaskFragment.findMany.mockResolvedValue([
        {
          id: 'frag-1',
          updatedAt: new Date('2026-06-10T08:00:00.000Z'),
          createdAt: new Date('2026-06-10T08:00:00.000Z'),
          task: {
            id: 'part-1',
            taskNo: 'T-PART-1',
            title: 'Partial hold',
            designType: 'RETAIL',
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

      expect(prisma.schedulerAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            weekStartDate: expect.any(Date),
            task: expect.objectContaining({
              OR: expect.any(Array),
            }),
          }),
        }),
      );
      expect(result.onHoldTasks).toHaveLength(2);
      expect(result.onHoldTasks.find((t) => t.taskNo === 'T-PART-1')?.reason).toBe('Part on hold');
      expect(result.onHoldTasks.find((t) => t.taskNo === 'T-PART-1')?.linkUrl).toContain('/retail-task-view/part-1');
      expect(result.onHoldTasks.find((t) => t.taskNo === 'T-HOLD-1')?.linkUrl).toContain('/project-task-view/hold-1');
      expect(result.summary.onHold).toBe(2);
      // IN_PROGRESS 5 minus 1 fragment-only parent counted under onHold
      expect(result.summary.active).toBe(4);
      expect(result.reallocatedTasks).toEqual([]);
    });

    it('excludes REWORK from active donut count and returns reworkTasks with links', async () => {
      prisma.task.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'rw-1',
            taskNo: 'T-RW-1',
            title: 'Needs fix',
            designType: 'PROJECT',
            revisionCode: 'R0',
            updatedAt: new Date('2026-06-09T15:00:00.000Z'),
            project,
            assignee: { fullName: 'Sarah Mitchell' },
            taskDesigners: [],
          },
        ])
        .mockResolvedValueOnce([]);
      prisma.task.groupBy.mockResolvedValue([
        { status: 'REWORK', _count: { status: 2 } },
        { status: 'IN_PROGRESS', _count: { status: 3 } },
      ]);

      const result = await service.getProjectsOverview('2026-06-08', 'hod-1', UserRole.HOD);

      expect(result.reworkTasks).toHaveLength(1);
      expect(result.reworkTasks[0].linkUrl).toContain('/project-task-view/rw-1');
      expect(result.summary.reworkCount).toBe(2);
      // buckets.active = 3 + 2 = 5; minus rework 2 => active 3
      expect(result.summary.active).toBe(3);
      expect(result.summary.donut.active.value).toBe(3);
    });

    it('builds HOD-safe activity inbox links to task view (not designer-only list)', async () => {
      prisma.activityLog.findMany.mockResolvedValue([
        {
          id: 'act-1',
          action: 'STATUS_CHANGED',
          createdAt: new Date(),
          taskId: 'task-99',
          details: {},
          user: { fullName: 'Alex' },
          task: { id: 'task-99', taskNo: 'T-99', designType: 'PROJECT' },
        },
      ]);
      prisma.task.groupBy.mockResolvedValue([]);

      const result = await service.getProjectsOverview('2026-06-08', 'hod-1', UserRole.HOD);
      const activity = result.inbox.find((i) => i.id === 'act-1');
      expect(activity?.linkUrl).toBe('/project-task-view/task-99?from=design-list');
      expect(activity?.linkUrl).not.toContain('/design-list/tasks');
    });
  });

  describe('buildApprovalInbox', () => {
    it('returns leave items for HOD without department (org-wide)', async () => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: null });
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
