import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityAction } from './activity-events';

const MILESTONE_ACTIONS = new Set([
  ActivityAction.SCHEDULER_WEEK_LOCKED,
  ActivityAction.PROJECT_FILE_UPLOADED,
  ActivityAction.TASK_WORK_SUBMITTED,
]);

type FindInput = {
  limit?: number;
  cursor?: string;
  taskId?: string;
  projectId?: string;
  userId?: string;
};

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private formatSummary(action: string, details: any, actorName: string): string {
    const msg = details?.messageKey;
    if (msg === 'task_created') return `${actorName} created task ${details?.taskSnapshot?.taskNo ?? ''}`.trim();
    if (msg === 'task_assigned') return `${actorName} assigned task to ${details?.changes?.newAssigneeName ?? 'assignee'}`;
    if (msg === 'status_changed') {
      const oldStatus = details?.changes?.oldStatus ?? '-';
      const newStatus = details?.changes?.newStatus ?? '-';
      return `${actorName} changed status ${oldStatus} → ${newStatus}`;
    }
    if (msg === 'project_file_uploaded') return `${actorName} uploaded ${details?.fileMeta?.fileName ?? 'a file'}`;
    if (msg === 'project_file_deleted') return `${actorName} deleted ${details?.fileMeta?.fileName ?? 'a file'}`;
    if (msg === 'task_file_uploaded') return `${actorName} uploaded ${details?.fileMeta?.fileName ?? 'a file'} to task files`;
    if (msg === 'chatter_post_created') {
      const title = details?.changes?.title?.trim();
      return title ? `${actorName} posted in chatter: ${title}` : `${actorName} posted in chatter`;
    }
    if (msg === 'chatter_comment_created') return `${actorName} commented on chatter`;
    if (msg === 'task_work_submitted') {
      const mins = Math.round((details?.changes?.durationSeconds ?? 0) / 60);
      const taskNo = details?.taskSnapshot?.taskNo ?? '';
      return `${actorName} submitted work on task ${taskNo} (${mins} min)`.replace(/\s+/g, ' ').trim();
    }
    if (msg === 'scheduler_week_saved') return `${actorName} saved the schedule for week of ${details?.context?.weekStart ?? ''}`;
    if (msg === 'scheduler_week_locked') return `${actorName} locked the schedule for week of ${details?.context?.weekStart ?? ''}`;
    if (msg === 'scheduler_week_unlocked') return `${actorName} unlocked the schedule for week of ${details?.context?.weekStart ?? ''}`;
    if (msg === 'leave_request_submitted')
      return `${actorName} submitted a ${details?.context?.type ?? 'leave'} request`;
    if (msg === 'leave_request_updated') return `${actorName} updated a pending leave request`;
    if (msg === 'leave_request_cancelled') return `${actorName} cancelled a leave request`;
    if (msg === 'leave_request_status_changed')
      return `${actorName} ${(details?.changes?.newStatus as string)?.toLowerCase() ?? 'updated'} a leave request`;
    if (msg === 'regularization_submitted')
      return `${actorName} submitted a regularization request`;
    if (msg === 'regularization_approved') return `${actorName} approved a regularization request`;
    if (msg === 'regularization_rejected') return `${actorName} rejected a regularization request`;
    if (msg === 'regularization_status_changed')
      return `${actorName} ${(details?.changes?.newStatus as string)?.toLowerCase() ?? 'updated'} a regularization request`;
    if (msg === 'overtime_request_submitted')
      return `${actorName} submitted an overtime request`;
    if (msg === 'overtime_request_status_changed')
      return `${actorName} ${(details?.changes?.newStatus as string)?.toLowerCase().replace(/_/g, ' ') ?? 'updated'} an overtime request`;
    const readable = action.toLowerCase().replace(/_/g, ' ');
    return `${actorName} ${readable}`;
  }

  private formatSeverity(action: string): 'info' | 'success' | 'warning' {
    if (action === ActivityAction.TASK_CREATED) return 'success';
    if (action === ActivityAction.STATUS_CHANGED || action === ActivityAction.ASSIGNED_TASK) return 'info';
    if (action === ActivityAction.PROJECT_FILE_DELETED) return 'warning';
    return 'info';
  }

  private async queryActivities(input: FindInput) {
    const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
    const cursorDate = input.cursor ? new Date(input.cursor) : null;
    const where: Record<string, unknown> = {};
    if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
      where.createdAt = { lt: cursorDate };
    }
    if (input.userId) {
      where.userId = input.userId;
    }
    if (input.taskId) {
      where.taskId = input.taskId;
    } else if (input.projectId) {
      where.OR = [
        { task: { projectId: input.projectId } },
        { details: { contains: input.projectId } },
      ];
    }

    const rows = await this.prisma.activityLog.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: this.getTaskInclude(),
    });

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const data = sliced.map((row: any) => this.mapRow(row));

    return {
      data,
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? sliced[sliced.length - 1]?.createdAt?.toISOString() ?? null : null,
      },
    };
  }

  private mapRow(row: any) {
    let details: any = {};
    try {
      details = row.details ? JSON.parse(row.details) : {};
    } catch {
      details = { raw: row.details };
    }
    const actorName = row.user?.fullName ?? 'Unknown user';
    return {
      id: row.id,
      action: row.action,
      occurredAt: row.createdAt.toISOString(),
      actor: {
        id: row.user?.id ?? '',
        name: actorName,
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(actorName)}&background=random`,
      },
      task: row.task
        ? {
            id: row.task.id,
            taskNo: row.task.taskNo,
            opNo: row.task.opNo,
            title: row.task.title,
            priority: row.task.priority,
            dueDate: row.task.dueDate ? row.task.dueDate.toISOString() : null,
            assigneeName: row.task.assignee?.fullName ?? null,
            hodName: row.task.retailDetails?.[0]?.hodName ?? null,
          }
        : null,
      project: row.task?.project
        ? {
            id: row.task.project.id,
            projectNo: row.task.project.projectNo,
            name: row.task.project.name,
          }
        : null,
      details,
      summary: this.formatSummary(row.action, details, actorName),
      severity: this.formatSeverity(row.action),
    };
  }

  private getTaskInclude() {
    return {
      user: { select: { id: true, fullName: true } },
      task: {
        select: {
          id: true,
          taskNo: true,
          opNo: true,
          title: true,
          priority: true,
          dueDate: true,
          assignee: { select: { id: true, fullName: true } },
          retailDetails: { select: { hodName: true } },
          project: { select: { id: true, name: true, projectNo: true } },
        },
      },
    };
  }

  async findAll(input: { limit?: number; userId?: string }) {
    const result = await this.queryActivities({ limit: input.limit, userId: input.userId });
    return result.data.map((item) => ({
      id: item.id,
      action: item.action,
      kind: MILESTONE_ACTIONS.has(item.action as any) ? 'project_milestone' : 'task_update',
      user: item.actor,
      messageSegments: [{ type: 'text', value: item.summary }],
      occurredAt: item.occurredAt,
      liked: false,
      individualEligible: true,
      monthIndex: new Date(item.occurredAt).getMonth(),
      year: new Date(item.occurredAt).getFullYear(),
      priority: item.task?.priority ? item.task.priority.toLowerCase() : 'normal',
      project: item.project?.name ?? null,
      team: null,
    }));
  }

  async findByTask(input: { taskId: string; limit?: number; cursor?: string }) {
    return this.queryActivities({ taskId: input.taskId, limit: input.limit, cursor: input.cursor });
  }

  async findByProject(input: { projectId: string; limit?: number; cursor?: string }) {
    return this.queryActivities({
      projectId: input.projectId,
      limit: input.limit,
      cursor: input.cursor,
    });
  }
}
