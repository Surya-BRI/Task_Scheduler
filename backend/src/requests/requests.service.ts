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
import { hasHrApproverAccess } from '../common/utils/workflow-roles.util';
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

// designerId/userId (ERP ErpAuthUsers.userId) is now a decimal bigint, not a GUID.
const NUMERIC_ID_RE = /^\d+$/;

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
    return Boolean(value?.trim() && NUMERIC_ID_RE.test(value.trim()));
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
    const user = await this.prisma.erpUser.findFirst({ where: { userName: name } });
    if (user) return user.userId.toString();

    const fallback = await this.prisma.erpUser.findFirst();
    return fallback ? fallback.userId.toString() : dummyId;
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
      where: { userId: BigInt(userId) },
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
    request: { userId: bigint; status: string },
  ): void {
    if (role !== UserRole.DESIGNER) {
      throw new ForbiddenException('Only designers can modify their own leave requests');
    }
    if (BigInt(requesterId) !== request.userId) {
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
      userId: bigint;
      reason: string | null;
      startDate: Date;
      endDate: Date | null;
      status: string;
      type: string;
      halfDaySession?: string | null;
      createdAt: Date;
      approverId?: bigint | null;
      approverRemarks?: string | null;
      reviewedAt?: Date | null;
      revokedById?: bigint | null;
      revokedAt?: Date | null;
      revocationReason?: string | null;
      user: { userName: string };
      approver?: { userName: string } | null;
      revokedBy?: { userName: string } | null;
    },
    designerIdOverride?: string,
  ): LeaveRequestView {
    const type = normalizeLeaveType(req.type) ?? 'Full Day';
    const halfDaySession = type === LEAVE_TYPE_HALF_DAY
      ? normalizeHalfDaySession(req.halfDaySession) ?? null
      : null;
    const range = { startDate: req.startDate, endDate: req.endDate ?? req.startDate };
    const leaveDurationDays = calculateLeaveDurationDays(type, range);
    return {
      id: req.id,
      designerId: designerIdOverride ?? req.userId.toString(),
      requesterName: req.user.userName,
      reason: req.reason,
      fromDate: this.toDateLabel(req.startDate),
      toDate: this.toDateLabel(req.endDate ?? req.startDate),
      status: this.normalizeStatus(req.status),
      type,
      halfDaySession,
      leaveDurationDays,
      leaveDurationLabel: formatLeaveDurationLabel(leaveDurationDays),
      createdBy: 'Designer',
      approverId: req.approverId != null ? req.approverId.toString() : null,
      approverName: req.approver?.userName ?? null,
      approverRemarks: req.approverRemarks?.trim() || null,
      reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
      revokedById: req.revokedById != null ? req.revokedById.toString() : null,
      revokedByName: req.revokedBy?.userName ?? null,
      revokedAt: req.revokedAt ? req.revokedAt.toISOString() : null,
      revocationReason: req.revocationReason?.trim() || null,
      createdAt: req.createdAt.toISOString(),
    };
  }

  private leaveInclude() {
    return {
      user: { select: { userId: true, userName: true } },
      approver: { select: { userId: true, userName: true } },
      revokedBy: { select: { userId: true, userName: true } },
    } as const;
  }

  private leaveLink(id: string, userId?: string, forManager = false): string {
    const params = new URLSearchParams({ leaveId: id });
    if (userId?.trim()) params.set('forUserId', userId.trim());
    const base = forManager ? '/hod/leave-planner' : '/designer/leave-planner';
    return `${base}?${params.toString()}`;
  }

  // ERP no longer has a department concept on its user table, so HOD lookup
  // can no longer be scoped by department — it now resolves every active HOD
  // via ERP's own role-mapping tables (mirrors UsersService.validateErpLogin).
  private async findDepartmentHods(
    _departmentId?: string | null,
  ): Promise<{ id: string; fullName: string }[]> {
    const rows = await this.prisma.$queryRaw<{ userId: bigint; userName: string }[]>`
      SELECT DISTINCT u.userId, u.userName
      FROM ErpAuthUsers u
      JOIN ErpAuthUserRoleMap m ON m.userId = u.userId AND m.isActive = 1
      JOIN ErpMasterRole r ON r.roleId = m.roleId AND r.isActive = 1 AND r.isDeleted = 0
      WHERE u.isActive = 1 AND u.isDeleted = 0 AND r.roleName IN ('Design HOD', 'Design Head')
    `;
    return rows.map((row) => ({ id: row.userId.toString(), fullName: row.userName }));
  }

  private async resolveHodRecipientName(_departmentId?: string | null): Promise<string> {
    const targets = await this.findDepartmentHods();
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

    const targets = await this.findDepartmentHods();

    for (const approver of targets) {
      if (approver.id === view.designerId) continue;
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: BigInt(approver.id),
            title: 'New Leave Request',
            message: `${view.requesterName} submitted a leave request. ${messageBase}`,
            linkUrl: this.leaveLink(view.id, view.designerId, true),
          },
        });
        this.dashboardRealtime?.notifyUserNotificationRefresh(approver.id);
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
    const targets = await this.findDepartmentHods();

    for (const approver of targets) {
      if (approver.id === view.designerId) continue;
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: BigInt(approver.id),
            title,
            message: `${view.requesterName} ${actionVerb} a leave request (${dates}, ${leaveDetails}). Reason: ${view.reason ?? '—'}.`,
            linkUrl: this.leaveLink(view.id, view.designerId, true),
          },
        });
        this.dashboardRealtime?.notifyUserNotificationRefresh(approver.id);
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
          userId: BigInt(view.designerId),
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
          userId: BigInt(view.designerId),
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
    if (hasHrApproverAccess(role)) {
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
    request: { userId: bigint },
  ) {
    if (BigInt(reviewerId) === request.userId) {
      throw new ForbiddenException('You cannot approve or reject your own leave request');
    }

    if (!hasHrApproverAccess(role)) {
      throw new ForbiddenException('Only department managers can review leave requests');
    }

    // ERP's user table no longer carries a role or department, so the
    // requester-is-a-designer and same-department checks that used to run
    // here can no longer be evaluated and have been dropped.
  }

  private async assertRevokerAccess(
    revokerId: string,
    role: UserRole,
    request: { userId: bigint },
  ) {
    if (!hasHrApproverAccess(role)) {
      throw new ForbiddenException('Only HOD can revoke leave requests');
    }
    if (BigInt(revokerId) === request.userId) {
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
    // ERP's user table no longer carries a role, so the "HOD can only view
    // designer records" check that used to run here can no longer be
    // evaluated and has been dropped.

    const requests = await this.prisma.leaveRequest.findMany({
      where: { userId: BigInt(resolvedId) },
      orderBy: { createdAt: 'desc' },
      include: this.leaveInclude(),
    });

    return requests.map((req) => this.mapRequest(req, userId || req.userId.toString()));
  }

  async findPendingApprovals(reviewerId: string, role: UserRole): Promise<LeaveRequestView[]> {
    if (!hasHrApproverAccess(role)) {
      throw new ForbiddenException('Only HOD can view pending leave approvals');
    }

    // ERP's user table no longer carries a role or department, so pending
    // approvals can no longer be scoped to designer-only / same-department
    // requesters — those filters have been dropped.
    const pending = await this.prisma.leaveRequest.findMany({
      where: {
        status: { in: ['Pending', 'PENDING', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
      include: this.leaveInclude(),
    });

    return pending.map((req) => this.mapRequest(req));
  }

  async findTeamRequests(
    managerId: string,
    role: UserRole,
    filters?: { status?: string; designerId?: string; from?: string; to?: string },
  ): Promise<LeaveRequestView[]> {
    if (!hasHrApproverAccess(role)) {
      throw new ForbiddenException('Only HOD can view team leave requests');
    }

    // ERP's user table no longer carries a role or department, so team
    // requests can no longer be scoped to designer-only / same-department
    // requesters — those filters have been dropped; all leave requests
    // (optionally narrowed by the filters below) are now visible to HODs.
    const where: Prisma.LeaveRequestWhereInput = {};

    if (filters?.status?.trim()) {
      where.status = filters.status.trim();
    }
    if (filters?.designerId?.trim() && /^\d+$/.test(filters.designerId.trim())) {
      where.userId = BigInt(filters.designerId.trim());
    }

    const from = String(filters?.from ?? '').trim();
    const to = String(filters?.to ?? '').trim();
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : null;
    const toDate = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999Z`) : null;
    if (fromDate || toDate) {
      // Overlap: leave starts on/before range end AND ends on/after range start (or open-ended).
      const rangeAnd: Prisma.LeaveRequestWhereInput[] = [];
      if (toDate) rangeAnd.push({ startDate: { lte: toDate } });
      if (fromDate) {
        rangeAnd.push({
          OR: [{ endDate: null }, { endDate: { gte: fromDate } }],
        });
      }
      where.AND = [...((where.AND as Prisma.LeaveRequestWhereInput[] | undefined) ?? []), ...rangeAnd];
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

    if (!/^\d+$/.test(resolvedId)) {
      throw new BadRequestException('A valid user id is required to submit a leave request');
    }
    const requester = await this.prisma.erpUser.findUnique({
      where: { userId: BigInt(resolvedId) },
    });
    if (!requester) throw new BadRequestException('User not found');

    // ERP's user table no longer carries a role, so the "HOD can only apply
    // leave on behalf of designers" / "only designers can submit" checks
    // that used to run here can no longer be evaluated and have been dropped.

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

    const hodAutoApprove = hasHrApproverAccess(role);
    const status = hodAutoApprove ? 'Approved' : 'Pending';
    const reviewedAt = hodAutoApprove ? new Date() : undefined;

    const req = await this.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        userId: BigInt(resolvedId),
        type,
        halfDaySession,
        startDate: range.startDate,
        endDate: range.endDate,
        reason,
        status,
        approverId: hodAutoApprove ? BigInt(submitterId) : null,
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
      ? await this.prisma.erpUser.findUnique({
          where: { userId: BigInt(submitterId) },
        })
      : null;
    const recipientName = hodAutoApprove
      ? requester.userName
      : await this.resolveHodRecipientName();

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
          requesterName: requester.userName,
          designerName: requester.userName,
          recipientName,
          approverName: submitter?.userName ?? undefined,
          reviewerName: submitter?.userName ?? undefined,
        },
      },
    });

    if (hodAutoApprove) {
      if (resolvedId !== submitterId) {
        await this.notifyRequesterOnReview(
          view,
          'APPROVED',
          submitter?.userName ?? 'HOD',
          reviewedAt!,
        );
      }
      const leaveForScheduler = { ...req, userId: req.userId.toString() };
      await this.schedulerAssignments?.rescheduleForApprovedLeave(leaveForScheduler, submitterId);
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
    await this.assertNoOverlappingLeave(existing.userId.toString(), range, nextType, nextHalfDaySession, id);

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
      userId: existing.userId.toString(),
      details: {
        event: ActivityAction.LEAVE_REQUEST_UPDATED,
        messageKey: 'leave_request_updated',
        changes,
        context: {
          requestId: id,
          halfDaySession: nextHalfDaySession,
          leaveDurationDays: calculateLeaveDurationDays(nextType, range),
          requesterName: existing.user.userName,
          designerName: existing.user.userName,
          recipientName: existing.approver?.userName ?? 'HOD',
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
    if (BigInt(requesterId) !== existing.userId) {
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
      userId: existing.userId.toString(),
      details: {
        event: ActivityAction.LEAVE_REQUEST_CANCELLED,
        messageKey: 'leave_request_cancelled',
        changes: { status: { from: existing.status, to: 'CANCELLED' } },
        context: {
          requestId: id,
          requesterName: existing.user.userName,
          designerName: existing.user.userName,
          recipientName: existing.approver?.userName ?? 'HOD',
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
      const leaveForScheduler = { ...existing, userId: existing.userId.toString() };
      await this.schedulerAssignments?.rescheduleForApprovedLeave(leaveForScheduler, reviewerId);
    }

    const req = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        approverId: BigInt(reviewerId),
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
          requesterName: existing.user.userName,
          designerName: existing.user.userName,
          recipientName: req.approver?.userName ?? 'HOD',
          approverName: req.approver?.userName ?? undefined,
          reviewerName: req.approver?.userName ?? undefined,
        },
      },
    });

    await this.notifyRequesterOnReview(
      view,
      status as 'APPROVED' | 'REJECTED',
      req.approver?.userName ?? 'Approver',
      reviewedAt,
    );

    if (status === 'APPROVED') {
      await this.touchSchedulerWeeksForLeave(req, reviewerId);
    }
    this.dashboardRealtime?.notifyOverviewRefresh(
      status === 'APPROVED' ? 'leave_approved' : 'leave_rejected',
      status === 'APPROVED' ? { affectedWeekStarts: this.weekStartKeysForLeave(req) } : {},
    );
    this.dashboardRealtime?.notifyUserNotificationRefresh(req.userId.toString());

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

    const revoker = await this.prisma.erpUser.findUnique({
      where: { userId: BigInt(reviewerId) },
    });

    const leaveForScheduler = { ...existing, userId: existing.userId.toString() };
    await this.schedulerAssignments?.rescheduleAfterLeaveRevocation?.(leaveForScheduler, reviewerId);

    const revokedAt = new Date();
    const req = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedById: BigInt(reviewerId),
        revokedAt,
        revocationReason: reason,
      } as Prisma.LeaveRequestUncheckedUpdateInput,
      include: this.leaveInclude(),
    });

    const view = this.mapRequest({
      ...req,
      user: existing.user,
      revokedBy: revoker ? { userName: revoker.userName } : null,
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
          designerId: existing.userId.toString(),
          designerName: existing.user.userName,
          requesterName: existing.user.userName,
          revokedAt: revokedAt.toISOString(),
          revokerName: revoker?.userName ?? 'HOD',
          reviewerName: revoker?.userName ?? 'HOD',
        },
      },
    });

    await this.notifyRequesterOnRevoke(
      view,
      revoker?.userName ?? 'HOD',
      revokedAt,
    );

    await this.touchSchedulerWeeksForLeave(existing, reviewerId);
    this.dashboardRealtime?.notifyOverviewRefresh('leave_revoked', {
      affectedWeekStarts: this.weekStartKeysForLeave(existing),
    });
    this.dashboardRealtime?.notifyUserNotificationRefresh(existing.userId.toString());

    return view;
  }
}
