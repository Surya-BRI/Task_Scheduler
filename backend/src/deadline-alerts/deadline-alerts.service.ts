import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import { CronLockService, LOCK_NOT_ACQUIRED } from '../common/services/cron-lock.service';
import { taskViewPath } from '../common/utils/design-type.util';

const DEADLINE_CRON_LOCK = 'TaskScheduler:DeadlineAlertsCron';

const REMINDER_INTERVALS = [
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '12 hours', ms: 12 * 60 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '15 minutes', ms: 15 * 60 * 1000 },
] as const;

const SCAN_WINDOW_MS = 5 * 60 * 1000 + 30 * 1000;
const HORIZON_MS = REMINDER_INTERVALS[0].ms;
// Tasks in these statuses are not actively being worked and should not generate deadline
// reminders/overdue nags. Kept in sync with the unified vocabulary in tasks/task-status.util.ts —
// there is no CANCELLED/CANCELED Task status (that string only applies to LeaveRequest); a
// paused task is ON_HOLD.
const ACTIVE_TASK_STATUS_EXCLUSIONS = [
  'CLIENT_ACCEPTED',
  'CLIENT_REJECTED',
  'DESIGN_COMPLETED',
  'ON_HOLD',
];

type DeadlineInterval = (typeof REMINDER_INTERVALS)[number];

@Injectable()
export class DeadlineAlertsService {
  private readonly logger = new Logger(DeadlineAlertsService.name);
  private cronRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly cronLockService: CronLockService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  @Cron('*/5 * * * *')
  async checkDeadlines() {
    if (this.cronRunning) {
      this.logger.debug('Deadline alerts skipped: previous run still in progress');
      return;
    }

    this.cronRunning = true;
    try {
      const result = await this.cronLockService.withLock(DEADLINE_CRON_LOCK, () => this.runDeadlineScan());
      if (result === LOCK_NOT_ACQUIRED) {
        this.logger.debug('Deadline alerts skipped: lock held by another instance');
      }
    } finally {
      this.cronRunning = false;
    }
  }

  private async runDeadlineScan() {
    const now = new Date();
    const horizon = new Date(now.getTime() + HORIZON_MS);

    const hodUsers = await this.prisma.user.findMany({
      where: { role: { name: { in: ['HOD', 'SALESPERSON', 'ADMIN'] } } },
      select: { id: true, fullName: true },
    });

    if (hodUsers.length === 0) {
      this.logger.warn('Deadline alerts skipped: no HOD/Admin users found');
      return;
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        status: { notIn: ACTIVE_TASK_STATUS_EXCLUSIONS },
        OR: [
          { dueDate: { lte: horizon } },
          { retailDetails: { some: { deadline: { lte: horizon } } } },
          { projectDetails: { some: { deadline: { lte: horizon } } } },
        ],
      },
      select: {
        id: true,
        taskNo: true,
        title: true,
        designType: true,
        status: true,
        dueDate: true,
        priority: true,
        assigneeId: true,
        technicalHead: true,
        teamLead: true,
        subTeamLead: true,
        projectId: true,
        project: {
          select: {
            id: true,
            projectNo: true,
            name: true,
            category: true,
            technicalHead: true,
            teamLead: true,
            subTeamLead: true,
            createdById: true,
          },
        },
        retailDetails: { select: { deadline: true, hodName: true } },
        projectDetails: { select: { deadline: true } },
      },
    });
    const splitDesignerIdsByTaskId = await this.getSplitDesignerIdsByTaskId(tasks.map((task) => task.id));
    const tasksWithDesigners = tasks.map((task) => ({
      ...task,
      splitDesignerIds: splitDesignerIdsByTaskId.get(task.id) ?? [],
    }));

    let taskAlertCount = 0;
    let projectAlertCount = 0;

    for (const task of tasksWithDesigners) {
      const dueDate = this.getTaskDueDate(task);
      if (!dueDate) continue;

      const interval = this.getReminderInterval(now, dueDate);
      const isOverdue = dueDate <= now;
      if (!interval && !isOverdue) continue;

      const linkUrl = this.taskLink(task);
      const title = isOverdue ? 'Task Deadline Overdue' : `Task Deadline Reminder - ${interval!.label}`;
      const message = this.buildTaskMessage(task, dueDate, now, interval, isOverdue);
      const recipients = this.getTaskRecipients(task, hodUsers);

      if (await this.notifyRecipients(recipients, title, message, linkUrl)) {
        taskAlertCount += 1;
        await this.logActivity(task, title, dueDate, now, isOverdue, recipients[0] ?? hodUsers[0].id);
      }
    }

    const projectDeadlines = this.getProjectDeadlines(tasksWithDesigners, hodUsers);
    for (const projectDeadline of projectDeadlines) {
      const interval = this.getReminderInterval(now, projectDeadline.dueDate);
      const isOverdue = projectDeadline.dueDate <= now;
      if (!interval && !isOverdue) continue;

      const title = isOverdue ? 'Project Deadline Overdue' : `Project Deadline Reminder - ${interval!.label}`;
      const message = this.buildProjectMessage(projectDeadline, now, interval, isOverdue);
      const linkUrl = this.taskLink(projectDeadline.task);

      if (await this.notifyRecipients(projectDeadline.recipients, title, message, linkUrl)) {
        projectAlertCount += 1;
        await this.logActivity(
          projectDeadline.task,
          title,
          projectDeadline.dueDate,
          now,
          isOverdue,
          projectDeadline.recipients[0] ?? hodUsers[0].id,
        );
      }
    }

    if (taskAlertCount || projectAlertCount) {
      this.dashboardRealtime?.notifyOverviewRefresh('notification_created');
      this.logger.log(`Deadline alerts sent: tasks=${taskAlertCount}, projects=${projectAlertCount}`);
    }
  }

  private getReminderInterval(now: Date, dueDate: Date): DeadlineInterval | null {
    const remainingMs = dueDate.getTime() - now.getTime();
    if (remainingMs <= 0) return null;
    return (
      REMINDER_INTERVALS.find(
        (interval) => remainingMs <= interval.ms && remainingMs > interval.ms - SCAN_WINDOW_MS,
      ) ?? null
    );
  }

  private getTaskDueDate(task: any): Date | null {
    const candidates = [
      task.dueDate,
      ...(task.retailDetails ?? []).map((detail: any) => detail.deadline),
      ...(task.projectDetails ?? []).map((detail: any) => detail.deadline),
    ]
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));

    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
  }

  private getTaskRecipients(task: any, hodUsers: Array<{ id: string; fullName: string }>): string[] {
    const recipients = new Set<string>();
    if (task.assigneeId) recipients.add(task.assigneeId);
    for (const designerId of task.splitDesignerIds ?? []) {
      if (designerId) recipients.add(designerId);
    }

    const namedHods = this.resolveNamedHods(task, hodUsers);
    const hodRecipients = namedHods.length > 0 ? namedHods : hodUsers;
    for (const hod of hodRecipients) {
      recipients.add(hod.id);
    }

    return [...recipients];
  }

  private resolveNamedHods(task: any, hodUsers: Array<{ id: string; fullName: string }>) {
    const names = [
      task.technicalHead,
      task.teamLead,
      task.subTeamLead,
      task.project?.technicalHead,
      task.project?.teamLead,
      task.project?.subTeamLead,
      ...(task.retailDetails ?? []).map((detail: any) => detail.hodName),
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => this.normalizeName(value));

    if (names.length === 0) return [];
    return hodUsers.filter((user) => names.includes(this.normalizeName(user.fullName)));
  }

  private getProjectDeadlines(tasks: any[], hodUsers: Array<{ id: string; fullName: string }>) {
    const grouped = new Map<
      string,
      {
        project: any;
        task: any;
        dueDate: Date;
        priority: string | null;
        recipients: Set<string>;
      }
    >();

    for (const task of tasks) {
      if (!task.projectId || !task.project) continue;
      const dueDate = this.getTaskDueDate(task);
      if (!dueDate) continue;

      const existing = grouped.get(task.projectId);
      const recipients = existing?.recipients ?? new Set<string>();
      if (task.assigneeId) recipients.add(task.assigneeId);
      for (const designerId of task.splitDesignerIds ?? []) {
        if (designerId) recipients.add(designerId);
      }
      if (task.project.createdById) recipients.add(task.project.createdById);
      const projectHods = this.resolveNamedHods(task, hodUsers);
      for (const hod of projectHods.length > 0 ? projectHods : hodUsers) {
        recipients.add(hod.id);
      }

      if (!existing || dueDate < existing.dueDate) {
        grouped.set(task.projectId, {
          project: task.project,
          task,
          dueDate,
          priority: task.priority ?? null,
          recipients,
        });
      } else {
        existing.recipients = recipients;
      }
    }

    return [...grouped.values()].map((entry) => ({
      ...entry,
      recipients: [...entry.recipients],
    }));
  }

  private async getSplitDesignerIdsByTaskId(taskIds: string[]) {
    const uniqueTaskIds = [...new Set(taskIds.filter(Boolean))];
    if (uniqueTaskIds.length === 0) return new Map<string, string[]>();

    const rows = await this.prisma.$queryRaw<Array<{ taskId: string; designerId: string }>>(Prisma.sql`
      SELECT [taskId] AS [taskId], [designerId] AS [designerId]
      FROM [ErpTSTaskDesigner]
      WHERE [taskId] IN (${Prisma.join(uniqueTaskIds)})
    `);

    const byTaskId = new Map<string, string[]>();
    for (const row of rows) {
      const ids = byTaskId.get(row.taskId) ?? [];
      ids.push(row.designerId);
      byTaskId.set(row.taskId, ids);
    }
    return byTaskId;
  }

  private async notifyRecipients(recipients: string[], title: string, message: string, linkUrl: string) {
    let created = false;
    for (const userId of new Set(recipients.filter(Boolean))) {
      const alreadySent = await this.notificationsService.existsToday(userId, title, linkUrl);
      if (alreadySent) continue;

      await this.notificationsService.create({ userId, title, message, linkUrl });
      this.dashboardRealtime?.notifyUserNotificationRefresh(userId);
      created = true;
    }
    return created;
  }

  private async logActivity(
    task: any,
    title: string,
    dueDate: Date,
    now: Date,
    isOverdue: boolean,
    userId: string,
  ) {
    await this.activityLogger.log({
      action: isOverdue ? ActivityAction.DEADLINE_OVERDUE : ActivityAction.DEADLINE_REMINDER,
      userId,
      taskId: task.id,
      details: {
        event: isOverdue ? ActivityAction.DEADLINE_OVERDUE : ActivityAction.DEADLINE_REMINDER,
        messageKey: isOverdue ? 'deadline_overdue' : 'deadline_reminder',
        taskSnapshot: {
          id: task.id,
          taskNo: task.taskNo,
          title: task.title ?? undefined,
          status: task.status,
        },
        projectSnapshot: {
          id: task.project?.id,
          projectNo: task.project?.projectNo,
          name: task.project?.name,
        },
        context: {
          title,
          dueDate: dueDate.toISOString(),
          remainingTime: this.formatRemainingTime(dueDate, now),
          priority: task.priority ?? null,
        },
      },
    });
  }

  private buildTaskMessage(
    task: any,
    dueDate: Date,
    now: Date,
    interval: DeadlineInterval | null,
    isOverdue: boolean,
  ) {
    const subject = task.title?.trim() || task.taskNo;
    const due = this.formatDateTime(dueDate);
    const remaining = this.formatRemainingTime(dueDate, now);
    const priority = task.priority ? ` Priority: ${task.priority}.` : '';
    const prefix = isOverdue ? 'OVERDUE' : `Due in ${interval?.label ?? remaining}`;
    return `${prefix}: ${subject} — ${task.project?.name ?? 'Unknown Project'} is due ${due}. Remaining time: ${remaining}.${priority}`;
  }

  private buildProjectMessage(
    projectDeadline: { project: any; task: any; dueDate: Date; priority: string | null },
    now: Date,
    interval: DeadlineInterval | null,
    isOverdue: boolean,
  ) {
    const due = this.formatDateTime(projectDeadline.dueDate);
    const remaining = this.formatRemainingTime(projectDeadline.dueDate, now);
    const priority = projectDeadline.priority ? ` Priority: ${projectDeadline.priority}.` : '';
    const prefix = isOverdue ? 'OVERDUE' : `Due in ${interval?.label ?? remaining}`;
    const taskName = projectDeadline.task.title?.trim() || projectDeadline.task.taskNo;
    return `${prefix}: ${projectDeadline.project.name} has an upcoming task deadline (${taskName}) due ${due}. Remaining time: ${remaining}.${priority}`;
  }

  private taskLink(task: any) {
    return taskViewPath(task.id, task.designType);
  }

  private formatDateTime(value: Date) {
    return value.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatRemainingTime(dueDate: Date, now: Date) {
    const diffMs = dueDate.getTime() - now.getTime();
    const absoluteMs = Math.abs(diffMs);
    const totalMinutes = Math.max(1, Math.ceil(absoluteMs / (60 * 1000)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const text = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return diffMs < 0 ? `${text} overdue` : text;
  }

  private normalizeName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }
}
