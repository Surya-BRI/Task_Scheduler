import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityAction } from '../activities/activity-events';
import { UserRole } from '../common/constants/roles.enum';
import { hasDepartmentManagerAccess } from '../common/utils/workflow-roles.util';
import {
  ProjectsOverviewResponseDto,
  ScheduledTaskItem,
  CompletedTaskItem,
  OnHoldTaskItem,
  ReallocatedTaskItem,
  ReworkTaskItem,
  InboxItem,
  DonutSegment,
} from './projects-overview.dto';
import {
  aggregateStatusCounts,
  COMPLETED_STATUS_FILTER,
} from './task-status-buckets.util';
import {
  calculateLeaveDurationDays,
  formatLeaveDurationLabel,
  normalizeHalfDaySession,
  normalizeLeaveType,
} from '../requests/leave-request.validation';
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
  [ActivityAction.REGULARIZATION_SUBMITTED]: 'Regularization submitted',
  [ActivityAction.REGULARIZATION_APPROVED]: 'Regularization approved',
  [ActivityAction.REGULARIZATION_REJECTED]: 'Regularization rejected',
  LEAVE_REQUEST_SUBMITTED: 'Leave request submitted',
  LEAVE_REQUEST_APPROVED: 'Leave request approved',
  LEAVE_REQUEST_REJECTED: 'Leave request rejected',
  LEAVE_REQUEST_UPDATED: 'Leave request updated',
  LEAVE_REQUEST_CANCELLED: 'Leave request cancelled',
  LEAVE_REQUEST_REVOKED: 'Leave request revoked',
  OVERTIME_REQUEST_SUBMITTED: 'Overtime request submitted',
  OVERTIME_REQUEST_UPDATED: 'Overtime request updated',
  OVERTIME_REQUEST_APPROVED: 'Overtime request approved',
  OVERTIME_REQUEST_REJECTED: 'Overtime request rejected',
  OVERTIME_REQUEST_WITHDRAWN: 'Overtime request withdrawn',
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectsOverview(
    weekStart?: string,
    viewerId?: string,
    viewerRole?: UserRole,
  ): Promise<ProjectsOverviewResponseDto> {
    const ws = this.parseWeekStart(weekStart ?? this.getCurrentMonday());
    const we = new Date(ws);
    we.setUTCDate(we.getUTCDate() + 6);
    we.setUTCHours(23, 59, 59, 999);

    const metricsWhere = viewerId && viewerRole
      ? await this.buildMetricsTaskWhere(viewerId, viewerRole)
      : {};
    const hasMetricsFilter = Object.keys(metricsWhere).length > 0;
    const taskScope = hasMetricsFilter ? { task: metricsWhere } : {};

    const [
      assignmentRows,
      completedRows,
      onHoldRows,
      fragmentHoldRows,
      reworkRows,
      reassignRows,
    ] = await Promise.all([
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
              project: { select: { name: true, projectNo: true } },
              assignee: { select: { fullName: true } },
            },
          },
          designer: { select: { fullName: true } },
        },
        orderBy: [{ taskId: 'asc' }, { dayIndex: 'asc' }],
      }),
      this.prisma.task.findMany({
        where: {
          status: { in: COMPLETED_STATUS_FILTER },
          completedAt: { gte: ws, lte: we },
          ...metricsWhere,
        },
        select: {
          taskNo: true,
          title: true,
          designType: true,
          revisionCode: true,
          completedAt: true,
          project: { select: { name: true, projectNo: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),
      this.prisma.task.findMany({
        where: { status: 'ON_HOLD', ...metricsWhere },
        select: {
          taskNo: true,
          title: true,
          designType: true,
          revisionCode: true,
          updatedAt: true,
          project: { select: { name: true, projectNo: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.schedulerTaskFragment.findMany({
        where: { status: 'ON_HOLD', ...taskScope },
        select: {
          id: true,
          updatedAt: true,
          createdAt: true,
          task: {
            select: {
              taskNo: true,
              title: true,
              designType: true,
              revisionCode: true,
              project: { select: { name: true, projectNo: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.task.findMany({
        where: { status: 'REWORK', ...metricsWhere },
        select: {
          taskNo: true,
          title: true,
          designType: true,
          revisionCode: true,
          updatedAt: true,
          project: { select: { name: true, projectNo: true } },
          assignee: { select: { fullName: true } },
          taskDesigners: {
            select: { designer: { select: { fullName: true } } },
            take: 5,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.activityLog.findMany({
        where: {
          action: ActivityAction.ASSIGNED_TASK,
          createdAt: { gte: ws, lte: we },
          ...taskScope,
        },
        select: {
          id: true,
          createdAt: true,
          details: true,
          task: {
            select: {
              taskNo: true,
              title: true,
              designType: true,
              revisionCode: true,
              project: { select: { name: true, projectNo: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const [
      activityRows,
      statusGroups,
      completedWithDue,
    ] = await Promise.all([
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          taskId: true,
          user: { select: { fullName: true } },
          task: { select: { taskNo: true, id: true } },
        },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: metricsWhere,
        _count: { status: true },
      }),
      this.prisma.task.findMany({
        where: {
          status: { in: COMPLETED_STATUS_FILTER },
          completedAt: { not: null },
          dueDate: { not: null },
          ...metricsWhere,
        },
        select: { completedAt: true, dueDate: true },
      }),
    ]);

    const seenScheduled = new Set<string>();
    const scheduledTasks: ScheduledTaskItem[] = [];
    for (const row of assignmentRows) {
      if (!row.taskId || seenScheduled.has(row.taskId)) continue;
      seenScheduled.add(row.taskId);
      const name = row.task?.assignee?.fullName ?? row.designer?.fullName ?? '';
      scheduledTasks.push({
        taskNo: row.task?.taskNo ?? '',
        title: row.task?.title ?? '',
        projectName: this.resolveProjectName(row.task?.project, row.task?.title),
        designType: row.task?.designType ?? null,
        revisionCode: row.task?.revisionCode ?? null,
        assigneeName: name,
        assigneeInitials: this.getInitials(name),
        dueDate: row.task?.dueDate?.toISOString() ?? null,
      });
    }

    const completedTasks: CompletedTaskItem[] = completedRows.map((r) => ({
      taskNo: r.taskNo,
      title: r.title ?? '',
      projectName: this.resolveProjectName(r.project, r.title),
      designType: r.designType ?? null,
      revisionCode: r.revisionCode ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    }));

    const onHoldTasks: OnHoldTaskItem[] = [];
    const seenWholeHold = new Set<string>();
    for (const r of onHoldRows) {
      if (!r.taskNo || seenWholeHold.has(r.taskNo)) continue;
      seenWholeHold.add(r.taskNo);
      onHoldTasks.push({
        taskNo: r.taskNo,
        title: r.title ?? '',
        projectName: this.resolveProjectName(r.project, r.title),
        designType: r.designType ?? null,
        revisionCode: r.revisionCode ?? null,
        holdDate: r.updatedAt?.toISOString() ?? null,
        reason: 'On hold',
        rowKey: `task-${r.taskNo}`,
      });
    }
    const seenFragmentHold = new Set<string>();
    for (const frag of fragmentHoldRows as Array<{
      id: string;
      updatedAt?: Date | null;
      createdAt?: Date | null;
      task?: {
        taskNo?: string | null;
        title?: string | null;
        designType?: string | null;
        revisionCode?: string | null;
        project?: { name?: string | null; projectNo?: string | null } | null;
      } | null;
    }>) {
      const taskNo = frag.task?.taskNo ?? '';
      if (!taskNo) continue;
      // Skip fragment row when the whole task is already listed as ON_HOLD
      if (seenWholeHold.has(taskNo)) continue;
      const fragKey = `${taskNo}-frag`;
      if (seenFragmentHold.has(fragKey)) continue;
      seenFragmentHold.add(fragKey);
      onHoldTasks.push({
        taskNo,
        title: frag.task?.title ?? '',
        projectName: this.resolveProjectName(frag.task?.project, frag.task?.title),
        designType: frag.task?.designType ?? null,
        revisionCode: frag.task?.revisionCode ?? null,
        holdDate: (frag.updatedAt ?? frag.createdAt)?.toISOString() ?? null,
        reason: 'Part on hold',
        rowKey: `frag-${frag.id}`,
      });
    }

    const reworkTasks: ReworkTaskItem[] = reworkRows.map((r) => {
      const splitNames = (r.taskDesigners ?? [])
        .map((d) => d.designer?.fullName)
        .filter(Boolean) as string[];
      const assigneeName =
        r.assignee?.fullName
        ?? (splitNames.length > 0 ? splitNames.join(', ') : null);
      return {
        taskNo: r.taskNo,
        title: r.title ?? '',
        projectName: this.resolveProjectName(r.project, r.title),
        designType: r.designType ?? null,
        revisionCode: r.revisionCode ?? null,
        updatedAt: r.updatedAt?.toISOString() ?? null,
        assigneeName,
      };
    });

    const seenRealloc = new Set<string>();
    const reallocatedTasks: ReallocatedTaskItem[] = [];
    for (const row of reassignRows) {
      if (!row.task || seenRealloc.has(row.task.taskNo)) continue;
      const changes = this.parseAssignChanges(row.details);
      const oldAssigneeId = changes.oldAssigneeId;
      const oldNameRaw = changes.oldAssigneeName;
      const hasPriorAssignee =
        Boolean(oldAssigneeId)
        || (typeof oldNameRaw === 'string' && oldNameRaw.trim().length > 0);
      if (!hasPriorAssignee) continue;

      const fromAssigneeName =
        (typeof oldNameRaw === 'string' && oldNameRaw.trim())
          ? oldNameRaw.trim()
          : 'Unknown';
      const newAssigneeName =
        (typeof changes.newAssigneeName === 'string' && changes.newAssigneeName.trim())
          ? changes.newAssigneeName.trim()
          : 'Unknown';

      seenRealloc.add(row.task.taskNo);
      reallocatedTasks.push({
        taskNo: row.task.taskNo,
        title: row.task.title ?? '',
        projectName: this.resolveProjectName(row.task.project, row.task.title),
        designType: row.task.designType ?? null,
        revisionCode: row.task.revisionCode ?? null,
        fromAssigneeName,
        newAssigneeName,
        reassignedAt: row.createdAt.toISOString(),
      });
    }

    const approvalInbox = await this.buildApprovalInbox(viewerId, viewerRole);
    const activityInbox: InboxItem[] = activityRows.map((row) => {
      const label = INBOX_ACTION_LABELS[row.action] ?? row.action;
      const actor = row.user?.fullName ?? 'System';
      const itemKey = `activity-${row.id}`;
      return {
        id: row.id,
        summary: `${actor} — ${label}`,
        occurredAt: row.createdAt.toISOString(),
        taskNo: row.task?.taskNo ?? null,
        requestType: 'activity',
        requiresAction: false,
        linkUrl: this.buildActivityLinkUrl(row.action, row.taskId, row.task?.id),
        itemKey,
      };
    });

    const seenInbox = new Set<string>();
    const inbox: InboxItem[] = [];
    for (const item of [...approvalInbox, ...activityInbox]) {
      const key = item.itemKey ?? `${item.requestType ?? 'activity'}-${item.id}`;
      if (seenInbox.has(key)) continue;
      seenInbox.add(key);
      inbox.push({ ...item, itemKey: key });
    }
    inbox.sort((a, b) => {
      if (a.requiresAction !== b.requiresAction) {
        return a.requiresAction ? -1 : 1;
      }
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    });
    const trimmedInbox = inbox.slice(0, 50);

    const counts = statusGroups.reduce((acc, r) => {
      acc[r.status] = r._count.status;
      return acc;
    }, {} as Record<string, number>);

    const buckets = aggregateStatusCounts(counts);
    const { active, completed, total } = buckets;
    const onHoldUnique = new Set(onHoldTasks.map((t) => t.taskNo)).size;
    const reworkCount = reworkTasks.length;
    const safeTotal = total || 1;

    const onTimeCount = completedWithDue.filter(
      (t) => t.completedAt! <= t.dueDate!,
    ).length;
    const onTimePct = completedWithDue.length > 0
      ? Math.round((onTimeCount / completedWithDue.length) * 100)
      : 0;

    const reallocatedPct = Math.round((reallocatedTasks.length / safeTotal) * 100);

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
      reworkTasks,
      inbox: trimmedInbox,
      summary: {
        total,
        active,
        onHold: onHoldUnique,
        completed,
        reworkCount,
        onTimePct,
        reallocatedPct,
        donut: {
          active: mkSegment(active, '#4f8ef7'),
          onHold: mkSegment(onHoldUnique, '#f5a623'),
          completed: mkSegment(completed, '#7ed321'),
          centerPct: Math.round((completed / safeTotal) * 100),
          centerTotal: total,
        },
      },
    };
  }

  async getMetrics(userId: string, role: UserRole) {
    const taskWhere = await this.buildMetricsTaskWhere(userId, role);

    const [totalTasks, totalProjects, taskStatusGroup] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      role === UserRole.DESIGNER
        ? this.prisma.task.findMany({ where: taskWhere, select: { projectId: true }, distinct: ['projectId'] }).then((r) => r.length)
        : this.prisma.project.count(),
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

    const buckets = aggregateStatusCounts(statuses);

    return {
      totalTasks,
      totalProjects,
      tasksByStatus: statuses,
      activeTasks: buckets.active,
      onHoldTasks: buckets.onHold,
      completedTasks: buckets.completed,
      approvedTasks: (statuses['CLIENT_ACCEPTED'] ?? 0) + (statuses['APPROVED'] ?? 0),
      bucketTotals: buckets,
    };
  }

  private async buildMetricsTaskWhere(userId: string, role: UserRole) {
    if (role === UserRole.DESIGNER) {
      const junctionIds = await this.prisma.taskDesigner.findMany({
        where: { designerId: userId },
        select: { taskId: true },
      });
      const splitIds = junctionIds.map((r) => r.taskId);
      return {
        OR: [
          { assigneeId: userId },
          ...(splitIds.length > 0 ? [{ id: { in: splitIds } }] : []),
        ],
      };
    }
    if (hasDepartmentManagerAccess(role)) {
      const viewer = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (viewer?.departmentId) {
        const departmentId = viewer.departmentId;
        return {
          OR: [
            { assignee: { departmentId } },
            { taskDesigners: { some: { designer: { departmentId } } } },
            { AND: [{ assigneeId: null }, { taskDesigners: { none: {} } }] },
          ],
        };
      }
      return {};
    }
    return { assigneeId: userId };
  }

  private parseAssignChanges(details: unknown): {
    oldAssigneeId?: string | null;
    oldAssigneeName?: string | null;
    newAssigneeName?: string | null;
  } {
    try {
      const det = typeof details === 'string'
        ? JSON.parse(details)
        : (details as Record<string, unknown> | null);
      const changes = (det?.changes ?? {}) as Record<string, unknown>;
      return {
        oldAssigneeId: (changes.oldAssigneeId as string | null | undefined) ?? null,
        oldAssigneeName: (changes.oldAssigneeName as string | null | undefined) ?? null,
        newAssigneeName: (changes.newAssigneeName as string | null | undefined) ?? null,
      };
    } catch {
      return {};
    }
  }

  private async buildApprovalInbox(
    viewerId?: string,
    viewerRole?: UserRole,
  ): Promise<InboxItem[]> {
    if (!viewerId || !hasDepartmentManagerAccess(viewerRole ?? '')) {
      return [];
    }

    const deptFilter: Record<string, unknown> = {};
    let hodDepartmentId: string | null = null;
    if (hasDepartmentManagerAccess(viewerRole ?? '')) {
      const viewer = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { departmentId: true },
      });
      hodDepartmentId = viewer?.departmentId ?? null;
      if (hodDepartmentId) {
        deptFilter.designer = { departmentId: hodDepartmentId };
      }
    }

    const [regRows, otRows, leaveRows] = await Promise.all([
      this.prisma.regularizationRequest.findMany({
        where: { status: 'Pending', ...deptFilter },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          designer: { select: { id: true, fullName: true } },
          task: { select: { taskNo: true, title: true } },
        },
      }),
      this.prisma.overtimeRequest.findMany({
        where: { status: 'SUBMITTED', ...deptFilter },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          designer: { select: { id: true, fullName: true } },
          task: { select: { taskNo: true, title: true, project: { select: { name: true } } } },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          status: { in: ['Pending', 'PENDING', 'pending'] },
          user: {
            role: { name: 'DESIGNER' },
            ...(hodDepartmentId ? { departmentId: hodDepartmentId } : {}),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          user: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    const regItems: InboxItem[] = regRows.map((row) => {
      const requester = row.designer?.fullName?.trim() || 'Designer';
      const taskLabel = row.task?.title?.trim() || row.task?.taskNo?.trim() || 'task';
      const requestDate = row.date?.toISOString().split('T')[0] ?? null;
      const itemKey = `regularization-${row.id}`;
      return {
        id: row.id,
        summary: `${requester} — Regularization for ${taskLabel}`,
        occurredAt: (row.createdAt ?? row.date ?? new Date()).toISOString(),
        taskNo: row.task?.taskNo ?? null,
        requestType: 'regularization',
        linkUrl: `/designer/requests?regularizationId=${encodeURIComponent(row.id)}#regularization`,
        requiresAction: true,
        requesterName: requester,
        status: 'Pending',
        itemKey,
        details: [
          { label: 'Requester', value: requester },
          { label: 'Date', value: requestDate },
          { label: 'Duration', value: row.duration ?? null },
          { label: 'Reason', value: row.reason ?? null },
          { label: 'Notes', value: row.notes ?? null },
        ],
      };
    });

    const otItems: InboxItem[] = otRows.map((row) => {
      const requester = row.designer?.fullName?.trim() || 'Designer';
      const taskLabel = row.task?.title?.trim() || row.task?.taskNo?.trim() || 'task';
      const projectName = row.task?.project?.name?.trim();
      const requestDate = row.date?.toISOString().split('T')[0] ?? null;
      const requestedHours = row.totalHours ?? row.requestedHours;
      const itemKey = `overtime-${row.id}`;
      return {
        id: row.id,
        summary: `${requester} — Overtime${projectName ? ` (${projectName})` : ''} · ${taskLabel}`,
        occurredAt: (row.createdAt ?? row.date ?? new Date()).toISOString(),
        taskNo: row.task?.taskNo ?? null,
        requestType: 'overtime',
        linkUrl: `/designer/requests?overtimeId=${encodeURIComponent(row.id)}#overtime`,
        requiresAction: true,
        requesterName: requester,
        status: 'Pending Approval',
        itemKey,
        details: [
          { label: 'Requester', value: requester },
          { label: 'Date', value: requestDate },
          { label: 'Project', value: projectName ?? null },
          { label: 'Task', value: taskLabel },
          { label: 'Requested hours', value: requestedHours ? `${requestedHours.toString()} hours` : null },
          { label: 'Estimated remaining', value: row.estimatedRemaining ?? null },
          { label: 'Reason', value: row.reason ?? null },
        ],
      };
    });

    const leaveItems: InboxItem[] = leaveRows.map((row) => {
      const requester = row.user?.fullName?.trim() || 'Designer';
      const designerId = row.user?.id ?? row.userId;
      const from = row.startDate.toISOString().split('T')[0];
      const to = (row.endDate ?? row.startDate).toISOString().split('T')[0];
      const leaveType = normalizeLeaveType(row.type) ?? 'Full Day';
      const halfDaySession = normalizeHalfDaySession(row.halfDaySession);
      const leaveDuration = formatLeaveDurationLabel(
        calculateLeaveDurationDays(leaveType, {
          startDate: row.startDate,
          endDate: row.endDate ?? row.startDate,
        }),
      );
      const itemKey = `leave-${row.id}`;
      const sessionLabel = leaveType === 'Half Day' && halfDaySession ? ` (${halfDaySession})` : '';
      return {
        id: row.id,
        summary: `${requester} — ${leaveType}${sessionLabel} leave ${from} to ${to} (${leaveDuration})`,
        occurredAt: row.createdAt.toISOString(),
        taskNo: null,
        requestType: 'leave',
        linkUrl: `/designer/leave-planner?leaveId=${encodeURIComponent(row.id)}&forUserId=${encodeURIComponent(designerId)}`,
        requiresAction: true,
        requesterName: requester,
        status: 'Pending',
        itemKey,
        details: [
          { label: 'Requester', value: requester },
          { label: 'From', value: from },
          { label: 'To', value: to },
          { label: 'Type', value: leaveType },
          { label: 'Session', value: halfDaySession },
          { label: 'Duration', value: leaveDuration },
          { label: 'Reason', value: row.reason ?? null },
        ],
      };
    });

    return [...regItems, ...otItems, ...leaveItems];
  }

  private buildActivityLinkUrl(
    action: string,
    taskId: string | null,
    taskRowId?: string | null,
  ): string | null {
    if (action === ActivityAction.CREATED_CHATTER_POST || action === ActivityAction.CREATED_CHATTER_COMMENT) {
      return '/chatter';
    }
    const id = taskRowId ?? taskId;
    if (id) {
      return `/design-list/tasks?taskId=${encodeURIComponent(id)}`;
    }
    return null;
  }

  private resolveProjectName(
    project?: { name?: string | null; projectNo?: string | null } | null,
    taskTitle?: string | null,
  ): string {
    const name = project?.name?.trim();
    if (name) return name;
    const projectNo = project?.projectNo?.trim();
    if (projectNo) return projectNo;
    const title = taskTitle?.trim();
    if (title) return title;
    return '—';
  }

  private getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'NA';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  parseWeekStart(weekStart: string): Date {
    const trimmed = weekStart.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('weekStart must be YYYY-MM-DD');
    }
    const d = new Date(`${trimmed}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new BadRequestException('Invalid weekStart date');
    return d;
  }

  getCurrentMonday(): string {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diff);
    return monday.toISOString().split('T')[0];
  }
}
