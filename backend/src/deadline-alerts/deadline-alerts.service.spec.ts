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
    jest.useRealTimers();
    prisma.user.findMany.mockResolvedValue([
      { id: 'hod-1', fullName: 'HOD User', role: { name: 'HOD' } },
      { id: 'sales-1', fullName: 'Sithara Sukumaran', role: { name: 'SALESPERSON' } },
      { id: 'sales-2', fullName: 'Fahad', role: { name: 'SALESPERSON' } },
    ]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    notificationsService.existsToday = jest.fn().mockResolvedValue(false);
    notificationsService.create = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips when cron lock is held by another instance', async () => {
    cronLockService.withLock = jest.fn().mockResolvedValue(LOCK_NOT_ACQUIRED);
    await service.checkDeadlines();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    cronLockService.withLock = jest.fn((_resource: string, fn: () => Promise<unknown>) =>
      fn(),
    ) as unknown as CronLockService['withLock'];
  });

  it('skips deadline scan when no HOD/Admin/Sales users exist', async () => {
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
          salesPerson: 'FahadQuazi',
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
    const createCalls = (notificationsService.create as jest.Mock).mock.calls.map((c) => c[0]);
    expect(createCalls.some((c) => String(c.title).includes('Task Deadline Reminder'))).toBe(true);
    expect(createCalls[0].linkUrl).toBe('/project-task-view/task-1');
    // Matching sales only (Fahad), not every salesperson; HOD still gets fallback.
    const recipientIds = createCalls.map((c) => c.userId);
    expect(recipientIds).toContain('hod-1');
    expect(recipientIds).toContain('designer-1');
    expect(recipientIds).toContain('sales-2');
    expect(recipientIds).not.toContain('sales-1');
  });

  it('does not broadcast overdue alerts to unrelated sales users', async () => {
    // 08:00 GST = 04:00 UTC
    jest.useFakeTimers({ now: new Date('2026-08-09T04:00:00.000Z') });
    const dueDate = new Date(Date.now() - 60 * 60 * 1000);

    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-overdue',
        taskNo: 'T-OVER',
        title: 'Old task',
        designType: 'Retail',
        status: 'DESIGN_PLANNED',
        dueDate,
        priority: 'Medium',
        assigneeId: null,
        technicalHead: null,
        teamLead: null,
        subTeamLead: null,
        projectId: 'proj-2',
        project: {
          id: 'proj-2',
          projectNo: 'P-002',
          name: 'Other Sales OP',
          category: 'Retail',
          salesPerson: 'NishadLona',
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

    const recipientIds = (notificationsService.create as jest.Mock).mock.calls.map((c) => c[0].userId);
    expect(recipientIds).toContain('hod-1');
    expect(recipientIds).not.toContain('sales-1');
    expect(recipientIds).not.toContain('sales-2');
    jest.useRealTimers();
  });

  it('skips overdue alerts outside the 08:00 GST morning window', async () => {
    // 12:00 GST = 08:00 UTC — outside the 08:00–08:05 GST window
    jest.useFakeTimers({ now: new Date('2026-08-09T08:00:00.000Z') });
    const dueDate = new Date(Date.now() - 60 * 60 * 1000);

    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-overdue',
        taskNo: 'T-OVER',
        title: 'Old task',
        designType: 'Retail',
        status: 'DESIGN_PLANNED',
        dueDate,
        priority: 'Medium',
        assigneeId: 'designer-1',
        technicalHead: null,
        teamLead: null,
        subTeamLead: null,
        projectId: 'proj-2',
        project: {
          id: 'proj-2',
          projectNo: 'P-002',
          name: 'Other Sales OP',
          category: 'Retail',
          salesPerson: 'FahadQuazi',
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

    expect(notificationsService.create).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('sends overdue alerts at 08:00 GST', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-09T04:00:00.000Z') });
    const dueDate = new Date(Date.now() - 60 * 60 * 1000);

    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-overdue',
        taskNo: 'T-OVER',
        title: 'Old task',
        designType: 'Retail',
        status: 'DESIGN_PLANNED',
        dueDate,
        priority: 'Medium',
        assigneeId: 'designer-1',
        technicalHead: null,
        teamLead: null,
        subTeamLead: null,
        projectId: 'proj-2',
        project: {
          id: 'proj-2',
          projectNo: 'P-002',
          name: 'Other Sales OP',
          category: 'Retail',
          salesPerson: 'FahadQuazi',
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

    const titles = (notificationsService.create as jest.Mock).mock.calls.map((c) => c[0].title);
    expect(titles.some((t) => String(t).includes('Deadline Overdue'))).toBe(true);
    jest.useRealTimers();
  });
});
