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
import { hasHrApproverAccess } from '../common/utils/workflow-roles.util';
import { assertRegularizationDateAllowed } from '../common/utils/date-window.util';
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';
import { ReviewRegularizationRequestDto } from './dto/review-regularization-request.dto';
import { isUuidString, isPositiveIntegerString } from './sql-uuid.util';
import type { RegularizationRequestsContract } from './regularization-requests.contract';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';

export type RegularizationTaskOption = {
  id: string;
  name: string;
};

export type RegularizationRequestView = {
  id: string;
  designerId: string;
  designerName: string;
  employeeId: string;
  departmentName: string;
  taskId: string;
  taskName: string;
  date: string;
  duration: string;
  reason: string;
  notes: string;
  status: 'unsubmitted' | 'Pending' | 'Approved' | 'Rejected';
  approverId: string | null;
  approverName: string | null;
  approverRemarks: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const INCLUDE = {
  designer: {
    select: {
      userId: true,
      userName: true,
    },
  },
  task: { select: { id: true, title: true, taskNo: true, opNo: true } },
  approver: { select: { userId: true, userName: true } },
} satisfies Prisma.RegularizationRequestInclude;

type RegularizationRequestFull = Prisma.RegularizationRequestGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class RegularizationRequestsService implements RegularizationRequestsContract {
  private readonly logger = new Logger(RegularizationRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: ActivityLoggerService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  private formatDuration(value: string | null | undefined): string {
    if (!value) return '—';
    const t = String(value).trim();
    return t || '—';
  }

  private toYyyyMmDd(d: Date | null | undefined): string {
    if (d == null) return '';
    const x = new Date(d);
    if (isNaN(x.getTime())) return '';
    const yyyy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private dayIndexForDate(date: Date, weekStartDate: Date): number {
    const dateUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const weekUtc = Date.UTC(
      weekStartDate.getUTCFullYear(),
      weekStartDate.getUTCMonth(),
      weekStartDate.getUTCDate(),
    );
    return Math.floor((dateUtc - weekUtc) / 86_400_000);
  }

  private parseDateOnly(dateStr: string, fieldName: string): Date {
    const trimmed = String(dateStr ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException(`${fieldName} must be YYYY-MM-DD.`);
    }
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
    return date;
  }

  private getDayWindow(date: Date): { dayStart: Date; dayEnd: Date } {
    const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCHours(23, 59, 59, 999);
    return { dayStart, dayEnd };
  }

  private async assertNoApprovedLeaveBlockingRegularization(
    designerId: string,
    date: Date,
  ): Promise<void> {
    const { dayStart, dayEnd } = this.getDayWindow(date);
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        userId: BigInt(designerId),
        status: { in: ['Approved', 'APPROVED', 'approved'] },
        revokedAt: null,
        startDate: { lte: dayEnd },
        OR: [{ endDate: null }, { endDate: { gte: dayStart } }],
      },
      select: { id: true },
      take: 1,
    });

    if (leaves.length > 0) {
      throw new BadRequestException(
        'Cannot submit regularization because the designer has approved leave for this date.',
      );
    }
  }

  private async findSchedulerAssignmentForDate(
    designerId: string,
    taskId: string,
    dateStr: string,
  ): Promise<{ id: string } | null> {
    const requestDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(requestDate.getTime())) {
      throw new BadRequestException('Invalid regularization date.');
    }
    const weekStartDate = this.getStartOfWeek(requestDate);
    const dayIndex = this.dayIndexForDate(requestDate, weekStartDate);
    return this.prisma.schedulerAssignment.findFirst({
      where: {
        designerId: BigInt(designerId),
        taskId,
        weekStartDate,
        dayIndex,
      },
      select: { id: true },
    });
  }

  private async assertTaskScheduledForDate(
    designerId: string,
    taskId: string,
    dateStr: string,
  ): Promise<void> {
    const assignment = await this.findSchedulerAssignmentForDate(designerId, taskId, dateStr);
    if (!assignment) {
      throw new ForbiddenException(
        'You can only submit regularization for tasks assigned to you on the selected date.',
      );
    }
  }

  private async touchSchedulerWeekForRegularization(
    request: { date?: Date | string | null },
    userId: string,
  ): Promise<void> {
    if (!request.date) return;
    const date = request.date instanceof Date ? request.date : new Date(request.date);
    if (Number.isNaN(date.getTime())) return;
    const weekStartDate = this.getStartOfWeek(date);
    await this.prisma.schedulerWeek.upsert({
      where: { weekStartDate },
      create: {
        weekStartDate,
        version: 1,
        isLocked: false,
        updatedBy: BigInt(userId),
        lastPayloadHash: null,
      },
      update: {
        version: { increment: 1 },
        updatedBy: BigInt(userId),
        lastPayloadHash: null,
      },
    });
  }

  private mapStatus(db: string | null | undefined): RegularizationRequestView['status'] {
    const t = (db ?? '').trim().toLowerCase();
    if (t === 'approved') return 'Approved';
    if (t === 'rejected') return 'Rejected';
    if (t === 'draft' || t === 'unsubmitted') return 'unsubmitted';
    return 'Pending';
  }

  private formatTaskDisplay(parts: {
    title?: string | null;
    taskNo?: string | null;
    opNo?: string | null;
  }): string {
    const title = parts.title?.trim() ?? '';
    const taskNo = parts.taskNo?.trim() ?? '';
    const opNo = parts.opNo?.trim() ?? '';
    if (title && taskNo) return `${title} (${taskNo})`;
    if (title) return title;
    if (taskNo) return taskNo;
    if (opNo) return opNo;
    return '—';
  }

  private mapRow(row: RegularizationRequestFull): RegularizationRequestView {
    return {
      id: row.id,
      designerId: row.designerId != null ? String(row.designerId) : '',
      designerName: row.designer?.userName?.trim() || 'Unknown',
      employeeId: row.designerId != null ? String(row.designerId) : '',
      departmentName: '—',
      taskId: row.taskId ?? '',
      taskName: this.formatTaskDisplay({
        title: row.task?.title,
        taskNo: row.task?.taskNo,
        opNo: row.task?.opNo,
      }),
      date: this.toYyyyMmDd(row.date),
      duration: this.formatDuration(row.duration),
      reason: row.reason ?? '',
      notes: row.notes ?? '',
      status: this.mapStatus(row.status),
      approverId: row.approverId != null ? String(row.approverId) : null,
      approverName: row.approver?.userName?.trim() || null,
      approverRemarks: row.approverRemarks?.trim() || null,
      reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date(0).toISOString(),
    };
  }

  private async loadRowById(id: string): Promise<RegularizationRequestView> {
    const row = await this.prisma.regularizationRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Regularization request not found');
    return this.mapRow(row);
  }

  private async findHodUsers(): Promise<Array<{ id: bigint; userName: string }>> {
    const rows = await this.prisma.$queryRaw<Array<{ userId: bigint; userName: string; roleName: string | null }>>`
      SELECT u.userId, u.userName, r.roleName
      FROM ErpAuthUsers u
      JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
      JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
      WHERE u.isActive = 1 AND u.isDeleted = 0
    `;
    const hodRoleNames = new Set(['Design HOD', 'Design Head']);
    const seen = new Set<string>();
    const result: Array<{ id: bigint; userName: string }> = [];
    for (const row of rows) {
      if (!row.roleName || !hodRoleNames.has(row.roleName)) continue;
      const key = row.userId.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ id: row.userId, userName: row.userName });
    }
    return result;
  }

  private regularizationLink(id: string, designerId?: string, forManager = false): string {
    const params = new URLSearchParams({ regularizationId: id });
    if (designerId?.trim()) params.set('forDesignerId', designerId.trim());
    const base = forManager ? '/hod/requests' : '/designer/requests';
    return `${base}?${params.toString()}#regularization`;
  }

  private async notifyHods(request: RegularizationRequestView, designerName: string) {
    let targets = await this.findHodUsers();

    if (targets.length === 0) {
      const fallback = process.env.REGULARIZATION_DEFAULT_APPROVER_ID?.trim();
      if (fallback && isPositiveIntegerString(fallback)) {
        targets = [{ id: BigInt(fallback), userName: 'HOD' }];
      }
    }

    for (const hod of targets) {
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: hod.id,
            title: 'New Regularization Request',
            message: `New regularization request submitted by ${designerName} for ${request.date}. Reason: ${request.reason}.`,
            linkUrl: this.regularizationLink(request.id, request.designerId, true),
          },
        });
        this.dashboardRealtime?.notifyUserNotificationRefresh(String(hod.id));
      } catch (err) {
        this.logger.warn(
          `Failed to notify HOD ${hod.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private async notifyDesigner(
    request: RegularizationRequestView,
    action: 'Approved' | 'Rejected',
    remarks?: string | null,
  ) {
    const actionLabel = action === 'Approved' ? 'approved' : 'rejected';
    try {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: BigInt(request.designerId),
          title: `Regularization Request ${action}`,
          message: `Your regularization request for ${request.date} has been ${actionLabel}.${
            remarks?.trim() ? ` Remarks: "${remarks.trim()}"` : ''
          }`,
          linkUrl: this.regularizationLink(request.id, request.designerId),
        },
      });
    } catch (err) {
      this.logger.warn(`Designer notification failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private assertDesignerOwnership(submitterId: string, role: UserRole, designerId: string) {
    if (hasHrApproverAccess(role)) return;
    if (submitterId !== designerId) {
      throw new ForbiddenException('You can only submit regularization requests for yourself');
    }
  }

  private async assertReviewerAccess(
    _reviewerId: string,
    role: UserRole,
    _request: RegularizationRequestView,
  ) {
    if (!hasHrApproverAccess(role)) {
      throw new ForbiddenException('Only department managers can review regularization requests');
    }
    // Department-scoped access is no longer possible — ERP has no department
    // concept on ErpAuthUsers — any HOD may review any request.
  }

  async listTaskOptions(designerId: string, dateStr: string): Promise<RegularizationTaskOption[]> {
    if (!isPositiveIntegerString(designerId)) {
      throw new BadRequestException(
        'designerId must be numeric, matching ErpTSRegularizationRequest.designerId (bigint).',
      );
    }

    const requestDate = this.parseDateOnly(dateStr, 'date');
    const weekStartDate = this.getStartOfWeek(requestDate);
    const dayIndex = this.dayIndexForDate(requestDate, weekStartDate);

    const rows = await this.prisma.schedulerAssignment.findMany({
      where: {
        designerId: BigInt(designerId),
        weekStartDate,
        dayIndex,
        taskId: { not: null },
      },
      include: {
        task: { select: { id: true, title: true, taskNo: true, opNo: true } },
      },
      orderBy: [
        { position: 'asc' },
        { id: 'asc' },
      ],
    });

    const byId = new Map<string, RegularizationTaskOption>();
    for (const row of rows) {
      const task = row.task;
      if (!task || byId.has(task.id)) continue;
      byId.set(task.id, {
        id: task.id,
        name: this.formatTaskDisplay({
          title: task.title,
          taskNo: task.taskNo,
          opNo: task.opNo,
        }),
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async findByDesigner(designerId: string): Promise<RegularizationRequestView[]> {
    if (!isPositiveIntegerString(designerId)) {
      throw new BadRequestException(
        'designerId must be numeric, matching ErpTSRegularizationRequest.designerId (bigint).',
      );
    }
    const rows = await this.prisma.regularizationRequest.findMany({
      where: { designerId: BigInt(designerId) },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return rows.map((r) => this.mapRow(r));
  }

  async findOne(
    id: string,
    userId: string,
    role: UserRole,
  ): Promise<RegularizationRequestView> {
    if (!isUuidString(id)) throw new BadRequestException('id must be a UUID.');
    const request = await this.loadRowById(id);

    if (hasHrApproverAccess(role)) {
      await this.assertReviewerAccess(userId, role, request);
      return request;
    }

    if (request.designerId !== userId) {
      throw new ForbiddenException('You do not have access to this request');
    }
    return request;
  }

  async findPendingApprovals(
    managerId: string,
    role: UserRole,
  ): Promise<RegularizationRequestView[]> {
    if (!hasHrApproverAccess(role)) {
      throw new ForbiddenException('Only department managers can view pending approvals');
    }

    // Department-scoped filtering is no longer possible — ERP has no department
    // concept on ErpAuthUsers, so every HOD sees all pending requests company-wide.
    const where: Prisma.RegularizationRequestWhereInput = { status: 'Pending' };

    const rows = await this.prisma.regularizationRequest.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.mapRow(r));
  }

  async findTeamRequests(
    _managerId: string,
    role: UserRole,
    filters: { status?: string; designerId?: string },
  ): Promise<RegularizationRequestView[]> {
    if (!hasHrApproverAccess(role)) {
      throw new ForbiddenException('Only department managers can view team requests');
    }

    const where: Prisma.RegularizationRequestWhereInput = {};

    if (filters.status?.trim()) {
      where.status = filters.status.trim();
    }
    if (filters.designerId?.trim() && isPositiveIntegerString(filters.designerId)) {
      where.designerId = BigInt(filters.designerId.trim());
    }

    const rows = await this.prisma.regularizationRequest.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return rows.map((r) => this.mapRow(r));
  }

  private async resolveNonTaskProject(
    projectRef: string,
  ): Promise<{ id: string; name: string; projectNo: string | null } | null> {
    const key = projectRef.trim();
    if (!key) return null;

    const select = { id: true, name: true, projectNo: true } as const;

    if (isUuidString(key)) {
      const byId = await this.prisma.project.findUnique({
        where: { id: key },
        select,
      });
      if (byId) return byId;
    }

    return this.prisma.project.findFirst({
      where: isUuidString(key) ? { id: key } : { projectNo: key },
      select,
    });
  }

  async create(
    submitterId: string,
    role: UserRole,
    dto: CreateRegularizationRequestDto,
  ): Promise<RegularizationRequestView> {
    this.assertDesignerOwnership(submitterId, role, dto.designerId);
    assertRegularizationDateAllowed(dto.date);
    await this.assertNoApprovedLeaveBlockingRegularization(
      dto.designerId,
      this.parseDateOnly(dto.date, 'date'),
    );

    if (dto.reason?.trim() === 'Other' && !dto.notes?.trim()) {
      throw new BadRequestException('Notes are required when reason is Other');
    }

    const regType = dto.regularizationType ?? 'task';
    const isNonTask = regType === 'non-task';

    const designer = await this.prisma.erpUser.findUnique({
      where: { userId: BigInt(dto.designerId) },
      select: { userId: true, userName: true },
    });
    if (!designer) throw new BadRequestException('Designer not found');

    let task: { id: string; taskNo: string | null; title: string | null } | null = null;
    let project: { id: string; name: string; projectNo: string | null } | null = null;
    let storedNotes = dto.notes?.trim() || null;

    if (isNonTask) {
      if (!dto.projectId?.trim()) {
        throw new BadRequestException('Project is required for non-task regularization');
      }
      if (!dto.workDetails?.trim()) {
        throw new BadRequestException('Work details are required for non-task regularization');
      }
      project = await this.resolveNonTaskProject(dto.projectId);
      if (!project) throw new BadRequestException('Project not found');
      storedNotes = `[NON-TASK] Project: ${project.name}\n${dto.workDetails.trim()}${
        storedNotes ? `\n\n${storedNotes}` : ''
      }`;
    } else {
      if (!dto.taskId?.trim()) {
        throw new BadRequestException('Task is required for assigned-task regularization');
      }
      task = await this.prisma.task.findUnique({
        where: { id: dto.taskId },
        select: { id: true, taskNo: true, title: true },
      });
      if (!task) throw new BadRequestException('Task not found');
      await this.assertTaskScheduledForDate(dto.designerId, dto.taskId, dto.date);
    }

    const hods = await this.findHodUsers();
    const assignedHodId = hods[0]?.id ?? null;
    const hodAutoApprove = hasHrApproverAccess(role);
    const hodOnBehalf = hodAutoApprove && submitterId !== dto.designerId;
    const status = hodAutoApprove ? 'Approved' : dto.status?.trim() || 'Pending';
    const reviewedAt = hodAutoApprove ? new Date() : undefined;
    const approverRemarks = hodAutoApprove
      ? hodOnBehalf
        ? 'Auto-approved by system (HOD submission on behalf of designer)'
        : 'Auto-approved by system (HOD submission)'
      : undefined;

    const newRow = await this.prisma.regularizationRequest.create({
      data: {
        designerId: BigInt(dto.designerId),
        taskId: isNonTask ? null : dto.taskId,
        date: new Date(dto.date),
        duration: dto.duration.trim(),
        reason: dto.reason,
        notes: storedNotes,
        status,
        approverId: hodAutoApprove ? BigInt(submitterId) : assignedHodId,
        approverRemarks: approverRemarks ?? null,
        reviewedAt,
      },
      include: INCLUDE,
    });

    const request = this.mapRow(newRow);

    const submitAction = hodAutoApprove
      ? ActivityAction.REGULARIZATION_AUTO_APPROVED
      : ActivityAction.REGULARIZATION_SUBMITTED;
    const submitMessageKey = hodAutoApprove
      ? 'regularization_auto_approved'
      : 'regularization_submitted';

    await this.activityLogger.log({
      action: submitAction,
      userId: submitterId,
      taskId: task?.id,
      details: {
        event: submitAction,
        messageKey: submitMessageKey,
        changes: {
          requestId: newRow.id,
          date: dto.date,
          reason: dto.reason,
          status,
          regularizationType: regType,
          autoApproved: hodAutoApprove,
          submittedByHod: hodAutoApprove,
          beneficiaryDesignerId: dto.designerId,
          submittedOnBehalf: hodOnBehalf,
        },
        taskSnapshot: task
          ? { id: task.id, taskNo: task.taskNo ?? undefined, title: task.title ?? undefined }
          : undefined,
        projectSnapshot: project
          ? { id: project.id, name: project.name, projectNo: project.projectNo }
          : undefined,
        context: {
          designerId: dto.designerId,
          departmentId: null,
          designerName: designer.userName,
          requesterName: designer.userName,
          recipientName: hodAutoApprove ? designer.userName : hods[0]?.userName ?? 'HOD',
          approverName: hodAutoApprove ? undefined : hods[0]?.userName ?? undefined,
          submitterId,
          submitterRole: role,
        },
      },
    });

    if (hodAutoApprove) {
      if (hodOnBehalf) {
        await this.notifyDesigner(request, 'Approved', approverRemarks).catch((err) => {
          this.logger.warn(`Failed to notify designer: ${err instanceof Error ? err.message : err}`);
        });
      }
      await this.touchSchedulerWeekForRegularization(newRow, submitterId);
      this.dashboardRealtime?.notifyOverviewRefresh('regularization_approved');
      if (dto.designerId) {
        this.dashboardRealtime?.notifyUserNotificationRefresh(dto.designerId);
      }
    } else {
      await this.notifyHods(request, designer.userName);
    }

    return request;
  }

  async review(
    id: string,
    reviewerId: string,
    role: UserRole,
    dto: ReviewRegularizationRequestDto,
  ): Promise<RegularizationRequestView> {
    if (!isUuidString(id)) throw new BadRequestException('id must be a UUID.');

    const existing = await this.loadRowById(id);
    if (existing.status !== 'Pending') {
      throw new BadRequestException('This request has already been processed');
    }

    await this.assertReviewerAccess(reviewerId, role, existing);

    const remarks = (dto.remarks ?? dto.comments ?? '').trim();
    if (dto.status === 'Rejected' && !remarks) {
      throw new BadRequestException('Rejection remarks are required');
    }

    if (dto.status === 'Approved') {
      await this.assertNoApprovedLeaveBlockingRegularization(
        existing.designerId,
        this.parseDateOnly(existing.date, 'date'),
      );
    }

    let schedulerLinkStale = false;
    if (dto.status === 'Approved' && existing.taskId) {
      const stillLinked = await this.findSchedulerAssignmentForDate(
        existing.designerId,
        existing.taskId,
        existing.date,
      );
      schedulerLinkStale = !stillLinked;
    }

    const updatedRow = await this.prisma.regularizationRequest.update({
      where: { id },
      data: {
        status: dto.status,
        approverId: BigInt(reviewerId),
        approverRemarks: remarks || null,
        reviewedAt: new Date(),
      },
      include: INCLUDE,
    });

    const updated = this.mapRow(updatedRow);

    const action =
      dto.status === 'Approved'
        ? ActivityAction.REGULARIZATION_APPROVED
        : ActivityAction.REGULARIZATION_REJECTED;

    const reviewTask = await this.prisma.task
      .findUnique({
        where: { id: updated.taskId },
        select: { id: true, taskNo: true, title: true },
      })
      .catch(() => null);

    await this.activityLogger.log({
      action,
      userId: reviewerId,
      taskId: updated.taskId,
      details: {
        event: action,
        messageKey:
          dto.status === 'Approved' ? 'regularization_approved' : 'regularization_rejected',
        changes: {
          requestId: id,
          status: dto.status,
          approverId: reviewerId,
          remarks: remarks || null,
          reviewedAt: updated.reviewedAt,
          ...(schedulerLinkStale ? { schedulerLinkStale: true } : {}),
        },
        taskSnapshot: reviewTask
          ? { id: reviewTask.id, taskNo: reviewTask.taskNo, title: reviewTask.title ?? undefined }
          : undefined,
        context: {
          designerId: updated.designerId,
          designerName: updated.designerName,
          requesterName: updated.designerName,
          recipientName: updated.approverName ?? 'HOD',
          approverName: updated.approverName ?? undefined,
          reviewerName: updated.approverName ?? undefined,
        },
      },
    });

    await this.notifyDesigner(updated, dto.status, remarks).catch((err) => {
      this.logger.warn(`Failed to notify designer: ${err instanceof Error ? err.message : err}`);
    });

    if (dto.status === 'Approved') {
      await this.touchSchedulerWeekForRegularization(updatedRow, reviewerId);
    }
    this.dashboardRealtime?.notifyOverviewRefresh(
      dto.status === 'Approved' ? 'regularization_approved' : 'regularization_rejected',
      dto.status === 'Approved' && updatedRow.date
        ? { weekStart: this.getStartOfWeek(new Date(updatedRow.date)).toISOString().slice(0, 10), taskId: updatedRow.taskId ?? undefined }
        : {},
    );
    this.dashboardRealtime?.notifyUserNotificationRefresh(updated.designerId);

    return updated;
  }
}
