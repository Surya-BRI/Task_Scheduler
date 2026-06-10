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
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';
import { ReviewRegularizationRequestDto } from './dto/review-regularization-request.dto';
import { UpdateRegularizationStatusDto } from './dto/update-regularization-status.dto';
import { isUuidString } from './sql-uuid.util';
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
      id: true,
      fullName: true,
      departmentId: true,
      department: { select: { name: true } },
    },
  },
  task: { select: { id: true, title: true, taskNo: true, opNo: true } },
  approver: { select: { id: true, fullName: true } },
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
      designerId: row.designerId ?? '',
      designerName: row.designer?.fullName?.trim() || 'Unknown',
      employeeId: row.designerId ?? '',
      departmentName: row.designer?.department?.name?.trim() || '—',
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
      approverId: row.approverId?.trim() || null,
      approverName: row.approver?.fullName?.trim() || null,
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

  private async findDepartmentHods(departmentId: string | null | undefined) {
    if (!departmentId?.trim()) return [];
    return this.prisma.user.findMany({
      where: {
        departmentId: departmentId.trim(),
        role: { name: UserRole.HOD },
      },
      select: { id: true, fullName: true, email: true },
    });
  }

  private regularizationLink(id: string, designerId?: string): string {
    const params = new URLSearchParams({ regularizationId: id });
    if (designerId?.trim()) params.set('forDesignerId', designerId.trim());
    return `/designer/requests?${params.toString()}#regularization`;
  }

  private async notifyHods(request: RegularizationRequestView, designerName: string) {
    const designer = await this.prisma.user.findUnique({
      where: { id: request.designerId },
      select: { departmentId: true },
    });

    let targets = await this.findDepartmentHods(designer?.departmentId);

    if (targets.length === 0) {
      targets = await this.prisma.user.findMany({
        where: { role: { name: UserRole.HOD } },
        select: { id: true, fullName: true, email: true },
      });
    }

    if (targets.length === 0) {
      const fallback = process.env.REGULARIZATION_DEFAULT_APPROVER_ID?.trim();
      if (fallback && isUuidString(fallback)) {
        targets = [{ id: fallback, fullName: 'HOD', email: '' }];
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
            linkUrl: this.regularizationLink(request.id, request.designerId),
          },
        });
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
          userId: request.designerId,
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
    if (role === UserRole.HOD) return;
    if (submitterId !== designerId) {
      throw new ForbiddenException('You can only submit regularization requests for yourself');
    }
  }

  private async assertReviewerAccess(
    reviewerId: string,
    role: UserRole,
    request: RegularizationRequestView,
  ) {
    if (role !== UserRole.HOD) {
      throw new ForbiddenException('Only HOD can review regularization requests');
    }

    const [reviewer, designer] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: reviewerId }, select: { departmentId: true } }),
      this.prisma.user.findUnique({
        where: { id: request.designerId },
        select: { departmentId: true },
      }),
    ]);

    if (
      reviewer?.departmentId &&
      designer?.departmentId &&
      reviewer.departmentId !== designer.departmentId
    ) {
      throw new ForbiddenException('You can only review requests from your department');
    }
  }

  async listTaskOptions(designerId: string): Promise<RegularizationTaskOption[]> {
    if (!isUuidString(designerId)) {
      throw new BadRequestException(
        'designerId must be a UUID matching ErpTSRegularizationRequest.designerId (uniqueidentifier).',
      );
    }

    let historicalTaskIds: string[] = [];
    try {
      const historicalRequests = await this.prisma.regularizationRequest.findMany({
        where: { designerId, taskId: { not: null } },
        select: { taskId: true },
        distinct: ['taskId'],
      });
      historicalTaskIds = historicalRequests.map((r) => r.taskId!).filter(Boolean);
    } catch (err) {
      this.logger.warn(
        `Regularization historical task ids: ${err instanceof Error ? err.message : err}`,
      );
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        OR: [
          { assigneeId: designerId },
          ...(historicalTaskIds.length > 0 ? [{ id: { in: historicalTaskIds } }] : []),
        ],
      },
      select: { id: true, title: true, taskNo: true, opNo: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const byId = new Map<string, RegularizationTaskOption>();
    for (const task of tasks) {
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
    if (!isUuidString(designerId)) {
      throw new BadRequestException(
        'designerId must be a UUID matching ErpTSRegularizationRequest.designerId (uniqueidentifier).',
      );
    }
    const rows = await this.prisma.regularizationRequest.findMany({
      where: { designerId },
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

    if (role === UserRole.HOD) {
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
    if (role !== UserRole.HOD) {
      throw new ForbiddenException('Only HOD can view pending approvals');
    }

    const where: Prisma.RegularizationRequestWhereInput = { status: 'Pending' };

    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { departmentId: true },
    });
    if (manager?.departmentId) {
      where.designer = { departmentId: manager.departmentId };
    }

    const rows = await this.prisma.regularizationRequest.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.mapRow(r));
  }

  async findTeamRequests(
    managerId: string,
    role: UserRole,
    filters: { status?: string; designerId?: string },
  ): Promise<RegularizationRequestView[]> {
    if (role !== UserRole.HOD) {
      throw new ForbiddenException('Only HOD can view team requests');
    }

    const where: Prisma.RegularizationRequestWhereInput = {};

    if (filters.status?.trim()) {
      where.status = filters.status.trim();
    }
    if (filters.designerId?.trim() && isUuidString(filters.designerId)) {
      where.designerId = filters.designerId.trim();
    }
    {
      const manager = await this.prisma.user.findUnique({
        where: { id: managerId },
        select: { departmentId: true },
      });
      if (manager?.departmentId) {
        where.designer = {
          ...((where.designer as Prisma.UserWhereInput | undefined) ?? {}),
          departmentId: manager.departmentId,
        };
      }
    }

    const rows = await this.prisma.regularizationRequest.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return rows.map((r) => this.mapRow(r));
  }

  async create(
    submitterId: string,
    role: UserRole,
    dto: CreateRegularizationRequestDto,
  ): Promise<RegularizationRequestView> {
    this.assertDesignerOwnership(submitterId, role, dto.designerId);

    if (dto.reason?.trim() === 'Other' && !dto.notes?.trim()) {
      throw new BadRequestException('Notes are required when reason is Other');
    }

    const designer = await this.prisma.user.findUnique({
      where: { id: dto.designerId },
      select: { id: true, fullName: true, departmentId: true },
    });
    if (!designer) throw new BadRequestException('Designer not found');

    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      select: { id: true, taskNo: true, title: true },
    });
    if (!task) throw new BadRequestException('Task not found');

    const hods = await this.findDepartmentHods(designer.departmentId);
    const assignedHodId = hods[0]?.id ?? null;

    const status = dto.status?.trim() || 'Pending';

    const newRow = await this.prisma.regularizationRequest.create({
      data: {
        designerId: dto.designerId,
        taskId: dto.taskId,
        date: new Date(dto.date),
        duration: dto.duration.trim(),
        reason: dto.reason,
        notes: dto.notes?.trim() || null,
        status,
        approverId: assignedHodId,
      },
      include: INCLUDE,
    });

    const request = this.mapRow(newRow);

    await this.activityLogger.log({
      action: ActivityAction.REGULARIZATION_SUBMITTED,
      userId: submitterId,
      taskId: dto.taskId,
      details: {
        event: ActivityAction.REGULARIZATION_SUBMITTED,
        messageKey: 'regularization_submitted',
        changes: {
          requestId: newRow.id,
          date: dto.date,
          reason: dto.reason,
          status,
          assignedHodId,
        },
        taskSnapshot: { id: task.id, taskNo: task.taskNo, title: task.title ?? undefined },
        context: {
          designerId: dto.designerId,
          departmentId: designer.departmentId ?? null,
          designerName: designer.fullName,
        },
      },
    });

    await this.notifyHods(request, designer.fullName);

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

    const updatedRow = await this.prisma.regularizationRequest.update({
      where: { id },
      data: {
        status: dto.status,
        approverId: reviewerId,
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
        },
        taskSnapshot: reviewTask
          ? { id: reviewTask.id, taskNo: reviewTask.taskNo, title: reviewTask.title ?? undefined }
          : undefined,
        context: { designerId: updated.designerId, designerName: updated.designerName },
      },
    });

    await this.notifyDesigner(updated, dto.status, remarks).catch((err) => {
      this.logger.warn(`Failed to notify designer: ${err instanceof Error ? err.message : err}`);
    });

    this.dashboardRealtime?.notifyOverviewRefresh(
      dto.status === 'Approved' ? 'regularization_approved' : 'regularization_rejected',
    );
    this.dashboardRealtime?.notifyUserNotificationRefresh(updated.designerId);

    return updated;
  }

  /** @deprecated Use review() — kept for backward compatibility */
  async updateStatus(
    id: string,
    dto: UpdateRegularizationStatusDto,
    reviewerId?: string,
    role?: UserRole,
  ): Promise<RegularizationRequestView> {
    if (reviewerId && role && (dto.status === 'Approved' || dto.status === 'Rejected')) {
      return this.review(id, reviewerId, role, { status: dto.status, remarks: undefined });
    }

    if (!isUuidString(id)) throw new BadRequestException('id must be a UUID.');

    const defaultApprover = process.env.REGULARIZATION_DEFAULT_APPROVER_ID?.trim();
    const approverGuid =
      dto.approverId?.trim() ??
      (defaultApprover && isUuidString(defaultApprover) ? defaultApprover : null);

    const updatedRow = await this.prisma.regularizationRequest.update({
      where: { id },
      data: {
        status: dto.status,
        ...(approverGuid ? { approverId: approverGuid } : {}),
      },
      include: INCLUDE,
    });

    return this.mapRow(updatedRow);
  }
}
