import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityAction } from './activity-events';
import { UserRole } from '../common/constants/roles.enum';

const MILESTONE_ACTIONS = new Set([
  ActivityAction.SCHEDULER_WEEK_LOCKED,
  ActivityAction.PROJECT_FILE_UPLOADED,
  ActivityAction.TASK_WORK_SUBMITTED,
  ActivityAction.TASK_COMPLETED,
  ActivityAction.CLIENT_APPROVED,
  ActivityAction.CLIENT_REJECTED_TASK,
]);

function formatStatusLabel(status?: string | null): string | null {
  if (!status) return null;
  return status
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type FindInput = {
  limit?: number;
  cursor?: string;
  taskId?: string;
  projectId?: string;
  userId?: string;
  requestingUserId?: string;
  requestingUserRole?: string;
};

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private formatOvertimeSummary(messageKey: string, _details: any, actorName: string): string {
    if (messageKey === 'overtime_request_submitted') {
      return `${actorName} submitted an overtime request`;
    }
    if (messageKey === 'overtime_request_updated') {
      return `${actorName} updated an overtime request`;
    }
    if (messageKey === 'overtime_request_approved') {
      return `${actorName} approved an overtime request`;
    }
    if (messageKey === 'overtime_request_rejected') {
      return `${actorName} rejected an overtime request`;
    }
    if (messageKey === 'overtime_request_withdrawn') {
      return `${actorName} withdrew an overtime request`;
    }
    return `${actorName} updated an overtime request`;
  }

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
    if (msg === 'task_completed') {
      const taskNo = details?.taskSnapshot?.taskNo ?? '';
      return `${actorName} completed task ${taskNo}`.trim();
    }
    if (msg === 'client_approved') {
      const taskNo = details?.taskSnapshot?.taskNo ?? '';
      return `${actorName} marked ${taskNo} as client approved`.trim();
    }
    if (msg === 'client_rejected_task') {
      const taskNo = details?.taskSnapshot?.taskNo ?? '';
      return `${actorName} marked ${taskNo} as client rejected`.trim();
    }
    if (msg === 'scheduler_week_saved') return `${actorName} saved the schedule for week of ${details?.context?.weekStart ?? ''}`;
    if (msg === 'scheduler_week_locked') return `${actorName} locked the schedule for week of ${details?.context?.weekStart ?? ''}`;
    if (msg === 'scheduler_week_unlocked') return `${actorName} unlocked the schedule for week of ${details?.context?.weekStart ?? ''}`;
    if (msg === 'leave_request_submitted')
      return `${actorName} submitted a ${details?.context?.type ?? 'leave'} request`;
    if (msg === 'leave_request_updated') return `${actorName} updated a pending leave request`;
    if (msg === 'leave_request_cancelled') return `${actorName} cancelled a leave request`;
    if (msg === 'leave_request_revoked') {
      const dn = details?.context?.designerName ?? details?.context?.requesterName;
      return dn
        ? `${actorName} revoked ${dn}'s approved leave request`
        : `${actorName} revoked an approved leave request`;
    }
    if (msg === 'leave_request_status_changed')
      return `${actorName} ${(details?.changes?.newStatus as string)?.toLowerCase() ?? 'updated'} a leave request`;
    if (msg === 'regularization_submitted')
      return `${actorName} submitted a regularization request`;
    if (msg === 'regularization_approved') {
      const dn = details?.context?.designerName;
      return dn ? `${actorName} approved ${dn}'s regularization request` : `${actorName} approved a regularization request`;
    }
    if (msg === 'regularization_rejected') {
      const dn = details?.context?.designerName;
      return dn ? `${actorName} rejected ${dn}'s regularization request` : `${actorName} rejected a regularization request`;
    }
    if (msg === 'regularization_status_changed')
      return `${actorName} ${(details?.changes?.newStatus as string)?.toLowerCase() ?? 'updated'} a regularization request`;
    if (
      msg === 'overtime_request_submitted' ||
      msg === 'overtime_request_updated' ||
      msg === 'overtime_request_approved' ||
      msg === 'overtime_request_rejected' ||
      msg === 'overtime_request_withdrawn' ||
      msg === 'overtime_request_status_changed'
    ) {
      return this.formatOvertimeSummary(msg, details, actorName);
    }
    const readable = action.toLowerCase().replace(/_/g, ' ');
    return `${actorName} ${readable}`;
  }

  private buildSegments(item: ReturnType<typeof this.mapRow>) {
    const t = item.task;
    const txt = (v: string) => ({ type: 'text' as const, value: v });
    const base = [txt(item.summary)];

    if (!t) return base;

    const taskLink = { type: 'link' as const, label: t.taskNo, href: `/design-list/task/${t.id}` };

    switch (item.action) {
      case ActivityAction.TASK_CREATED:
        return [txt(`${item.actor.name} created task `), taskLink];
      case ActivityAction.STATUS_CHANGED:
      case ActivityAction.ASSIGNED_TASK:
      case ActivityAction.TASK_COMPLETED:
      case ActivityAction.CLIENT_APPROVED:
      case ActivityAction.CLIENT_REJECTED_TASK:
        return [...base, txt(' — '), taskLink];
      case ActivityAction.REGULARIZATION_SUBMITTED:
      case ActivityAction.REGULARIZATION_APPROVED:
      case ActivityAction.REGULARIZATION_REJECTED:
      case ActivityAction.OVERTIME_REQUEST_SUBMITTED:
      case ActivityAction.OVERTIME_REQUEST_UPDATED:
      case ActivityAction.OVERTIME_REQUEST_APPROVED:
      case ActivityAction.OVERTIME_REQUEST_REJECTED:
      case ActivityAction.OVERTIME_REQUEST_WITHDRAWN:
      case ActivityAction.OVERTIME_REQUEST_STATUS_CHANGED:
        return [...base, txt(' for task '), taskLink];
      default:
        return base;
    }
  }

  private formatSeverity(action: string): 'info' | 'success' | 'warning' {
    if (action === ActivityAction.TASK_CREATED) return 'success';
    if (action === ActivityAction.TASK_COMPLETED || action === ActivityAction.CLIENT_APPROVED) return 'success';
    if (action === ActivityAction.CLIENT_REJECTED_TASK) return 'warning';
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
    } else if (input.requestingUserRole === UserRole.DESIGNER && input.requestingUserId) {
      where.OR = [
        { task: { assigneeId: input.requestingUserId } },
        { userId: input.requestingUserId },
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
    const taskSnapshot = details?.taskSnapshot ?? {};
    const projectSnapshot = details?.projectSnapshot ?? {};
    const task = row.task
      ? {
          id: row.task.id,
          taskNo: row.task.taskNo,
          opNo: row.task.opNo,
          title: row.task.title,
          status: taskSnapshot.status ?? details?.changes?.newStatus ?? row.task.status ?? null,
          priority: row.task.priority,
          dueDate: row.task.dueDate ? row.task.dueDate.toISOString() : null,
          assigneeName: row.task.assignee?.fullName ?? null,
          hodName: row.task.retailDetails?.[0]?.hodName ?? null,
        }
      : taskSnapshot?.id
        ? {
            id: taskSnapshot.id,
            taskNo: taskSnapshot.taskNo ?? null,
            opNo: taskSnapshot.opNo ?? null,
            title: taskSnapshot.title ?? null,
            status: taskSnapshot.status ?? null,
            priority: null,
            dueDate: null,
            assigneeName: null,
            hodName: null,
          }
        : null;
    const project = row.task?.project
      ? {
          id: row.task.project.id,
          projectNo: row.task.project.projectNo,
          name: row.task.project.name,
        }
      : projectSnapshot?.id || projectSnapshot?.name || projectSnapshot?.projectNo
        ? {
            id: projectSnapshot.id ?? null,
            projectNo: projectSnapshot.projectNo ?? null,
            name: projectSnapshot.name ?? null,
          }
        : null;

    return {
      id: row.id,
      action: row.action,
      occurredAt: row.createdAt.toISOString(),
      actor: {
        id: row.user?.id ?? '',
        name: actorName,
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(actorName)}&background=random`,
      },
      task,
      project,
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
          status: true,
          priority: true,
          dueDate: true,
          assignee: { select: { id: true, fullName: true } },
          retailDetails: { select: { hodName: true } },
          project: { select: { id: true, name: true, projectNo: true } },
        },
      },
    };
  }

  async findAll(input: { limit?: number; userId?: string; requestingUserId?: string; requestingUserRole?: string }) {
    const result = await this.queryActivities({
      limit: input.limit,
      userId: input.userId,
      requestingUserId: input.requestingUserId,
      requestingUserRole: input.requestingUserRole,
    });
    return result.data.map((item) => ({
      id: item.id,
      action: item.action,
      kind: MILESTONE_ACTIONS.has(item.action as any) ? 'project_milestone' : 'task_update',
      user: item.actor,
      messageSegments: this.buildSegments(item),
      occurredAt: item.occurredAt,
      liked: false,
      individualEligible: true,
      monthIndex: new Date(item.occurredAt).getMonth(),
      year: new Date(item.occurredAt).getFullYear(),
      priority: item.task?.priority ? item.task.priority.toLowerCase() : 'normal',
      project: item.project?.name ?? null,
      projectId: item.project?.id ?? null,
      projectNo: item.project?.projectNo ?? null,
      projectName: item.project?.name ?? null,
      taskId: item.task?.id ?? null,
      taskNo: item.task?.taskNo ?? null,
      taskName: item.task?.title ?? item.task?.taskNo ?? null,
      status: item.task?.status ?? item.details?.changes?.newStatus ?? null,
      statusLabel: formatStatusLabel(item.task?.status ?? item.details?.changes?.newStatus ?? null),
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
