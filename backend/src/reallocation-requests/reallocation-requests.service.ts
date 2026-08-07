import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { UserRole } from '../common/constants/roles.enum';
import { hasDepartmentManagerAccess } from '../common/utils/workflow-roles.util';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import { SchedulerAssignmentsService } from '../scheduler-assignments/scheduler-assignments.service';
import { taskViewPath } from '../common/utils/design-type.util';
import {
  CreateReallocationRequestDto,
  ReviewReallocationRequestDto,
} from './dto/reallocation-request.dto';
import { isUuidString } from './sql-uuid.util';
import {
  collectProjectTeamNames,
  normalizePersonName,
} from '../common/utils/project-team-names.util';

const ALLOWED_TASK_STATUSES = new Set(['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK']);

const INCLUDE = {
  task: {
    select: {
      id: true,
      title: true,
      taskNo: true,
      opNo: true,
      status: true,
      designType: true,
      projectId: true,
      project: { select: { id: true, name: true, projectNo: true } },
    },
  },
  requester: {
    select: {
      id: true,
      fullName: true,
      department: { select: { name: true } },
    },
  },
  suggestedDesigner: { select: { id: true, fullName: true } },
  targetDesigner: { select: { id: true, fullName: true } },
  approver: { select: { id: true, fullName: true } },
} satisfies Prisma.ReallocationRequestInclude;

type ReallocationFull = Prisma.ReallocationRequestGetPayload<{ include: typeof INCLUDE }>;

export type ReallocationRequestView = {
  id: string;
  taskId: string;
  taskName: string;
  taskNo: string;
  taskStatus: string;
  projectName: string;
  requesterId: string;
  requesterName: string;
  suggestedDesignerId: string;
  suggestedDesignerName: string;
  targetDesignerId: string | null;
  targetDesignerName: string | null;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  remainingHours: number | null;
  approverId: string | null;
  approverName: string | null;
  approverRemarks: string | null;
  reviewedAt: string | null;
  createdAt: string;
  linkUrl: string;
};

@Injectable()
export class ReallocationRequestsService {
  private readonly logger = new Logger(ReallocationRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly schedulerAssignments: SchedulerAssignmentsService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  private toView(row: ReallocationFull, remainingHours: number | null = null): ReallocationRequestView {
    const taskLabel =
      [row.task.opNo, row.task.title, row.task.taskNo].filter(Boolean).join(' — ') || row.task.taskNo;
    return {
      id: row.id,
      taskId: row.taskId,
      taskName: taskLabel,
      taskNo: row.task.taskNo,
      taskStatus: row.task.status,
      projectName: row.task.project?.name ?? '',
      requesterId: row.requesterId,
      requesterName: row.requester.fullName,
      suggestedDesignerId: row.suggestedDesignerId,
      suggestedDesignerName: row.suggestedDesigner.fullName,
      targetDesignerId: row.targetDesignerId,
      targetDesignerName: row.targetDesigner?.fullName ?? null,
      reason: row.reason,
      status: row.status as ReallocationRequestView['status'],
      remainingHours,
      approverId: row.approverId,
      approverName: row.approver?.fullName ?? null,
      approverRemarks: row.approverRemarks,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      linkUrl: `/hod/requests?tab=reallocation&reallocationId=${row.id}`,
    };
  }

  private async remainingHoursFor(taskId: string, designerId: string): Promise<number> {
    const rows = await this.prisma.schedulerAssignment.findMany({
      where: { taskId, designerId, isLocked: { not: true } },
      select: { assignedHours: true },
    });
    return Math.round(
      rows.reduce((sum, r) => sum + Number(r.assignedHours ?? 0), 0) * 100,
    ) / 100;
  }

  /** One grouped SUM for all Pending rows — avoids N+1 findMany in list endpoints. */
  private async mapWithRemaining(rows: ReallocationFull[]): Promise<ReallocationRequestView[]> {
    const pending = rows.filter((row) => row.status === 'Pending');
    const remainingByKey = new Map<string, number>();

    if (pending.length > 0) {
      const taskIds = Array.from(new Set(pending.map((row) => row.taskId)));
      const designerIds = Array.from(new Set(pending.map((row) => row.requesterId)));
      const grouped = await this.prisma.schedulerAssignment.groupBy({
        by: ['taskId', 'designerId'],
        where: {
          taskId: { in: taskIds },
          designerId: { in: designerIds },
          isLocked: { not: true },
        },
        _sum: { assignedHours: true },
      });
      for (const group of grouped) {
        if (!group.taskId || !group.designerId) continue;
        const hours =
          Math.round(Number(group._sum.assignedHours ?? 0) * 100) / 100;
        remainingByKey.set(`${group.taskId}:${group.designerId}`, hours);
      }
    }

    return rows.map((row) => {
      const remaining =
        row.status === 'Pending'
          ? (remainingByKey.get(`${row.taskId}:${row.requesterId}`) ?? 0)
          : null;
      return this.toView(row, remaining);
    });
  }

  private assertManager(role: UserRole) {
    if (!hasDepartmentManagerAccess(role)) {
      throw new ForbiddenException('Only HOD can review reallocation requests.');
    }
  }

  private ownsTask(
    task: { assigneeId: string | null; taskDesigners: { designerId: string }[] },
    userId: string,
  ) {
    if (task.assigneeId === userId) return true;
    return task.taskDesigners.some((d) => d.designerId === userId);
  }

  async listTaskOptions(designerId: string) {
    if (!isUuidString(designerId)) return [];
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { in: [...ALLOWED_TASK_STATUSES] },
        OR: [
          { assigneeId: designerId },
          { taskDesigners: { some: { designerId } } },
        ],
        schedulerAssignments: {
          some: { designerId, isLocked: { not: true } },
        },
      },
      select: {
        id: true,
        title: true,
        taskNo: true,
        opNo: true,
        status: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return tasks.map((t) => {
      const op = String(t.opNo ?? '').trim();
      let title = String(t.title ?? '').trim();
      // Titles often already start with "OP-12345 - …" — drop the duplicate prefix.
      if (op && title) {
        const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        title = title
          .replace(new RegExp(`^${escaped}\\s*[—\\-–:]\\s*`, 'i'), '')
          .trim();
      }
      // Prefer human label; omit internal TSK taskNo from the dropdown.
      const name =
        [op, title].filter(Boolean).join(' — ') ||
        String(t.taskNo ?? '').trim() ||
        'Task';
      return {
        id: t.id,
        name,
        opNo: op || null,
        title: title || null,
        status: t.status,
      };
    });
  }

  async listEligibleDesigners(taskId: string, requesterId: string) {
    if (!isUuidString(taskId)) throw new BadRequestException('Invalid task id');
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        project: {
          select: {
            technicalHead: true,
            teamLead: true,
            subTeamLead: true,
            designers: true,
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    const team = collectProjectTeamNames(task.project);
    const roleFilter = {
      role: { name: { in: [UserRole.DESIGNER, UserRole.HOD] } },
      id: { not: requesterId },
    };

    // Empty team → keep prior fallback (full Designer/HOD directory except requester).
    if (team.normalized.size === 0) {
      return this.prisma.user.findMany({
        where: roleFilter,
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });
    }

    const designers = await this.prisma.user.findMany({
      where: {
        ...roleFilter,
        OR: [...team.displayNames].map((fullName) => ({ fullName })),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });

    // Preserve trim+lower eligibility semantics regardless of DB collation.
    return designers.filter((d) => team.normalized.has(normalizePersonName(d.fullName)));
  }

  async findByRequester(requesterId: string) {
    const rows = await this.prisma.reallocationRequest.findMany({
      where: { requesterId },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return this.mapWithRemaining(rows);
  }

  async findPendingApprovals() {
    const rows = await this.prisma.reallocationRequest.findMany({
      where: { status: 'Pending' },
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return this.mapWithRemaining(rows);
  }

  async findTeamRequests(filters?: { status?: string; designerId?: string }) {
    const where: Prisma.ReallocationRequestWhereInput = {};
    if (filters?.status?.trim()) where.status = filters.status.trim();
    if (filters?.designerId?.trim()) where.requesterId = filters.designerId.trim();
    const rows = await this.prisma.reallocationRequest.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return this.mapWithRemaining(rows);
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const row = await this.prisma.reallocationRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Reallocation request not found');
    if (!hasDepartmentManagerAccess(role) && row.requesterId !== userId) {
      throw new ForbiddenException('You can only view your own reallocation requests.');
    }
    const remaining =
      row.status === 'Pending' ? await this.remainingHoursFor(row.taskId, row.requesterId) : null;
    return this.toView(row, remaining);
  }

  async create(userId: string, role: UserRole, dto: CreateReallocationRequestDto) {
    if (role !== UserRole.DESIGNER && !hasDepartmentManagerAccess(role)) {
      throw new ForbiddenException('Only designers can request reallocation.');
    }
    if (dto.suggestedDesignerId === userId) {
      throw new BadRequestException('Suggested designer must be someone else.');
    }

    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      select: {
        id: true,
        status: true,
        assigneeId: true,
        taskNo: true,
        title: true,
        designType: true,
        taskDesigners: { select: { designerId: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (!ALLOWED_TASK_STATUSES.has(String(task.status ?? '').toUpperCase())) {
      throw new BadRequestException(
        'Reallocation is only allowed for DESIGN_PLANNED, IN_PROGRESS, or REWORK tasks.',
      );
    }
    if (!this.ownsTask(task, userId)) {
      throw new ForbiddenException('You can only request reallocation for tasks assigned to you.');
    }

    const remaining = await this.remainingHoursFor(dto.taskId, userId);
    if (remaining < 0.01) {
      throw new BadRequestException('No remaining scheduled hours to reallocate.');
    }

    await this.schedulerAssignments.assertDesignerOnProjectTeam(dto.taskId, dto.suggestedDesignerId);

    const existingPending = await this.prisma.reallocationRequest.findFirst({
      where: { taskId: dto.taskId, requesterId: userId, status: 'Pending' },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException('You already have a pending reallocation request for this task.');
    }

    let created;
    try {
      created = await this.prisma.reallocationRequest.create({
        data: {
          taskId: dto.taskId,
          requesterId: userId,
          suggestedDesignerId: dto.suggestedDesignerId,
          reason: dto.reason.trim(),
          status: 'Pending',
        },
        include: INCLUDE,
      });
    } catch (error) {
      // Filtered unique index UQ_ErpTSReallocationRequest_pending_task_requester
      // closes the double-submit race the findFirst guard alone cannot.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'You already have a pending reallocation request for this task.',
        );
      }
      throw error;
    }

    await this.activityLogger.log({
      action: ActivityAction.REALLOCATION_REQUEST_SUBMITTED,
      userId,
      taskId: dto.taskId,
      details: {
        event: ActivityAction.REALLOCATION_REQUEST_SUBMITTED,
        messageKey: 'reallocation_request_submitted',
        context: {
          requestId: created.id,
          suggestedDesignerId: dto.suggestedDesignerId,
          reason: dto.reason.trim(),
        },
      },
    });

    await this.notifyHods(created);
    this.dashboardRealtime?.notifyOverviewRefresh('reallocation_requested', {
      taskId: dto.taskId,
    });

    return this.toView(created, remaining);
  }

  async cancel(id: string, userId: string) {
    const row = await this.prisma.reallocationRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Reallocation request not found');
    if (row.requesterId !== userId) {
      throw new ForbiddenException('Only the requester can cancel this request.');
    }
    if (row.status !== 'Pending') {
      throw new BadRequestException('Only pending requests can be cancelled.');
    }

    const updated = await this.prisma.reallocationRequest.update({
      where: { id },
      data: { status: 'Cancelled', updatedAt: new Date() },
      include: INCLUDE,
    });

    await this.activityLogger.log({
      action: ActivityAction.REALLOCATION_REQUEST_CANCELLED,
      userId,
      taskId: row.taskId,
      details: {
        event: ActivityAction.REALLOCATION_REQUEST_CANCELLED,
        messageKey: 'reallocation_request_cancelled',
        context: { requestId: id },
      },
    });

    this.dashboardRealtime?.notifyOverviewRefresh('reallocation_cancelled', {
      taskId: row.taskId,
    });

    return this.toView(updated, null);
  }

  async review(id: string, reviewerId: string, role: UserRole, dto: ReviewReallocationRequestDto) {
    this.assertManager(role);
    const row = await this.prisma.reallocationRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Reallocation request not found');
    if (row.status !== 'Pending') {
      throw new BadRequestException('Only pending requests can be reviewed.');
    }

    if (dto.status === 'Rejected') {
      const remarks = String(dto.remarks ?? dto.comments ?? '').trim();
      if (!remarks) throw new BadRequestException('Remarks are required when disagreeing.');

      const updated = await this.prisma.reallocationRequest.update({
        where: { id },
        data: {
          status: 'Rejected',
          approverId: reviewerId,
          approverRemarks: remarks,
          reviewedAt: new Date(),
        },
        include: INCLUDE,
      });

      await this.activityLogger.log({
        action: ActivityAction.REALLOCATION_REQUEST_REJECTED,
        userId: reviewerId,
        taskId: row.taskId,
        details: {
          event: ActivityAction.REALLOCATION_REQUEST_REJECTED,
          messageKey: 'reallocation_request_rejected',
          context: { requestId: id, remarks },
        },
      });

      await this.notifyRequester(updated, 'Rejected', remarks);
      this.dashboardRealtime?.notifyOverviewRefresh('reallocation_rejected', {
        taskId: row.taskId,
      });
      return this.toView(updated, null);
    }

    const targetDesignerId = (dto.targetDesignerId ?? row.suggestedDesignerId).trim();
    if (!isUuidString(targetDesignerId)) {
      throw new BadRequestException('targetDesignerId must be a UUID.');
    }
    if (targetDesignerId === row.requesterId) {
      throw new BadRequestException('Target designer must be different from the requester.');
    }

    // Freeze + pack share one DB transaction inside applyReallocationHandoff.
    // Draft seconds for FIFO are read and frozen there so a failed pack never
    // leaves the requester timer HandedOff while this request stays Pending.
    const handoff = await this.schedulerAssignments.applyReallocationHandoff({
      taskId: row.taskId,
      fromDesignerId: row.requesterId,
      toDesignerId: targetDesignerId,
      assignedBy: reviewerId,
    });

    const updated = await this.prisma.reallocationRequest.update({
      where: { id },
      data: {
        status: 'Approved',
        targetDesignerId,
        approverId: reviewerId,
        approverRemarks: String(dto.remarks ?? dto.comments ?? '').trim() || null,
        reviewedAt: new Date(),
      },
      include: INCLUDE,
    });

    await this.activityLogger.log({
      action: ActivityAction.REALLOCATION_REQUEST_APPROVED,
      userId: reviewerId,
      taskId: row.taskId,
      details: {
        event: ActivityAction.REALLOCATION_REQUEST_APPROVED,
        messageKey: 'reallocation_request_approved',
        context: {
          requestId: id,
          targetDesignerId,
          remainingHoursMoved: handoff.remainingHoursMoved,
          unplacedHours: handoff.unplacedHours,
          affectedWeekStarts: handoff.affectedWeekStarts,
        },
      },
    });

    await this.notifyRequester(updated, 'Approved');
    await this.notifyTarget(updated, handoff.remainingHoursMoved);

    this.dashboardRealtime?.notifyOverviewRefresh('reallocation_approved', {
      taskId: row.taskId,
      affectedWeekStarts: handoff.affectedWeekStarts,
      changedTaskIds: [row.taskId],
    });

    return {
      ...this.toView(updated, null),
      remainingHoursMoved: handoff.remainingHoursMoved,
      unplacedHours: handoff.unplacedHours,
      affectedWeekStarts: handoff.affectedWeekStarts,
    };
  }

  private reallocationLink(requestId: string, forManager = false) {
    const base = forManager ? '/hod/requests' : '/designer/requests';
    return `${base}?tab=reallocation&reallocationId=${requestId}`;
  }

  private async notifyHods(request: ReallocationFull) {
    const hods = await this.prisma.user.findMany({
      where: { role: { name: UserRole.HOD } },
      select: { id: true },
    });
    const linkUrl = this.reallocationLink(request.id, true);
    const message = `${request.requester.fullName} requested reallocation of ${request.task.taskNo} to ${request.suggestedDesigner.fullName}.`;
    await Promise.all(
      hods.map(async (hod) => {
        try {
          await this.prisma.notification.create({
            data: {
              id: randomUUID(),
              userId: hod.id,
              title: 'New Reallocation Request',
              message,
              linkUrl,
            },
          });
          this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
        } catch (err) {
          this.logger.error('Failed to notify HOD of reallocation request', err);
        }
      }),
    );
  }

  private async notifyRequester(
    request: ReallocationFull,
    action: 'Approved' | 'Rejected',
    remarks?: string | null,
  ) {
    const linkUrl = taskViewPath(request.taskId, request.task.designType);
    const message =
      action === 'Approved'
        ? `Your reallocation request for ${request.task.taskNo} was approved.`
        : `Your reallocation request for ${request.task.taskNo} was disagreed.${remarks ? ` Reason: ${remarks}` : ''}`;
    try {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: request.requesterId,
          title: `Reallocation Request ${action === 'Approved' ? 'Approved' : 'Disagreed'}`,
          message,
          linkUrl,
        },
      });
      this.dashboardRealtime?.notifyUserNotificationRefresh(request.requesterId);
    } catch (err) {
      this.logger.error('Failed to notify requester of reallocation review', err);
    }
  }

  private async notifyTarget(request: ReallocationFull, hours: number) {
    const targetId = request.targetDesignerId;
    if (!targetId) return;
    const linkUrl = taskViewPath(request.taskId, request.task.designType);
    try {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: targetId,
          title: 'Task Reallocated to You',
          message: `${Math.round(hours * 100) / 100}h of ${request.task.taskNo} was reallocated to you from ${request.requester.fullName}.`,
          linkUrl,
        },
      });
      this.dashboardRealtime?.notifyUserNotificationRefresh(targetId);
    } catch (err) {
      this.logger.error('Failed to notify target designer of reallocation', err);
    }
  }
}
