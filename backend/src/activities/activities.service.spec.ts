import { ActivitiesService } from './activities.service';
import { UserRole } from '../common/constants/roles.enum';
import { ActivityAction, PROJECT_HISTORY_EXCLUDED_ACTIONS } from './activity-events';

describe('ActivitiesService', () => {
  const prisma = {
    task: { findMany: jest.fn() },
    activityLog: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ActivitiesService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries designer feed without invalid ActivityLog.projectId filter', async () => {
    await service.findAll({
      limit: 10,
      requestingUserId: '11111111-1111-4111-8111-111111111111',
      requestingUserRole: UserRole.DESIGNER,
    });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: { notIn: [ActivityAction.CHATTER_MENTION] },
          OR: [
            { task: { assigneeId: '11111111-1111-4111-8111-111111111111' } },
            { task: { taskDesigners: { some: { designerId: '11111111-1111-4111-8111-111111111111' } } } },
            { userId: '11111111-1111-4111-8111-111111111111' },
          ],
        },
      }),
    );
  });

  it('excludes overtime and regularization actions from project history', async () => {
    const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await service.findByProject({ projectId, limit: 20 });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: {
            notIn: [ActivityAction.CHATTER_MENTION, ...PROJECT_HISTORY_EXCLUDED_ACTIONS],
          },
          OR: [
            { task: { projectId } },
            { details: { contains: projectId } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('excludes overtime and regularization actions from task history', async () => {
    const taskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await service.findByTask({ taskId, limit: 20 });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: {
            notIn: [ActivityAction.CHATTER_MENTION, ...PROJECT_HISTORY_EXCLUDED_ACTIONS],
          },
          taskId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('does not exclude overtime/regularization from the team activity feed', async () => {
    await service.findAll({ limit: 10 });

    const where = prisma.activityLog.findMany.mock.calls[0][0].where;
    expect(where.action).toEqual({ notIn: [ActivityAction.CHATTER_MENTION] });
    for (const action of PROJECT_HISTORY_EXCLUDED_ACTIONS) {
      expect(where.action.notIn).not.toContain(action);
    }
  });

  it('returns chronologically ordered task events and never maps excluded actions in project history', async () => {
    const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const older = new Date('2026-07-01T10:00:00.000Z');
    const newer = new Date('2026-07-02T10:00:00.000Z');
    prisma.activityLog.findMany.mockResolvedValueOnce([
      {
        id: 'act-2',
        action: ActivityAction.STATUS_CHANGED,
        details: JSON.stringify({
          messageKey: 'status_changed',
          changes: { newStatus: 'IN_PROGRESS' },
        }),
        createdAt: newer,
        user: { id: 'u1', fullName: 'Alex' },
        task: {
          id: 't1',
          taskNo: 'T-1',
          opNo: null,
          title: 'Layout',
          status: 'IN_PROGRESS',
          priority: 'NORMAL',
          dueDate: null,
          assignee: { fullName: 'Alex' },
          taskDesigners: [],
          retailDetails: [],
          project: { id: projectId, name: 'Proj', projectNo: 'P-1' },
        },
      },
      {
        id: 'act-1',
        action: ActivityAction.TASK_CREATED,
        details: JSON.stringify({ messageKey: 'task_created' }),
        createdAt: older,
        user: { id: 'u1', fullName: 'Alex' },
        task: {
          id: 't1',
          taskNo: 'T-1',
          opNo: null,
          title: 'Layout',
          status: 'OPEN',
          priority: 'NORMAL',
          dueDate: null,
          assignee: { fullName: 'Alex' },
          taskDesigners: [],
          retailDetails: [],
          project: { id: projectId, name: 'Proj', projectNo: 'P-1' },
        },
      },
    ]);

    const result = await service.findByProject({ projectId, limit: 20 });

    expect(result.data.map((row) => row.action)).toEqual([
      ActivityAction.STATUS_CHANGED,
      ActivityAction.TASK_CREATED,
    ]);
    expect(result.data.map((row) => row.occurredAt)).toEqual([
      newer.toISOString(),
      older.toISOString(),
    ]);
    for (const row of result.data) {
      expect(PROJECT_HISTORY_EXCLUDED_ACTIONS).not.toContain(row.action);
    }
  });

  describe('overtime summaries', () => {
    it('formats submitted overtime with sender and recipient context', () => {
      const summary = (service as any).formatSummary(
        'OVERTIME_REQUEST_SUBMITTED',
        {
          messageKey: 'overtime_request_submitted',
          taskSnapshot: { taskNo: 'TSK-OP58199-20260604085458-55584' },
          context: { designerName: 'Alex Johnson', recipientName: 'Morgan Lee' },
        },
        'Alex Johnson',
      );

      expect(summary).toBe('Alex Johnson sent an overtime request to Morgan Lee');
    });

    it('formats approved overtime with reviewer and requester context', () => {
      const summary = (service as any).formatSummary(
        'OVERTIME_REQUEST_APPROVED',
        {
          messageKey: 'overtime_request_approved',
          context: { designerName: 'Alex Johnson', reviewerName: 'Morgan Lee' },
        },
        'Morgan Lee',
      );

      expect(summary).toBe('Morgan Lee accepted the overtime request from Alex Johnson');
    });
  });

  describe('chatter summaries', () => {
    it('includes task title for task chatter posts', () => {
      const summary = (service as any).formatSummary(
        'CREATED_CHATTER_POST',
        { messageKey: 'chatter_post_created' },
        'Sarah Mitchell',
        'Retail Signage Layout',
      );

      expect(summary).toBe('Sarah Mitchell posted in chatter on Task: Retail Signage Layout');
    });
  });
});
