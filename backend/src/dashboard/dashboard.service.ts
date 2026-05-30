import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityAction } from '../activities/activity-events';
import {
  ProjectsOverviewResponseDto,
  ScheduledTaskItem,
  CompletedTaskItem,
  OnHoldTaskItem,
  ReallocatedTaskItem,
  InboxItem,
  DonutSegment,
} from './projects-overview.dto';

const INBOX_ACTION_LABELS: Record<string, string> = {
  [ActivityAction.TASK_CREATED]: 'Task created',
  [ActivityAction.ASSIGNED_TASK]: 'Task assigned',
  [ActivityAction.STATUS_CHANGED]: 'Status changed',
  [ActivityAction.SCHEDULER_WEEK_SAVED]: 'Scheduler week saved',
  [ActivityAction.SCHEDULER_WEEK_LOCKED]: 'Scheduler week locked',
  [ActivityAction.SCHEDULER_WEEK_UNLOCKED]: 'Scheduler week unlocked',
  [ActivityAction.PROJECT_FILE_UPLOADED]: 'File uploaded',
  [ActivityAction.PROJECT_FILE_DELETED]: 'File deleted',
  [ActivityAction.TASK_FILE_UPLOADED]: 'Task file uploaded',
  [ActivityAction.CREATED_CHATTER_POST]: 'Chatter post created',
  [ActivityAction.CREATED_CHATTER_COMMENT]: 'Comment added',
  [ActivityAction.TASK_WORK_SUBMITTED]: 'Work submitted',
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectsOverview(weekStart?: string): Promise<ProjectsOverviewResponseDto> {
    const ws = this.parseWeekStart(weekStart ?? this.getCurrentMonday());
    const we = new Date(ws);
    we.setUTCDate(we.getUTCDate() + 6);
    we.setUTCHours(23, 59, 59, 999);

    const [
      assignmentRows,
      completedRows,
      onHoldRows,
      reassignRows,
      activityRows,
      statusGroups,
      completedWithDue,
      reallocDistinct,
    ] = await Promise.all([
      // A — scheduled tasks this week
      this.prisma.schedulerAssignment.findMany({
        where: { weekStartDate: ws },
        select: {
          taskId: true,
          task: {
            select: {
              taskNo: true,
              title: true,
              designType: true,
              revisionCode: true,
              dueDate: true,
              assignee: { select: { fullName: true } },
            },
          },
          designer: { select: { fullName: true } },
        },
        orderBy: [{ taskId: 'asc' }, { dayIndex: 'asc' }],
      }),
      // B — completed this week
      this.prisma.task.findMany({
        where: {
          status: { in: ['COMPLETED', 'APPROVED'] },
          completedAt: { gte: ws, lte: we },
        },
        select: { taskNo: true, title: true, designType: true, revisionCode: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),
      // C — on hold (global)
      this.prisma.task.findMany({
        where: { status: 'ON_HOLD' },
        select: { taskNo: true, title: true, designType: true, revisionCode: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      // D — reallocated (ASSIGNED_TASK activity this week)
      this.prisma.activityLog.findMany({
        where: {
          action: ActivityAction.ASSIGNED_TASK,
          createdAt: { gte: ws, lte: we },
        },
        select: {
          id: true,
          createdAt: true,
          details: true,
          task: { select: { taskNo: true, title: true, designType: true, revisionCode: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      // E — inbox (recent activity feed)
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          user: { select: { fullName: true } },
          task: { select: { taskNo: true } },
        },
      }),
      // F1 — status counts
      this.prisma.task.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      // F2 — on-time %
      this.prisma.task.findMany({
        where: {
          status: { in: ['COMPLETED', 'APPROVED'] },
          completedAt: { not: null },
          dueDate: { not: null },
        },
        select: { completedAt: true, dueDate: true },
      }),
      // F3 — reallocated %
      this.prisma.activityLog.findMany({
        where: { action: ActivityAction.ASSIGNED_TASK },
        select: { taskId: true },
        distinct: ['taskId'],
      }),
    ]);

    // --- Build scheduled tasks (deduplicate split rows) ---
    const seenScheduled = new Set<string>();
    const scheduledTasks: ScheduledTaskItem[] = [];
    for (const row of assignmentRows) {
      if (!row.taskId || seenScheduled.has(row.taskId)) continue;
      seenScheduled.add(row.taskId);
      const name = row.task?.assignee?.fullName ?? row.designer?.fullName ?? '';
      scheduledTasks.push({
        taskNo: row.task?.taskNo ?? '',
        title: row.task?.title ?? '',
        designType: row.task?.designType ?? null,
        revisionCode: row.task?.revisionCode ?? null,
        assigneeName: name,
        assigneeInitials: this.getInitials(name),
        dueDate: row.task?.dueDate?.toISOString() ?? null,
      });
    }

    // --- Completed tasks ---
    const completedTasks: CompletedTaskItem[] = completedRows.map((r) => ({
      taskNo: r.taskNo,
      title: r.title ?? '',
      designType: r.designType ?? null,
      revisionCode: r.revisionCode ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    }));

    // --- On hold tasks ---
    const onHoldTasks: OnHoldTaskItem[] = onHoldRows.map((r) => ({
      taskNo: r.taskNo,
      title: r.title ?? '',
      designType: r.designType ?? null,
      revisionCode: r.revisionCode ?? null,
      holdDate: r.updatedAt?.toISOString() ?? null,
      reason: null,
    }));

    // --- Reallocated tasks (deduplicate by taskNo) ---
    const seenRealloc = new Set<string>();
    const reallocatedTasks: ReallocatedTaskItem[] = [];
    for (const row of reassignRows) {
      if (!row.task || seenRealloc.has(row.task.taskNo)) continue;
      seenRealloc.add(row.task.taskNo);
      let newAssigneeName = 'Unknown';
      let fromAssigneeName: string | null = null;
      try {
        const det = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details as any);
        newAssigneeName = det?.changes?.newAssigneeName ?? 'Unknown';
        fromAssigneeName = det?.changes?.oldAssigneeName ?? null;
      } catch { /* ignore malformed JSON */ }
      reallocatedTasks.push({
        taskNo: row.task.taskNo,
        title: row.task.title ?? '',
        designType: row.task.designType ?? null,
        revisionCode: row.task.revisionCode ?? null,
        fromAssigneeName,
        newAssigneeName,
        reassignedAt: row.createdAt.toISOString(),
      });
    }

    // --- Inbox ---
    const inbox: InboxItem[] = activityRows.map((row) => {
      const label = INBOX_ACTION_LABELS[row.action] ?? row.action;
      const actor = row.user?.fullName ?? 'System';
      return {
        id: row.id,
        summary: `${actor} — ${label}`,
        occurredAt: row.createdAt.toISOString(),
        taskNo: row.task?.taskNo ?? null,
      };
    });

    // --- Summary ---
    const counts = statusGroups.reduce((acc, r) => {
      acc[r.status] = r._count.status;
      return acc;
    }, {} as Record<string, number>);

    const active = (counts['PENDING'] ?? 0) + (counts['WIP'] ?? 0) + (counts['REVISION'] ?? 0);
    const onHold = counts['ON_HOLD'] ?? 0;
    const completed = (counts['COMPLETED'] ?? 0) + (counts['APPROVED'] ?? 0);
    const total = active + onHold + completed;
    const safeTotal = total || 1;

    const onTimeCount = completedWithDue.filter(
      (t) => t.completedAt! <= t.dueDate!,
    ).length;
    const onTimePct = completedWithDue.length > 0
      ? Math.round((onTimeCount / completedWithDue.length) * 100)
      : 0;

    const reallocatedPct = Math.round((reallocDistinct.length / safeTotal) * 100);

    const mkSegment = (value: number, color: string): DonutSegment => ({
      value,
      pct: Math.round((value / safeTotal) * 100),
      color,
    });

    return {
      weekStart: ws.toISOString().split('T')[0],
      scheduledTasks,
      completedTasks,
      onHoldTasks,
      reallocatedTasks,
      inbox,
      summary: {
        total,
        active,
        onHold,
        completed,
        onTimePct,
        reallocatedPct,
        donut: {
          active: mkSegment(active, '#4f8ef7'),
          onHold: mkSegment(onHold, '#f5a623'),
          completed: mkSegment(completed, '#7ed321'),
          centerPct: Math.round((completed / safeTotal) * 100),
          centerTotal: total,
        },
      },
    };
  }

  private getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'NA';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private parseWeekStart(weekStart: string): Date {
    const trimmed = weekStart.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('weekStart must be YYYY-MM-DD');
    }
    const d = new Date(`${trimmed}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new BadRequestException('Invalid weekStart date');
    return d;
  }

  private getCurrentMonday(): string {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diff);
    return monday.toISOString().split('T')[0];
  }

  async getMetrics(userId: string, role: string) {
    const isDesigner = role === 'DESIGNER';
    const taskWhere = isDesigner ? { assigneeId: userId } : {};

    const [totalTasks, totalProjects, taskStatusGroup] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.project.count(), // HOD can see all projects or you could filter
      this.prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: { status: true },
      }),
    ]);

    const statuses = taskStatusGroup.reduce((acc, curr) => {
      acc[curr.status] = curr._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTasks,
      totalProjects,
      tasksByStatus: statuses,
      activeTasks: (statuses['PENDING'] || 0) + (statuses['WIP'] || 0) + (statuses['REVISION'] || 0),
      completedTasks: statuses['COMPLETED'] || 0,
      approvedTasks: statuses['APPROVED'] || 0,
    };
  }
}
