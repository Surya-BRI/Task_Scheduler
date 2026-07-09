import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { UserRole } from '../common/constants/roles.enum';
import { hasDepartmentManagerAccess } from '../common/utils/workflow-roles.util';
import { shouldRunRuntimeSchemaBootstrap } from '../common/utils/runtime-schema-bootstrap.util';
import { assertValidLeaveReason } from '../common/constants/leave-reasons';
import { CreateLeaveRequestDto } from './dto/create-request.dto';
import { ReviewLeaveRequestDto } from './dto/review-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { RevokeLeaveRequestDto } from './dto/revoke-leave-request.dto';
import { SchedulerAssignmentsService } from '../scheduler-assignments/scheduler-assignments.service';
import {
  calculateLeaveDurationDays,
  dateToDateOnlyIso,
  findOverlappingLeave,
  formatLeaveDurationLabel,
  isLeaveRangeCompleted,
  LEAVE_TYPE_HALF_DAY,
  normalizeHalfDaySession,
  normalizeLeaveStatus as normalizeLeaveStatusUtil,
  normalizeLeaveType,
  overlapErrorMessage,
  todayDateOnlyIso,
  validateLeaveDates,
  type LeaveDateRange,
} from './leave-request.validation';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LeaveRequestView = {
  id: string;
  designerId: string;
  requesterName: string;
  reason: string | null;
  fromDate: string;
  toDate: string;
  status: string;
  type: string;
  halfDaySession: string | null;
  leaveDurationDays: number;
  leaveDurationLabel: string;
  createdBy: 'HOD' | 'Designer';
  approverId: string | null;
  approverName: string | null;
  approverRemarks: string | null;
  reviewedAt: string | null;
  revokedById: string | null;
  revokedByName: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  createdAt: string;
};

@Injectable()
export class RequestsService implements OnModuleInit {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: ActivityLoggerService,
    @Optional() private readonly schedulerAssignments?: SchedulerAssignmentsService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!shouldRunRuntimeSchemaBootstrap()) {
      this.logger.debug('Skipping leave-request runtime DDL (use prisma migrate deploy)');
      return;
    }
    try {
      // security-sql:allow-static-ddl
      await this.prisma.$executeRawUnsafe(`
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'approverId') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD approverId UNIQUEIDENTIFIER NULL;
        END
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'approverRemarks') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD approverRemarks NVARCHAR(MAX) NULL;
        END
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'reviewedAt') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD reviewedAt DATETIME NULL;
        END
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'revokedById') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD revokedById UNIQUEIDENTIFIER NULL;
        END
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'revokedAt') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD revokedAt DATETIME NULL;
        END
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'revocationReason') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD revocationReason NVARCHAR(MAX) NULL;
        END
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'halfDaySession') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD halfDaySession NVARCHAR(50) NULL;
        END
        IF COL_LENGTH('dbo.ErpTSLeaveRequest', 'id') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM sys.default_constraints dc
             INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
             INNER JOIN sys.tables t ON t.object_id = c.object_id
             WHERE t.name = 'ErpTSLeaveRequest' AND c.name = 'id'
           )
        BEGIN
          ALTER TABLE dbo.ErpTSLeaveRequest ADD CONSTRAINT DF_ErpTSLeaveRequest_id DEFAULT (newid()) FOR id;
        END
      `);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not ensure leave review columns: ${detail}`);
    }
  }

  private isUuid(value: string | null | undefined): boolean {
    return Boolean(value?.trim() && UUID_RE.test(value.trim()));
  }

  private async resolveDummyId(dummyId: string): Promise<string> {
    if (!dummyId) return dummyId;
    if (this.isUuid(dummyId)) return dummyId;

    const mapping: Record<string, string> = {
      d1: 'Alex Johnson',
      d2: 'Alexander Allen',
      d3: 'Benjamin Harris',
    };

    const name = mapping[dummyId] || 'Alex Johnson';
    const user = await this.prisma.user.findFirst({ where: { fullName: name } });
    if (user) return user.id;

    const fallback = await this.prisma.user.findFirst();
    return fallback?.id || dummyId;
  }

  private toDateLabel(d: Date): string {
    return dateToDateOnlyIso(d);
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private weekStartKeysForLeave(leave: { startDate: Date; endDate?: Date | null }): string[] {
    const keys: string[] = [];
    const start = this.getStartOfWeek(new Date(leave.startDate));
    const end = this.getStartOfWeek(new Date(leave.endDate ?? leave.startDate));
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
      keys.push(cursor.toISOString().slice(0, 10));
    }
    return keys;
  }

  private async touchSchedulerWeeksForLeave(
    leave: { startDate: Date; endDate?: Date | null },
    userId: string,
  ): Promise<void> {
    const start = this.getStartOfWeek(new Date(leave.startDate));
    const end = this.getStartOfWeek(new Date(leave.endDate ?? leave.startDate));
    for (const weekStartDate = new Date(start); weekStartDate <= end; weekStartDate.setUTCDate(weekStartDate.getUTCDate() + 7)) {
      await this.prisma.schedulerWeek.upsert({
        where: { weekStartDate: new Date(weekStartDate) },
        create: {
          weekStartDate: new Date(weekStartDate),
          version: 1,
          isLocked: false,
          updatedBy: userId,
          lastPayloadHash: null,
        },
        update: {
          version: { increment: 1 },
          updatedBy: userId,
          lastPayloadHash: null,
        },
      });
    }
  }

  private normalizeStatus(status: string): string {
    const s = normalizeLeaveStatusUtil(status);
    if (
      s === 'APPROVED' ||
      s === 'REJECTED' ||
      s === 'PENDING' ||
      s === 'CANCELLED' ||
      s === 'REVOKED'
    ) {
      return s;
    }
    return status;
  }

  private toDateLabelFromDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private assertDatesOrThrow(startDateIso: string, endDateIso?: string): LeaveDateRange {
    const result = validateLeaveDates(startDateIso, endDateIso);
    if (!result.ok) {
      throw new BadRequestException(result.message);
    }
    return result.range;
  }

  private assertLeaveTypeOrThrow(type: string): string {
    const normalized = normalizeLeaveType(type);
    if (!normalized) {
      throw new BadRequestException('Leave type must be either Full Day or Half Day');
    }
    return normalized;
  }

  private assertLeaveTypeMatchesDuration(type: string, range: LeaveDateRange): void {
    if (
      type === LEAVE_TYPE_HALF_DAY &&
      this.toDateLabel(range.startDate) !== this.toDateLabel(range.endDate)
    ) {
      throw new BadRequestException('Half Day leave must start and end on the same date');
    }
  }

  private resolveHalfDaySessionOrThrow(type: string, session?: string | null): string | null {
    if (type !== LEAVE_TYPE_HALF_DAY) {
      return null;
    }
    const normalized = normalizeHalfDaySession(session);
    if (!normalized) {
      throw new BadRequestException('Half Day leave requires a session: First Half or Second Half');
    }
    return normalized;
  }

  private async assertNoOverlappingLeave(
    userId: string,
    range: LeaveDateRange,
    type: string,
    halfDaySession: string | null,
    excludeRequestId?: string,
  ): Promise<void> {
    const existing = await this.prisma.leaveRequest.findMany({
      where: { userId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        type: true,
        halfDaySession: true,
      },
    });

    const conflict = findOverlappingLeave(existing, range, excludeRequestId, type, halfDaySession);
    if (conflict) {
      throw new BadRequestException(overlapErrorMessage(conflict));
    }
  }

  private assertOwnerCanModifyPending(
    requesterId: string,
    role: UserRole,
    request: { userId: string; status: string },
  ): void {
    if (role !== UserRole.DESIGNER) {
      throw new ForbiddenException('Only designers can modify their own leave requests');
    }
    if (requesterId !== request.userId) {
      throw new ForbiddenException('You can only modify your own leave requests');
    }
    if (this.normalizeStatus(request.status) !== 'PENDING') {
      throw new BadRequestException(
        `Only pending leave requests can be modified (current status: ${this.normalizeStatus(request.status)})`,
      );
    }
  }

  private mapRequest(
    req: {
      id: string;
      userId: string;
      reason: string | null;
      startDate: Date;
      endDate: Date | null;
      status: string;
      type: string;
      halfDaySession?: string | null;
      createdAt: Date;
      approverId?: string | null;
      approverRemarks?: string | null;
      reviewedAt?: Date | null;
      revokedById?: string | null;
      revokedAt?: Date | null;
      revocationReason?: string | null;
      user: { fullName: string; role: { name: string } };
      approver?: { fullName: string } | null;
      revokedBy?: { fullName: string } | null;
    },
    designerIdOverride?: string,
  ): LeaveRequestView {
    const roleName = req.user.role.name;
    const type = normalizeLeaveType(req.type) ?? 'Full Day';
    const halfDaySession = type === LEAVE_TYPE_HALF_DAY
      ? normalizeHalfDaySession(req.halfDaySession) ?? null
      : null;
    const range = { startDate: req.startDate, endDate: req.endDate ?? req.startDate };
    const leaveDurationDays = calculateLeaveDurationDays(type, range);
    return {
      id: req.id,
      designerId: designerIdOverride ?? req.userId,
      requesterName: req.user.fullName,
      reason: req.reason,
      fromDate: this.toDateLabel(req.startDate),
      toDate: this.toDateLabel(req.endDate ?? req.startDate),
      status: this.normalizeStatus(req.status),
      type,
      halfDaySession,
      leaveDurationDays,
      leaveDurationLabel: formatLeaveDurationLabel(leaveDurationDays),
      createdBy: roleName === UserRole.HOD ? 'HOD' : 'Designer',
      approverId: req.approverId ?? null,
      approverName: req.approver?.fullName ?? null,
      approverRemarks: req.approverRemarks?.trim() || null,
      reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
      revokedById: req.revokedById ?? null,
      revokedByName: req.revokedBy?.fullName ?? null,
      revokedAt: req.revokedAt ? req.revokedAt.toISOString() : null,
      revocationReason: req.revocationReason?.trim() || null,
      createdAt: req.createdAt.toISOString(),
    };
  }

  private leaveInclude() {
    return {
      user: { select: { id: true, fullName: true, role: { select: { name: true } }, departmentId: true } },
      approver: { select: { id: true, fullName: true } },
      revokedBy: { select: { id: true, fullName: true } },
    } as const;
  }

  private leaveLink(id: string, userId?: string): string {
    const params = new URLSearchParams({ leaveId: id });
    if (userId?.trim()) params.set('forUserId', userId.trim());
    return `/designer/leave-planner?${params.toString()}`;
  }

  private async findDepartmentManagers(departmentId: string | null | undefined) {
    if (!departmentId?.trim()) return [];
    return this.prisma.user.findMany({
      where: {
        departmentId: departmentId.trim(),
        role: { name: { in: [UserRole.HOD, UserRole.SALESPERSON] } },
      },
      select: { id: true, fullName: true },
    });
  }

  private async findDepartmentHods(departmentId: string | null | undefined) {
    return this.findDepartmentManagers(departmentId);
  }

  private async resolveHodRecipientName(departmentId: string | null | undefined): Promise<string> {
    let targets = await this.findDepartmentHods(departmentId);
    if (targets.length === 0) {
      targets = await this.prisma.user.findMany({
        where: { role: { name: { in: [UserRole.HOD, UserRole.SALESPERSON] } } },
        select: { id: true, fullName: true },
        take: 1,
      });
    }
    return targets[0]?.fullName?.trim() || 'HOD';
  }

  private formatLeaveDates(from: string, to: string): string {
    return from === to ? from : `${from} to ${to}`;
  }

  private formatLeaveTypeAndDuration(
    view: Pick<LeaveRequestView, 'type' | 'halfDaySession' | 'leaveDurationLabel'>,
  ): string {
    const session = view.halfDaySession ? ` (${view.halfDaySession})` : '';
    return `${view.type}${session}, ${view.leaveDurationLabel}`;
  }

  private async notifyApproversOnCreate(view: LeaveRequestView) {
    const dates = this.formatLeaveDates(view.fromDate, view.toDate);
    const leaveDetails = this.formatLeaveTypeAndDuration(view);
    const messageBase = `Leave request ${view.id.slice(0, 8)}… for ${dates} (${leaveDetails}). Reason: ${view.reason ?? '—'}.`;

    const requester = await this.prisma.user.findUnique({
      where: { id: view.designerId },
      select: { departmentId: true },
    });
    let targets = await this.findDepartmentHods(requester?.departmentId);
    if (targets.length === 0) {
      targets = await this.prisma.user.findMany({
        where: { role: { name: { in: [UserRole.HOD, UserRole.SALESPERSON] } } },
        select: { id: true, fullName: true },
      });
    }

    for (const approver of targets) {
      if (approver.id === view.designerId) continue;
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: approver.id,
            title: 'New Leave Request',
            message: `${view.requesterName} submitted a leave request. ${messageBase}`,
            linkUrl: this.leaveLink(view.id, view.designerId),
          },
        });
      } catch (err) {
        this.logger.warn(`Leave approver notification failed for ${approver.id}: ${err}`);
      }
    }
  }

  private async notifyHodsOnLeaveChange(
    view: LeaveRequestView,
    title: string,
    actionVerb: string,
  ) {
    const dates = this.formatLeaveDates(view.fromDate, view.toDate);
    const leaveDetails = this.formatLeaveTypeAndDuration(view);
    const requester = await this.prisma.user.findUnique({
      where: { id: view.designerId },
      select: { departmentId: true },
    });
    let targets = await this.findDepartmentHods(requester?.departmentId);
    if (targets.length === 0) {
      targets = await this.prisma.user.findMany({
        where: { role: { name: { in: [UserRole.HOD, UserRole.SALESPERSON] } } },
        select: { id: true, fullName: true },
      });
    }

    for (const approver of targets) {
      if (approver.id === view.designerId) continue;
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: approver.id,
            title,
            message: `${view.requesterName} ${actionVerb} a leave request (${dates}, ${leaveDetails}). Reason: ${view.reason ?? '—'}.`,
            linkUrl: this.leaveLink(view.id, view.designerId),
          },
        });
      } catch (err) {
        this.logger.warn(`Leave HOD notification failed for ${approver.id}: ${err}`);
      }
    }
  }

  private async notifyRequesterOnRevoke(
    view: LeaveRequestView,
    revokerName: string,
    revokedAt: Date,
  ) {
    const dates = this.formatLeaveDates(view.fromDate, view.toDate);
    const leaveDetails = this.formatLeaveTypeAndDuration(view);
    const reason = view.revocationReason?.trim() || '—';

    try {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: view.designerId,
          title: 'Leave Request Revoked',
          message: `Your approved leave (${dates}, ${leaveDetails}) was revoked by ${revokerName}. Reason: ${reason}`,
          linkUrl: this.leaveLink(view.id, view.designerId),
        },
      });
    } catch (err) {
      this.logger.warn(`Leave revocation notification failed: ${err}`);
    }
  }

  private async notifyRequesterOnReview(
    view: LeaveRequestView,
    action: 'APPROVED' | 'REJECTED',
    reviewerName: string,
    reviewedAt: Date,
  ) {
    const actionLabel = action === 'APPROVED' ? 'Approved' : 'Rejected';
    const dates = this.formatLeaveDates(view.fromDate, view.toDate);
    const leaveDetails = this.formatLeaveTypeAndDuration(view);
    const timestamp = reviewedAt.toISOString();
    const remarks =
      action === 'REJECTED' && view.approverRemarks
        ? ` Remarks: "${view.approverRemarks}"`
        : '';

    try {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: view.designerId,
          title: `Leave Request ${actionLabel}`,
          message: `Leave ${view.id.slice(0, 8)}… (${dates}, ${leaveDetails}) was ${actionLabel.toLowerCase()} by ${reviewerName} at ${timestamp}.${remarks}`,
          linkUrl: this.leaveLink(view.id, view.designerId),
        },
      });
    } catch (err) {
      this.logger.warn(`Leave requester notification failed: ${err}`);
    }
  }

  private assertCreateAccess(submitterId: string, role: UserRole, targetUserId: string) {
    if (hasDepartmentManagerAccess(role)) {
      return;
    }
    if (role !== UserRole.DESIGNER) {
      throw new ForbiddenException('Only designers or department managers can submit leave requests');
    }
    if (submitterId !== targetUserId) {
      throw new ForbiddenException('You can only submit leave requests for yourself');
    }
  }

  private async assertReviewerAccess(
    reviewerId: string,
    role: UserRole,
    request: { userId: string; user: { role: { name: string }; departmentId: string | null } },
  ) {
    if (reviewerId === request.userId) {
      throw new ForbiddenException('You cannot approve or reject your own leave request');
    }

    const requesterRole = request.user.role.name;

    if (!hasDepartmentManagerAccess(role)) {
      throw new ForbiddenException('Only department managers can review leave requests');
    }

    if (requesterRole !== UserRole.DESIGNER) {
      throw new ForbiddenException('Only designer leave requests can be reviewed');
    }

    const [reviewer, requester] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: reviewerId }, select: { departmentId: true } }),
      Promise.resolve(request.user),
    ]);

    if (
      reviewer?.departmentId &&
      requester.departmentId &&
      reviewer.departmentId !== requester.departmentId
    ) {
      throw new ForbiddenException('You can only review leave requests from your department');
    }
  }

  private async assertRevokerAccess(
    revokerId: string,
    role: UserRole,
    request: { userId: string; user: { role: { name: string }; departmentId: string | null } },
  ) {
    if (!hasDepartmentManagerAccess(role)) {
      throw new ForbiddenException('Only HOD can revoke leave requests');
    }
    if (revokerId === request.userId) {
      return;
    }
    await this.assertReviewerAccess(revokerId, role, request);
  }

  async findAll(userId: string | undefined, requesterId: string, role: UserRole) {
    let resolvedId = userId;
    if (userId) {
      resolvedId = await this.resolveDummyId(userId);
    } else {
      resolvedId = requesterId;
    }

    if (!resolvedId) return [];

    if (role === UserRole.DESIGNER && resolvedId !== requesterId) {
      throw new ForbiddenException('You can only view your own leave requests');
    }
    if (hasDepartmentManagerAccess(role) && userId && resolvedId !== requesterId) {
      const target = await this.prisma.user.findUnique({
        where: { id: resolvedId },
        select: { role: { select: { name: true } } },
      });
      if (target?.role.name !== UserRole.DESIGNER) {
        throw new ForbiddenException('HOD can only view designer leave records for others');
      }
    }

    const requests = await this.prisma.leaveRequest.findMany({
      where: { userId: resolvedId },
      orderBy: { createdAt: 'desc' },
      include: this.leaveInclude(),
    });

    return requests.map((req) => this.mapRequest(req, userId || req.userId));
  }

  async findPendingApprovals(reviewerId: string, role: UserRole): Promise<LeaveRequestView[]> {
    if (!hasDepartmentManagerAccess(role)) {
      throw new ForbiddenException('Only HOD can view pending leave approvals');
    }

    const pending = await this.prisma.leaveRequest.findMany({
      where: {
        status: { in: ['Pending', 'PENDING', 'pending'] },
        user: { role: { name: UserRole.DESIGNER } },
      },
      orderBy: { createdAt: 'desc' },
      include: this.leaveInclude(),
    });

    const reviewer = await this.prisma.user.findUnique({
      where: { id: reviewerId },
      select: { departmentId: true },
    });

    return pending
      .filter((req) => {
        if (!reviewer?.departmentId || !req.user.departmentId) return true;
        return reviewer.departmentId === req.user.departmentId;
      })
      .map((req) => this.mapRequest(req));
  }

  async findTeamRequests(
    managerId: string,
    role: UserRole,
    filters?: { status?: string; designerId?: string },
  ): Promise<LeaveRequestView[]> {
    if (!hasDepartmentManagerAccess(role)) {
      throw new ForbiddenException('Only HOD can view team leave requests');
    }

    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { departmentId: true },
    });

    const designerScope: Prisma.LeaveRequestWhereInput['user'] = {
      role: { name: UserRole.DESIGNER },
      ...(manager?.departmentId ? { departmentId: manager.departmentId } : {}),
    };

    const where: Prisma.LeaveRequestWhereInput = {};

    if (filters?.status?.trim()) {
      where.status = filters.status.trim();
    }
    if (filters?.designerId?.trim() && this.isUuid(filters.designerId)) {
      where.userId = filters.designerId.trim();
    } else {
      // Include HOD self-leave alongside designers in the department.
      where.OR = [{ userId: managerId }, { user: designerScope }];
    }

    const requests = await this.prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: this.leaveInclude(),
    });

    return requests.map((req) => this.mapRequest(req));
  }

  async create(submitterId: string, role: UserRole, dto: CreateLeaveRequestDto) {
    const resolvedId = await this.resolveDummyId(dto.userId);
    this.assertCreateAccess(submitterId, role, resolvedId);

    const requester = await this.prisma.user.findUnique({
      where: { id: resolvedId },
      include: { role: { select: { name: true } } },
    });
    if (!requester) throw new BadRequestException('User not found');
    if (!this.isUuid(resolvedId)) {
      throw new BadRequestException('A valid user id is required to submit a leave request');
    }

    if (hasDepartmentManagerAccess(role) && resolvedId !== submitterId) {
      if (requester.role.name !== UserRole.DESIGNER) {
        throw new ForbiddenException('HOD can only apply leave on behalf of designers');
      }
    } else if (role === UserRole.DESIGNER && requester.role.name !== UserRole.DESIGNER) {
      throw new ForbiddenException('Only designers can submit leave requests');
    }

    let reason: string;
    try {
      reason = assertValidLeaveReason(dto.reasonCategory, dto.reasonOther);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid leave reason');
    }

    const type = this.assertLeaveTypeOrThrow(dto.type);
    const range = this.assertDatesOrThrow(dto.startDate, dto.endDate);
    this.assertLeaveTypeMatchesDuration(type, range);
    const halfDaySession = this.resolveHalfDaySessionOrThrow(type, dto.halfDaySession);
    await this.assertNoOverlappingLeave(resolvedId, range, type, halfDaySession);

    const hodAutoApprove = hasDepartmentManagerAccess(role);
    const status = hodAutoApprove ? 'Approved' : 'Pending';
    const reviewedAt = hodAutoApprove ? new Date() : undefined;

    const req = await this.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        userId: resolvedId,
        type,
        halfDaySession,
        startDate: range.startDate,
        endDate: range.endDate,
        reason,
        status,
        approverId: hodAutoApprove ? submitterId : null,
        approverRemarks: hodAutoApprove
          ? 'Auto-approved by system (HOD submission)'
          : null,
        reviewedAt,
      },
      include: this.leaveInclude(),
    });

    const view = this.mapRequest(req, dto.userId);

    const submitAction = hodAutoApprove
      ? ActivityAction.LEAVE_AUTO_APPROVED
      : ActivityAction.LEAVE_REQUEST_SUBMITTED;
    const submitMessageKey = hodAutoApprove
      ? 'leave_auto_approved'
      : 'leave_request_submitted';
    const submitter = hodAutoApprove
      ? await this.prisma.user.findUnique({
          where: { id: submitterId },
          select: { fullName: true },
        })
      : null;
    const recipientName = hodAutoApprove
      ? requester.fullName
      : await this.resolveHodRecipientName(requester.departmentId);

    await this.activityLogger.log({
      action: submitAction,
      userId: submitterId,
      details: {
        event: submitAction,
        messageKey: submitMessageKey,
        context: {
          requestId: req.id,
          type,
          halfDaySession,
          leaveDurationDays: calculateLeaveDurationDays(type, range),
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          beneficiaryUserId: resolvedId,
          autoApproved: hodAutoApprove,
          submittedByHod: hodAutoApprove,
          reasonCategory: dto.reasonCategory,
          requesterName: requester.fullName,
          designerName: requester.fullName,
          recipientName,
          approverName: submitter?.fullName ?? undefined,
          reviewerName: submitter?.fullName ?? undefined,
        },
      },
    });

    if (hodAutoApprove) {
      if (resolvedId !== submitterId) {
        await this.notifyRequesterOnReview(
          view,
          'APPROVED',
          submitter?.fullName ?? 'HOD',
          reviewedAt!,
        );
      }
      await this.schedulerAssignments?.rescheduleForApprovedLeave(req, submitterId);
      await this.touchSchedulerWeeksForLeave(req, submitterId);
      this.dashboardRealtime?.notifyOverviewRefresh('leave_approved', {
        affectedWeekStarts: this.weekStartKeysForLeave(req),
      });
      if (resolvedId) {
        this.dashboardRealtime?.notifyUserNotificationRefresh(resolvedId);
      }
    } else {
      await this.notifyApproversOnCreate(view);
    }

    return view;
  }

  async update(
    id: string,
    requesterId: string,
    role: UserRole,
    dto: UpdateLeaveRequestDto,
  ): Promise<LeaveRequestView> {
    const hasChange =
      dto.type !== undefined ||
      dto.halfDaySession !== undefined ||
      dto.startDate !== undefined ||
      dto.endDate !== undefined ||
      dto.reason !== undefined;
    if (!hasChange) {
      throw new BadRequestException('At least one field must be provided to update a leave request');
    }

    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: this.leaveInclude(),
    });
    if (!existing) throw new NotFoundException('Leave request not found');

    this.assertOwnerCanModifyPending(requesterId, role, existing);

    const nextType = this.assertLeaveTypeOrThrow(dto.type ?? existing.type);
    const nextHalfDaySession = this.resolveHalfDaySessionOrThrow(
      nextType,
      dto.halfDaySession !== undefined ? dto.halfDaySession : existing.halfDaySession,
    );
    const nextReason = dto.reason !== undefined ? dto.reason.trim() : existing.reason?.trim() ?? '';
    const nextStartIso =
      dto.startDate ?? this.toDateLabelFromDate(existing.startDate);
    const nextEndIso =
      dto.endDate ??
      this.toDateLabelFromDate(existing.endDate ?? existing.startDate);

    if (!nextReason) {
      throw new BadRequestException('Reason is required for leave requests');
    }

    const range = this.assertDatesOrThrow(nextStartIso, nextEndIso);
    this.assertLeaveTypeMatchesDuration(nextType, range);
    await this.assertNoOverlappingLeave(existing.userId, range, nextType, nextHalfDaySession, id);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const existingType = this.assertLeaveTypeOrThrow(existing.type);
    const existingHalfDaySession =
      existingType === LEAVE_TYPE_HALF_DAY ? normalizeHalfDaySession(existing.halfDaySession) : null;
    if (existingType !== nextType) changes.type = { from: existingType, to: nextType };
    if (existingHalfDaySession !== nextHalfDaySession) {
      changes.halfDaySession = { from: existingHalfDaySession, to: nextHalfDaySession };
    }
    if ((existing.reason ?? '') !== nextReason) changes.reason = { from: existing.reason, to: nextReason };
    if (existing.startDate.getTime() !== range.startDate.getTime()) {
      changes.startDate = { from: this.toDateLabel(existing.startDate), to: nextStartIso };
    }
    const prevEnd = existing.endDate ?? existing.startDate;
    if (prevEnd.getTime() !== range.endDate.getTime()) {
      changes.endDate = {
        from: this.toDateLabel(prevEnd),
        to: nextEndIso,
      };
    }

    const req = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        type: nextType,
        halfDaySession: nextHalfDaySession,
        reason: nextReason,
        startDate: range.startDate,
        endDate: range.endDate,
      },
      include: this.leaveInclude(),
    });

    const view = this.mapRequest(req);

    await this.activityLogger.log({
      action: ActivityAction.LEAVE_REQUEST_UPDATED,
      userId: existing.userId,
      details: {
        event: ActivityAction.LEAVE_REQUEST_UPDATED,
        messageKey: 'leave_request_updated',
        changes,
        context: {
          requestId: id,
          halfDaySession: nextHalfDaySession,
          leaveDurationDays: calculateLeaveDurationDays(nextType, range),
          requesterName: existing.user.fullName,
          designerName: existing.user.fullName,
          recipientName: existing.approver?.fullName ?? 'HOD',
        },
      },
    });

    if (Object.keys(changes).length > 0) {
      await this.notifyHodsOnLeaveChange(view, 'Leave Request Updated', 'updated');
    }

    return view;
  }

  async cancel(id: string, requesterId: string, role: UserRole): Promise<LeaveRequestView> {
    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: this.leaveInclude(),
    });
    if (!existing) throw new NotFoundException('Leave request not found');

    if (role !== UserRole.DESIGNER) {
      throw new ForbiddenException('Only designers can cancel their own leave requests');
    }
    if (requesterId !== existing.userId) {
      throw new ForbiddenException('You can only cancel your own leave requests');
    }

    const currentStatus = this.normalizeStatus(existing.status);
    if (currentStatus === 'CANCELLED') {
      throw new BadRequestException('Leave request is already cancelled');
    }
    if (currentStatus === 'APPROVED') {
      throw new BadRequestException(
        'Approved leave requests cannot be cancelled. Contact your HOD if changes are required.',
      );
    }
    if (currentStatus === 'REJECTED') {
      throw new BadRequestException('Rejected leave requests cannot be cancelled');
    }
    if (currentStatus !== 'PENDING') {
      throw new BadRequestException(`Leave request cannot be cancelled (status: ${currentStatus})`);
    }

    const req = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.leaveInclude(),
    });

    const view = this.mapRequest({ ...req, status: 'CANCELLED' });

    await this.activityLogger.log({
      action: ActivityAction.LEAVE_REQUEST_CANCELLED,
      userId: existing.userId,
      details: {
        event: ActivityAction.LEAVE_REQUEST_CANCELLED,
        messageKey: 'leave_request_cancelled',
        changes: { status: { from: existing.status, to: 'CANCELLED' } },
        context: {
          requestId: id,
          requesterName: existing.user.fullName,
          designerName: existing.user.fullName,
          recipientName: existing.approver?.fullName ?? 'HOD',
        },
      },
    });

    await this.notifyHodsOnLeaveChange(view, 'Leave Request Cancelled', 'cancelled');

    return view;
  }

  async review(id: string, reviewerId: string, role: UserRole, dto: ReviewLeaveRequestDto) {
    const status = this.normalizeStatus(dto.status);
    if (status !== 'APPROVED' && status !== 'REJECTED') {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }
    if (status === 'REJECTED' && !dto.remarks?.trim()) {
      throw new BadRequestException('Remarks are required when rejecting a leave request');
    }

    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: this.leaveInclude(),
    });
    if (!existing) throw new NotFoundException('Leave request not found');

    const currentStatus = this.normalizeStatus(existing.status);
    if (currentStatus === 'CANCELLED') {
      throw new BadRequestException('Cancelled leave requests cannot be reviewed');
    }
    if (currentStatus !== 'PENDING') {
      throw new BadRequestException(`Leave request is already ${currentStatus}`);
    }

    await this.assertReviewerAccess(reviewerId, role, existing);

    const reviewedAt = new Date();
    const approverRemarks = dto.remarks?.trim() || null;

    if (status === 'APPROVED') {
      await this.schedulerAssignments?.rescheduleForApprovedLeave(existing, reviewerId);
    }

    const req = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        approverId: reviewerId,
        approverRemarks,
        reviewedAt,
      },
      include: this.leaveInclude(),
    });

    const view = this.mapRequest(req);

    await this.activityLogger.log({
      action: ActivityAction.LEAVE_REQUEST_STATUS_CHANGED,
      userId: reviewerId,
      details: {
        event: ActivityAction.LEAVE_REQUEST_STATUS_CHANGED,
        messageKey: 'leave_request_status_changed',
        changes: { newStatus: status, approverId: reviewerId },
        context: {
          requestId: id,
          requesterName: existing.user.fullName,
          designerName: existing.user.fullName,
          recipientName: req.approver?.fullName ?? 'HOD',
          approverName: req.approver?.fullName ?? undefined,
          reviewerName: req.approver?.fullName ?? undefined,
        },
      },
    });

    await this.notifyRequesterOnReview(
      view,
      status as 'APPROVED' | 'REJECTED',
      req.approver?.fullName ?? 'Approver',
      reviewedAt,
    );

    if (status === 'APPROVED') {
      await this.touchSchedulerWeeksForLeave(req, reviewerId);
    }
    this.dashboardRealtime?.notifyOverviewRefresh(
      status === 'APPROVED' ? 'leave_approved' : 'leave_rejected',
      status === 'APPROVED' ? { affectedWeekStarts: this.weekStartKeysForLeave(req) } : {},
    );
    this.dashboardRealtime?.notifyUserNotificationRefresh(req.userId);

    return view;
  }

  async updateStatus(id: string, reviewerId: string, role: UserRole, dto: UpdateRequestStatusDto) {
    return this.review(id, reviewerId, role, {
      status: dto.status,
      remarks: dto.status === 'REJECTED' ? 'Rejected' : undefined,
    });
  }

  async revoke(
    id: string,
    reviewerId: string,
    role: UserRole,
    dto: RevokeLeaveRequestDto,
  ): Promise<LeaveRequestView> {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A revocation reason is required');
    }

    const existing = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: this.leaveInclude(),
    });
    if (!existing) throw new NotFoundException('Leave request not found');

    const currentStatus = this.normalizeStatus(existing.status);
    if (currentStatus === 'REVOKED') {
      throw new BadRequestException('Leave request is already revoked');
    }
    if (currentStatus !== 'APPROVED') {
      throw new BadRequestException(
        `Only approved leave requests can be revoked (current status: ${currentStatus})`,
      );
    }

    const endIso = this.toDateLabel(existing.endDate ?? existing.startDate);
    if (isLeaveRangeCompleted(endIso, todayDateOnlyIso())) {
      throw new BadRequestException('Past or completed leave requests cannot be revoked');
    }

    await this.assertRevokerAccess(reviewerId, role, existing);

    const revoker = await this.prisma.user.findUnique({
      where: { id: reviewerId },
      select: { fullName: true },
    });

    await this.schedulerAssignments?.rescheduleAfterLeaveRevocation?.(existing, reviewerId);

    const revokedAt = new Date();
    const req = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedById: reviewerId,
        revokedAt,
        revocationReason: reason,
      } as Prisma.LeaveRequestUncheckedUpdateInput,
      include: this.leaveInclude(),
    });

    const view = this.mapRequest({
      ...req,
      user: existing.user,
      revokedBy: revoker ? { fullName: revoker.fullName } : null,
    });

    await this.activityLogger.log({
      action: ActivityAction.LEAVE_REQUEST_REVOKED,
      userId: reviewerId,
      details: {
        event: ActivityAction.LEAVE_REQUEST_REVOKED,
        messageKey: 'leave_request_revoked',
        changes: {
          status: { from: existing.status, to: 'REVOKED' },
          revokedById: reviewerId,
          revocationReason: reason,
        },
        context: {
          requestId: id,
          designerId: existing.userId,
          designerName: existing.user.fullName,
          requesterName: existing.user.fullName,
          revokedAt: revokedAt.toISOString(),
          revokerName: revoker?.fullName ?? 'HOD',
          reviewerName: revoker?.fullName ?? 'HOD',
        },
      },
    });

    await this.notifyRequesterOnRevoke(
      view,
      revoker?.fullName ?? 'HOD',
      revokedAt,
    );

    await this.touchSchedulerWeeksForLeave(existing, reviewerId);
    this.dashboardRealtime?.notifyOverviewRefresh('leave_revoked', {
      affectedWeekStarts: this.weekStartKeysForLeave(existing),
    });
    this.dashboardRealtime?.notifyUserNotificationRefresh(existing.userId);

    return view;
  }
}
