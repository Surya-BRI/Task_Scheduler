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
    activityLog: { findMany: jest.fn().mockResolvedValue([]) },
    regularizationRequest: { findMany: jest.fn().mockResolvedValue([]) },
    overtimeRequest: { findMany: jest.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const service = new DashboardService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.taskDesigner.findMany.mockResolvedValue([]);
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

    it('scopes HOD metrics to department assignees when department is set', async () => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: 'dept-1' });
      prisma.task.count.mockResolvedValue(10);
      prisma.project.count.mockResolvedValue(5);
      prisma.task.groupBy.mockResolvedValue([]);

      await service.getMetrics('hod-1', UserRole.HOD);

      expect(prisma.task.count).toHaveBeenCalledWith({
        where: { assignee: { departmentId: 'dept-1' } },
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
