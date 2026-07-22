import { DeadlineAlertsService } from './deadline-alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { CronLockService, LOCK_NOT_ACQUIRED } from '../common/services/cron-lock.service';

describe('DeadlineAlertsService', () => {
  const prisma = {
    user: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const notificationsService = {
    existsToday: jest.fn(),
    create: jest.fn(),
  } as unknown as NotificationsService;
  const activityLogger = { log: jest.fn() } as unknown as ActivityLoggerService;
  const cronLockService = {
    withLock: jest.fn((_resource: string, fn: () => Promise<unknown>) => fn()),
  } as unknown as CronLockService;

  const service = new DeadlineAlertsService(
    prisma as never,
    notificationsService,
    activityLogger,
    cronLockService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([{ id: 'hod-1', fullName: 'HOD User' }]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    notificationsService.existsToday = jest.fn().mockResolvedValue(false);
    notificationsService.create = jest.fn().mockResolvedValue({});
  });

  it('skips when cron lock is held by another instance', async () => {
    cronLockService.withLock = jest.fn().mockResolvedValue(LOCK_NOT_ACQUIRED);
    await service.checkDeadlines();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    cronLockService.withLock = jest.fn((_resource: string, fn: () => Promise<unknown>) =>
      fn(),
    ) as unknown as CronLockService['withLock'];
  });

  it('skips deadline scan when no HOD/Admin users exist', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.checkDeadlines();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('does not send alerts when no tasks are within the horizon', async () => {
    await service.checkDeadlines();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('sends reminder notifications for tasks nearing deadline', async () => {
    const now = Date.now();
    const dueDate = new Date(now + 14 * 60 * 1000); // 14 minutes — within 15-minute window

    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        taskNo: 'T-001',
        title: 'Urgent task',
        designType: 'project',
        status: 'IN_PROGRESS',
        dueDate,
        priority: 'High',
        assigneeId: 'designer-1',
        technicalHead: null,
        teamLead: null,
        subTeamLead: null,
        projectId: 'proj-1',
        project: {
          id: 'proj-1',
          projectNo: 'P-001',
          name: 'Test Project',
          category: 'Project',
          technicalHead: null,
          teamLead: null,
          subTeamLead: null,
          createdById: null,
        },
        retailDetails: [],
        projectDetails: [],
      },
    ]);

    await service.checkDeadlines();

    expect(notificationsService.create).toHaveBeenCalled();
    const createCall = (notificationsService.create as jest.Mock).mock.calls[0][0];
    expect(createCall.title).toContain('Task Deadline Reminder');
    expect(createCall.linkUrl).toBe('/project-task-view/task-1');
  });
});
