import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { shouldRunRuntimeSchemaBootstrap } from '../common/utils/runtime-schema-bootstrap.util';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { SaveSchedulerWeekDto } from './dto/save-scheduler-week.dto';
import { UserRole } from '../common/constants/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import {
  LEAVE_TYPE_HALF_DAY,
  normalizeHalfDaySession,
  normalizeLeaveType,
} from '../requests/leave-request.validation';

type RawAssignmentRow = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: string | number | null;
  scheduledHours?: string | number | null;
  approvedOvertimeHours?: string | number | null;
  parentId: string | null;
  splitIndex: number | null;
  totalParts: number | null;
  weekStartDate: Date;
  weekEndDate: Date;
  notes: string | null;
  isLocked: boolean | number | null;
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  overtimeRequestIds?: string[];
  requestType?: 'LEAVE' | 'REGULARIZATION' | 'OVERTIME' | null;
  isSystemBlock?: boolean;
  leaveRequestIds?: string[];
  leaveHours?: string | number | null;
  leaveSession?: string | null;
  regularizationRequestIds?: string[];
  regularizationHours?: string | number | null;
  requestStatus?: string | null;
  requestLabel?: string | null;
};

export type SchedulerAssignmentDto = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: number;
  scheduledHours: number;
  approvedOvertimeHours: number;
  parentId: string | null;
  splitIndex: number | null;
  totalParts: number | null;
  weekStartDate: string;
  weekEndDate: string;
  notes: string | null;
  isLocked: boolean;
  assignedBy: string | null;
  createdAt: string;
  updatedAt: string;
  overtimeRequestIds: string[];
  requestType: 'LEAVE' | 'REGULARIZATION' | 'OVERTIME' | null;
  isSystemBlock: boolean;
  leaveRequestIds: string[];
  leaveHours: number;
  leaveSession: string | null;
  regularizationRequestIds: string[];
  regularizationHours: number;
  requestStatus: string | null;
  requestLabel: string | null;
};

type SchedulerWeekMetaDto = {
  weekStart: string;
  version: number;
  isLocked: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

const DAILY_CAPACITY = 8;
const MAX_DAILY_HOURS = 12;

type LeaveRescheduleSnapshotRow = {
  assignmentId: string;
  originalJson: string;
};

@Injectable()
export class SchedulerAssignmentsService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerAssignmentsService.name);
  private snapshotTableReady = false;

  constructor(
    private readonly prisma: PrismaService,
    _config: ConfigService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!shouldRunRuntimeSchemaBootstrap()) {
      this.snapshotTableReady = true;
      this.logger.debug('Skipping scheduler runtime DDL (use prisma migrate deploy)');
      return;
    }
    try {
      // security-sql:allow-static-ddl
      await this.prisma.$executeRawUnsafe(`
        IF OBJECT_ID('dbo.ErpTSHoliday', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.ErpTSHoliday (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ErpTSHoliday PRIMARY KEY DEFAULT (newid()),
            [date] DATE NOT NULL,
            [name] NVARCHAR(255) NULL,
            createdAt DATETIME2 NOT NULL CONSTRAINT DF_ErpTSHoliday_createdAt DEFAULT (sysutcdatetime()),
            updatedAt DATETIME2 NOT NULL CONSTRAINT DF_ErpTSHoliday_updatedAt DEFAULT (sysutcdatetime()),
            CONSTRAINT UQ_ErpTSHoliday_date UNIQUE ([date])
          );
        END
      `);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not ensure holiday calendar table: ${detail}`);
    }

    try {
      // security-sql:allow-static-ddl
      await this.prisma.$executeRawUnsafe(`
        IF OBJECT_ID('dbo.ErpTSLeaveRescheduleSnapshot', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.ErpTSLeaveRescheduleSnapshot (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ErpTSLeaveRescheduleSnapshot PRIMARY KEY DEFAULT (newid()),
            leaveRequestId UNIQUEIDENTIFIER NOT NULL,
            assignmentId UNIQUEIDENTIFIER NOT NULL,
            originalJson NVARCHAR(MAX) NOT NULL,
            createdAt DATETIME2 NOT NULL CONSTRAINT DF_ErpTSLeaveRescheduleSnapshot_createdAt DEFAULT (sysutcdatetime()),
            restoredAt DATETIME2 NULL
          );
          CREATE UNIQUE INDEX UX_ErpTSLeaveRescheduleSnapshot_leave_assignment
            ON dbo.ErpTSLeaveRescheduleSnapshot (leaveRequestId, assignmentId);
        END
      `);
      this.snapshotTableReady = true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Leave reschedule snapshot table unavailable — leave approval/revocation will fail. Cause: ${detail}`,
      );
    }
  }

  private fail(context: string, err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`${context}: ${msg}`);
    throw new HttpException(`${context}: ${msg}`, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private toIso(d: Date | null | undefined): string {
    if (d == null || isNaN(new Date(d).getTime())) return new Date(0).toISOString();
    return new Date(d).toISOString();
  }

  private toHours(value: unknown): number {
    if (value == null) return 0;
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(n) ? n : 0;
  }

  private toBool(value: boolean | number | null | undefined): boolean {
    if (value === true || value === 1) return true;
    return false;
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

  private dateForDayIndex(weekStartDate: Date, dayIndex: number): Date {
    const d = new Date(weekStartDate);
    d.setUTCDate(d.getUTCDate() + dayIndex);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private sameUtcDate(a: Date, b: Date): boolean {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }

  private dateInUtcRange(date: Date, start: Date, end: Date): boolean {
    const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return d >= s && d <= e;
  }

  private parseDurationHours(value: string | null | undefined): number {
    if (!value) return 0;
    const text = String(value).trim().toLowerCase();
    if (!text) return 0;

    const hhmm = text.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      const hours = Number(hhmm[1]);
      const minutes = Number(hhmm[2]);
      return Number.isFinite(hours) && Number.isFinite(minutes) ? hours + minutes / 60 : 0;
    }

    const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
    if (!numberMatch) return 0;
    const parsed = Number(numberMatch[1]);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private weekStartForDate(date: Date): Date {
    const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = temp.getUTCDay();
    const diff = temp.getUTCDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), diff));
    weekStart.setUTCHours(0, 0, 0, 0);
    return weekStart;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private dateKey(date: Date): string {
    return this.startOfUtcDay(date).toISOString().slice(0, 10);
  }

  private addUtcDays(date: Date, days: number): Date {
    const next = this.startOfUtcDay(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private maxUtcDate(a: Date, b: Date): Date {
    return a.getTime() >= b.getTime() ? new Date(a) : new Date(b);
  }

  private weekEndForWeekStart(weekStartDate: Date): Date {
    return this.addUtcDays(weekStartDate, 6);
  }

  private isWeekend(date: Date): boolean {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
  }

  private assignmentDate(row: { weekStartDate: Date | null; dayIndex: number | null }): Date | null {
    if (!row.weekStartDate || row.dayIndex == null) return null;
    return this.dateForDayIndex(new Date(row.weekStartDate), Number(row.dayIndex));
  }

  private leaveHoursForDate(
    leave: { type: string | null; startDate: Date; endDate: Date | null },
    date: Date,
  ): number {
    if (!this.dateInUtcRange(date, leave.startDate, leave.endDate ?? leave.startDate)) return 0;
    const type = normalizeLeaveType(leave.type ?? '') ?? 'Full Day';
    return type === LEAVE_TYPE_HALF_DAY && this.sameUtcDate(leave.startDate, leave.endDate ?? leave.startDate)
      ? 4
      : DAILY_CAPACITY;
  }

  private async loadHolidayKeys(
    tx: { $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> },
    start: Date,
    end: Date,
  ): Promise<Set<string>> {
    const rows = await tx.$queryRaw<Array<{ date: Date | string }>>`
      SELECT [date] AS [date]
      FROM dbo.ErpTSHoliday
      WHERE [date] >= ${start} AND [date] <= ${end}
    `;
    return new Set(rows.map((row) => this.dateKey(new Date(row.date))));
  }

  private async touchSchedulerWeek(weekStartDate: Date, userId: string): Promise<void> {
    await this.prisma.schedulerWeek.upsert({
      where: { weekStartDate },
      create: {
        weekStartDate,
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

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value ?? '').trim(),
    );
  }

  private parseWeekStart(weekStart: string): { weekStartDate: Date; weekEndDate: Date } {
    const trimmed = weekStart.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('weekStart must be YYYY-MM-DD.');
    }
    const ws = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(ws.getTime())) {
      throw new BadRequestException('Invalid weekStart date.');
    }
    const weekEndDate = new Date(ws);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    return { weekStartDate: ws, weekEndDate };
  }

  private mapRow(row: RawAssignmentRow): SchedulerAssignmentDto {
    const parentId = row.parentId?.trim() ? row.parentId.trim() : null;
    const assignedBy = row.assignedBy?.trim() ? row.assignedBy.trim() : null;
    const assignedHours = this.toHours(row.assignedHours);
    const scheduledHours = row.scheduledHours == null ? assignedHours : this.toHours(row.scheduledHours);
    const approvedOvertimeHours = this.toHours(row.approvedOvertimeHours);
    const requestType = row.requestType ?? null;
    return {
      id: row.id,
      designerId: String(row.designerId ?? '').trim(),
      taskId: String(row.taskId ?? '').trim(),
      dayIndex: Number(row.dayIndex),
      assignedHours,
      scheduledHours,
      approvedOvertimeHours,
      parentId,
      splitIndex: row.splitIndex == null ? null : Number(row.splitIndex),
      totalParts: row.totalParts == null ? null : Number(row.totalParts),
      weekStartDate: this.toIso(row.weekStartDate ? new Date(row.weekStartDate) : null),
      weekEndDate: this.toIso(row.weekEndDate ? new Date(row.weekEndDate) : null),
      notes: row.notes ?? null,
      isLocked: this.toBool(row.isLocked),
      assignedBy,
      createdAt: this.toIso(row.createdAt ? new Date(row.createdAt) : null),
      updatedAt: this.toIso(row.updatedAt ? new Date(row.updatedAt) : null),
      overtimeRequestIds: row.overtimeRequestIds ?? [],
      requestType,
      isSystemBlock: Boolean(row.isSystemBlock ?? requestType != null),
      leaveRequestIds: row.leaveRequestIds ?? [],
      leaveHours: this.toHours(row.leaveHours),
      leaveSession: row.leaveSession ?? null,
      regularizationRequestIds: row.regularizationRequestIds ?? [],
      regularizationHours: this.toHours(row.regularizationHours),
      requestStatus: row.requestStatus ?? null,
      requestLabel: row.requestLabel ?? null,
    };
  }

  private buildLeaveSystemRows(
    leaves: Array<{
      id: string;
      userId: string;
      type: string | null;
      startDate: Date;
      endDate: Date | null;
      halfDaySession: string | null;
      status: string | null;
      user?: { fullName?: string | null } | null;
    }>,
    weekStartDate: Date,
    weekEndDate: Date,
  ): SchedulerAssignmentDto[] {
    const rows: SchedulerAssignmentDto[] = [];
    for (const leave of leaves) {
      const leaveEnd = leave.endDate ?? leave.startDate;
      for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
        const date = this.dateForDayIndex(weekStartDate, dayIndex);
        if (!this.dateInUtcRange(date, leave.startDate, leaveEnd)) continue;
        if (!this.dateInUtcRange(date, weekStartDate, weekEndDate)) continue;

        const type = normalizeLeaveType(leave.type ?? '') ?? 'Full Day';
        const session = type === LEAVE_TYPE_HALF_DAY ? normalizeHalfDaySession(leave.halfDaySession) : null;
        const hours = type === LEAVE_TYPE_HALF_DAY && this.sameUtcDate(leave.startDate, leaveEnd) ? 4 : DAILY_CAPACITY;
        const labelParts = ['Approved leave'];
        if (type) labelParts.push(type);
        if (session) labelParts.push(session);

        rows.push(this.mapRow({
          id: `leave-${leave.id}-${dayIndex}`,
          designerId: leave.userId,
          taskId: `leave-${leave.id}`,
          dayIndex,
          assignedHours: hours,
          scheduledHours: hours,
          approvedOvertimeHours: 0,
          parentId: null,
          splitIndex: null,
          totalParts: null,
          weekStartDate,
          weekEndDate,
          notes: labelParts.join(' - '),
          isLocked: true,
          assignedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          requestType: 'LEAVE',
          isSystemBlock: true,
          leaveRequestIds: [leave.id],
          leaveHours: hours,
          leaveSession: session,
          requestStatus: leave.status ?? 'Approved',
          requestLabel: labelParts.join(' - '),
        }));
      }
    }
    return rows;
  }

  private buildRegularizationSystemRows(
    requests: Array<{
      id: string;
      designerId: string | null;
      taskId: string | null;
      date: Date | null;
      duration: string | null;
      reason: string | null;
      status: string | null;
      task?: { taskNo?: string | null; title?: string | null; opNo?: string | null } | null;
    }>,
    weekStartDate: Date,
    weekEndDate: Date,
  ): SchedulerAssignmentDto[] {
    const rows: SchedulerAssignmentDto[] = [];
    for (const request of requests) {
      if (!request.designerId || !request.date) continue;
      const dayIndex = this.dayIndexForDate(new Date(request.date), weekStartDate);
      if (dayIndex < 0 || dayIndex > 6) continue;
      const hours = this.parseDurationHours(request.duration);
      if (!hours) continue;
      const taskLabel = request.task?.taskNo ?? request.task?.opNo ?? request.task?.title ?? null;
      const label = `Approved regularization${taskLabel ? ` - ${taskLabel}` : ''}`;
      rows.push(this.mapRow({
        id: `regularization-${request.id}`,
        designerId: request.designerId,
        taskId: request.taskId ?? `regularization-${request.id}`,
        dayIndex,
        assignedHours: hours,
        scheduledHours: hours,
        approvedOvertimeHours: 0,
        parentId: null,
        splitIndex: null,
        totalParts: null,
        weekStartDate,
        weekEndDate,
        notes: request.reason ?? label,
        isLocked: true,
        assignedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        requestType: 'REGULARIZATION',
        isSystemBlock: true,
        regularizationRequestIds: [request.id],
        regularizationHours: hours,
        requestStatus: request.status ?? 'Approved',
        requestLabel: label,
      }));
    }
    return rows;
  }

  private validateAssignments(dto: SaveSchedulerWeekDto) {
    const dayTotals = new Map<string, number>();
    const duplicateKey = new Set<string>();

    for (const row of dto.assignments) {
      if (row.dayIndex < 0 || row.dayIndex > 6) {
        throw new BadRequestException(`dayIndex must be between 0 and 6 for task ${row.taskId}`);
      }
      if (!Number.isFinite(row.assignedHours) || row.assignedHours <= 0) {
        throw new BadRequestException(`assignedHours must be > 0 for task ${row.taskId}`);
      }
      if (row.splitIndex != null && row.totalParts == null) {
        throw new BadRequestException(`totalParts is required when splitIndex is provided for task ${row.taskId}`);
      }
      if (row.totalParts != null && row.splitIndex != null && row.totalParts < row.splitIndex) {
        throw new BadRequestException(`totalParts must be >= splitIndex for task ${row.taskId}`);
      }

      const uniq = `${row.designerId}|${row.dayIndex}|${row.taskId}|${row.splitIndex ?? 0}`;
      if (duplicateKey.has(uniq)) {
        throw new BadRequestException(`Duplicate assignment row for task ${row.taskId} on day ${row.dayIndex}`);
      }
      duplicateKey.add(uniq);

      const capacityKey = `${row.designerId}|${row.dayIndex}`;
      const next = (dayTotals.get(capacityKey) ?? 0) + Number(row.assignedHours);
      if (next > MAX_DAILY_HOURS) {
        throw new BadRequestException(`Capacity exceeded (> ${MAX_DAILY_HOURS}h) for designer ${row.designerId} day ${row.dayIndex}`);
      }
      dayTotals.set(capacityKey, next);
    }
  }

  private assertNoApprovedFullDayLeaveConflicts(
    assignments: SaveSchedulerWeekDto['assignments'],
    approvedLeaves: Array<{
      id: string;
      userId: string;
      type: string | null;
      startDate: Date;
      endDate: Date | null;
      user?: { fullName?: string | null } | null;
    }>,
    weekStartDate: Date,
  ): void {
    for (const assignment of assignments) {
      const assignmentDate = this.dateForDayIndex(weekStartDate, assignment.dayIndex);
      const conflictingLeave = approvedLeaves.find((leave) => {
        if (leave.userId !== assignment.designerId) return false;
        const type = normalizeLeaveType(leave.type ?? '') ?? 'Full Day';
        if (type === LEAVE_TYPE_HALF_DAY) return false;
        return this.dateInUtcRange(assignmentDate, leave.startDate, leave.endDate ?? leave.startDate);
      });

      if (conflictingLeave) {
        const designerLabel = conflictingLeave.user?.fullName?.trim() || assignment.designerId;
        throw new BadRequestException(
          `Cannot schedule task ${assignment.taskId} for ${designerLabel} on approved full-day leave.`,
        );
      }
    }
  }

  private async recordLeaveRescheduleSnapshots(
    tx: {
      $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    },
    leaveRequestId: string | undefined,
    rows: Array<{ row: unknown; id: string }>,
  ): Promise<void> {
    if (!leaveRequestId || rows.length === 0) return;
    if (!this.snapshotTableReady) {
      throw new HttpException(
        'Leave reschedule snapshot table is not available. Cannot approve leave — scheduler state would be unrestorable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    for (const entry of rows) {
      await tx.$executeRaw`
        MERGE dbo.ErpTSLeaveRescheduleSnapshot AS target
        USING (SELECT ${leaveRequestId} AS leaveRequestId, ${entry.id} AS assignmentId) AS source
          ON target.leaveRequestId = source.leaveRequestId
          AND target.assignmentId = source.assignmentId
        WHEN NOT MATCHED THEN
          INSERT (leaveRequestId, assignmentId, originalJson)
          VALUES (source.leaveRequestId, source.assignmentId, ${JSON.stringify(entry.row)});
      `;
    }
  }

  private async loadLeaveRescheduleSnapshots(
    tx: {
      $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
    },
    leaveRequestId: string | undefined,
  ): Promise<LeaveRescheduleSnapshotRow[]> {
    if (!leaveRequestId) return [];
    if (!this.snapshotTableReady) {
      throw new HttpException(
        'Leave reschedule snapshot table is not available. Cannot revoke leave — original schedule cannot be restored.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return tx.$queryRaw<LeaveRescheduleSnapshotRow[]>`
      SELECT assignmentId, originalJson
      FROM dbo.ErpTSLeaveRescheduleSnapshot
      WHERE leaveRequestId = ${leaveRequestId}
        AND restoredAt IS NULL
      ORDER BY createdAt ASC
    `;
  }

  private async markLeaveRescheduleSnapshotsRestored(
    tx: {
      $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    },
    leaveRequestId: string | undefined,
  ): Promise<void> {
    if (!leaveRequestId) return;
    if (!this.snapshotTableReady) {
      throw new HttpException(
        'Leave reschedule snapshot table is not available. Cannot mark snapshots as restored.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    await tx.$executeRaw`
      UPDATE dbo.ErpTSLeaveRescheduleSnapshot
      SET restoredAt = sysutcdatetime()
      WHERE leaveRequestId = ${leaveRequestId}
        AND restoredAt IS NULL
    `;
  }

  async rescheduleForApprovedLeave(
    leave: {
      id?: string;
      userId: string;
      type: string | null;
      startDate: Date;
      endDate?: Date | null;
    },
    actorUserId: string,
  ): Promise<{ movedCount: number; affectedWeeks: string[] }> {
    const leaveStart = this.startOfUtcDay(new Date(leave.startDate));
    const leaveEnd = this.startOfUtcDay(new Date(leave.endDate ?? leave.startDate));
    if (!leave.userId || Number.isNaN(leaveStart.getTime()) || Number.isNaN(leaveEnd.getTime())) {
      return { movedCount: 0, affectedWeeks: [] };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const schedulerRows = await tx.schedulerAssignment.findMany({
        where: {
          designerId: leave.userId,
          weekStartDate: { gte: this.weekStartForDate(leaveStart) },
        },
        orderBy: [
          { weekStartDate: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });

      const datedRows = schedulerRows
        .map((row) => ({ row, date: this.assignmentDate(row) }))
        .filter((entry): entry is { row: (typeof schedulerRows)[number]; date: Date } => {
          return entry.date != null && entry.date >= leaveStart;
        });

      if (datedRows.length === 0) {
        return { movedCount: 0, affectedWeeks: [] as string[] };
      }

      const latestAssignmentDate = datedRows.reduce(
        (latest, entry) => this.maxUtcDate(latest, entry.date),
        leaveEnd,
      );
      const horizonDays = Math.max(370, datedRows.length * 7 + 30);
      const horizonEnd = this.addUtcDays(this.maxUtcDate(latestAssignmentDate, leaveEnd), horizonDays);

      const [approvedLeaves, holidayKeys] = await Promise.all([
        tx.leaveRequest.findMany({
          where: {
            userId: leave.userId,
            status: { in: ['Approved', 'APPROVED', 'approved'] },
            revokedAt: null,
            startDate: { lte: horizonEnd },
            OR: [{ endDate: null }, { endDate: { gte: leaveStart } }],
          },
          select: {
            id: true,
            type: true,
            startDate: true,
            endDate: true,
          },
        }),
        this.loadHolidayKeys(tx, leaveStart, horizonEnd),
      ]);

      const leaveHoursByDate = new Map<string, number>();
      for (const approvedLeave of approvedLeaves) {
        const start = this.startOfUtcDay(new Date(approvedLeave.startDate));
        const end = this.startOfUtcDay(new Date(approvedLeave.endDate ?? approvedLeave.startDate));
        for (let date = start; date <= end; date = this.addUtcDays(date, 1)) {
          const key = this.dateKey(date);
          const blockedHours = this.leaveHoursForDate(
            {
              type: approvedLeave.type,
              startDate: start,
              endDate: end,
            },
            date,
          );
          leaveHoursByDate.set(key, Math.min(DAILY_CAPACITY, (leaveHoursByDate.get(key) ?? 0) + blockedHours));
        }
      }

      const availableCapacity = (date: Date): number => {
        const key = this.dateKey(date);
        if (this.isWeekend(date) || holidayKeys.has(key)) return 0;
        const leaveHours = leaveHoursByDate.get(key) ?? 0;
        if (leaveHours >= DAILY_CAPACITY) return 0;
        return Math.max(0, DAILY_CAPACITY - leaveHours);
      };

      const originalUsage = new Map<string, number>();
      let firstDisplacedIndex = -1;
      for (let index = 0; index < datedRows.length; index += 1) {
        const { row, date } = datedRows[index];
        if (!this.dateInUtcRange(date, leaveStart, leaveEnd)) continue;

        const key = this.dateKey(date);
        const assignedHours = this.toHours(row.assignedHours);
        const nextUsage = (originalUsage.get(key) ?? 0) + assignedHours;
        if (nextUsage > availableCapacity(date)) {
          firstDisplacedIndex = index;
          break;
        }
        originalUsage.set(key, nextUsage);
      }

      if (firstDisplacedIndex < 0) {
        return { movedCount: 0, affectedWeeks: [] as string[] };
      }

      const fixedUsage = new Map<string, number>();
      for (const entry of datedRows.slice(0, firstDisplacedIndex)) {
        const key = this.dateKey(entry.date);
        fixedUsage.set(key, (fixedUsage.get(key) ?? 0) + this.toHours(entry.row.assignedHours));
      }

      const changedRows: Array<{
        id: string;
        row: (typeof schedulerRows)[number];
        fromWeekStartDate: Date;
        toWeekStartDate: Date;
        toWeekEndDate: Date;
        toDayIndex: number;
        toPosition: number;
        fromDate: string;
        toDate: string;
      }> = [];
      const plannedUsage = new Map(fixedUsage);
      const plannedPositions = new Map<string, number>();
      for (const entry of datedRows.slice(0, firstDisplacedIndex)) {
        const key = this.dateKey(entry.date);
        plannedPositions.set(key, Math.max(plannedPositions.get(key) ?? 0, Number(entry.row.position ?? 0) + 1));
      }
      let cursorDate = datedRows[firstDisplacedIndex].date;

      for (const entry of datedRows.slice(firstDisplacedIndex)) {
        const assignedHours = this.toHours(entry.row.assignedHours);
        if (assignedHours > DAILY_CAPACITY) {
          throw new BadRequestException(`Assignment ${entry.row.id} exceeds normal daily capacity.`);
        }

        let targetDate = this.maxUtcDate(cursorDate, entry.date);
        while ((plannedUsage.get(this.dateKey(targetDate)) ?? 0) + assignedHours > availableCapacity(targetDate)) {
          targetDate = this.addUtcDays(targetDate, 1);
          if (targetDate > horizonEnd) {
            throw new BadRequestException('Could not find an available working day for leave rescheduling.');
          }
        }

        const targetKey = this.dateKey(targetDate);
        plannedUsage.set(targetKey, (plannedUsage.get(targetKey) ?? 0) + assignedHours);
        cursorDate = targetDate;
        const toPosition = plannedPositions.get(targetKey) ?? 0;
        plannedPositions.set(targetKey, toPosition + 1);

        if (this.sameUtcDate(targetDate, entry.date) && Number(entry.row.position ?? 0) === toPosition) continue;

        const toWeekStartDate = this.weekStartForDate(targetDate);
        changedRows.push({
          id: entry.row.id,
          row: entry.row,
          fromWeekStartDate: this.weekStartForDate(entry.date),
          toWeekStartDate,
          toWeekEndDate: this.weekEndForWeekStart(toWeekStartDate),
          toDayIndex: this.dayIndexForDate(targetDate, toWeekStartDate),
          toPosition,
          fromDate: this.dateKey(entry.date),
          toDate: targetKey,
        });
      }

      if (changedRows.length === 0) {
        return { movedCount: 0, affectedWeeks: [] as string[] };
      }

      const affectedWeekByKey = new Map<string, Date>();
      for (const row of changedRows) {
        affectedWeekByKey.set(this.dateKey(row.fromWeekStartDate), row.fromWeekStartDate);
        affectedWeekByKey.set(this.dateKey(row.toWeekStartDate), row.toWeekStartDate);
      }
      const affectedWeeks = [...affectedWeekByKey.values()].sort((a, b) => a.getTime() - b.getTime());

      const beforeRows = await tx.schedulerAssignment.findMany({
        where: { weekStartDate: { in: affectedWeeks } },
        orderBy: [
          { designerId: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { id: 'asc' },
        ],
      });
      const beforeRowsByWeek = new Map<string, unknown[]>();
      for (const row of beforeRows) {
        const key = row.weekStartDate ? this.dateKey(new Date(row.weekStartDate)) : '';
        if (!key) continue;
        const rows = beforeRowsByWeek.get(key) ?? [];
        rows.push(row);
        beforeRowsByWeek.set(key, rows);
      }

      await this.recordLeaveRescheduleSnapshots(
        tx,
        leave.id,
        changedRows.map((row) => ({ id: row.id, row: row.row })),
      );

      for (const row of changedRows) {
        await tx.schedulerAssignment.update({
          where: { id: row.id },
          data: {
            weekStartDate: row.toWeekStartDate,
            weekEndDate: row.toWeekEndDate,
            dayIndex: row.toDayIndex,
            position: row.toPosition,
            assignedBy: actorUserId,
          },
        });
      }

      const afterRows = await tx.schedulerAssignment.findMany({
        where: { weekStartDate: { in: affectedWeeks } },
        orderBy: [
          { designerId: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { id: 'asc' },
        ],
      });
      const afterRowsByWeek = new Map<string, unknown[]>();
      for (const row of afterRows) {
        const key = row.weekStartDate ? this.dateKey(new Date(row.weekStartDate)) : '';
        if (!key) continue;
        const rows = afterRowsByWeek.get(key) ?? [];
        rows.push(row);
        afterRowsByWeek.set(key, rows);
      }

      for (const weekStartDate of affectedWeeks) {
        const key = this.dateKey(weekStartDate);
        const existingWeek = await tx.schedulerWeek.findUnique({ where: { weekStartDate } });
        const versionFrom = existingWeek?.version ?? 0;
        const versionTo = versionFrom + 1;
        if (existingWeek) {
          await tx.schedulerWeek.update({
            where: { weekStartDate },
            data: {
              version: { increment: 1 },
              updatedBy: actorUserId,
              lastPayloadHash: null,
            },
          });
        } else {
          await tx.schedulerWeek.create({
            data: {
              weekStartDate,
              version: versionTo,
              isLocked: false,
              updatedBy: actorUserId,
              lastPayloadHash: null,
            },
          });
        }

        await tx.schedulerAssignmentHistory.create({
          data: {
            weekStartDate,
            versionFrom,
            versionTo,
            changedBy: actorUserId,
            beforeJson: JSON.stringify(beforeRowsByWeek.get(key) ?? []),
            afterJson: JSON.stringify(afterRowsByWeek.get(key) ?? []),
          },
        });
      }

      return {
        movedCount: changedRows.length,
        affectedWeeks: affectedWeeks.map((date) => this.dateKey(date)),
      };
    });

    if (result.movedCount > 0) {
      await this.activityLogger.log({
        action: ActivityAction.SCHEDULER_LEAVE_RESCHEDULED,
        userId: actorUserId,
        details: {
          event: ActivityAction.SCHEDULER_LEAVE_RESCHEDULED,
          messageKey: 'scheduler_leave_rescheduled',
          changes: {
            movedAssignments: result.movedCount,
            affectedWeeks: result.affectedWeeks,
          },
          context: {
            source: 'leave.approval',
            leaveRequestId: leave.id ?? null,
            designerId: leave.userId,
            startDate: this.dateKey(leaveStart),
            endDate: this.dateKey(leaveEnd),
          },
        },
      });
      this.dashboardRealtime?.notifyOverviewRefresh('scheduler_leave_rescheduled');
      this.dashboardRealtime?.notifyUserNotificationRefresh(leave.userId);
    }

    return result;
  }

  async rescheduleAfterLeaveRevocation(
    leave: {
      id?: string;
      userId: string;
      type: string | null;
      startDate: Date;
      endDate?: Date | null;
    },
    actorUserId: string,
  ): Promise<{ movedCount: number; affectedWeeks: string[] }> {
    const leaveStart = this.startOfUtcDay(new Date(leave.startDate));
    const leaveEnd = this.startOfUtcDay(new Date(leave.endDate ?? leave.startDate));
    if (!leave.userId || Number.isNaN(leaveStart.getTime()) || Number.isNaN(leaveEnd.getTime())) {
      return { movedCount: 0, affectedWeeks: [] };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const snapshots = await this.loadLeaveRescheduleSnapshots(tx, leave.id);
      const originals = snapshots
        .map((snapshot) => {
          try {
            return {
              assignmentId: snapshot.assignmentId,
              row: JSON.parse(snapshot.originalJson) as {
                designerId: string | null;
                taskId: string | null;
                dayIndex: number | null;
                assignedHours: string | number | null;
                parentId: string | null;
                splitIndex: number | null;
                totalParts: number | null;
                weekStartDate: string | Date | null;
                weekEndDate: string | Date | null;
                notes: string | null;
                position?: number | null;
                isLocked: boolean | null;
                assignedBy: string | null;
                updatedAt?: string | Date | null;
              },
            };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null);

      if (originals.length > 0) {
        const currentRows = await tx.schedulerAssignment.findMany({
          where: { id: { in: originals.map((entry) => entry.assignmentId) } },
        });
        const currentById = new Map(currentRows.map((row) => [row.id, row]));
        const affectedWeekByKey = new Map<string, Date>();
        for (const entry of originals) {
          const current = currentById.get(entry.assignmentId);
          if (current?.weekStartDate) {
            const currentWeek = new Date(current.weekStartDate);
            affectedWeekByKey.set(this.dateKey(currentWeek), currentWeek);
          }
          if (entry.row.weekStartDate) {
            const originalWeek = this.startOfUtcDay(new Date(entry.row.weekStartDate));
            affectedWeekByKey.set(this.dateKey(originalWeek), originalWeek);
          }
        }
        const affectedWeeks = [...affectedWeekByKey.values()].sort((a, b) => a.getTime() - b.getTime());

        const beforeRows = affectedWeeks.length
          ? await tx.schedulerAssignment.findMany({
              where: { weekStartDate: { in: affectedWeeks } },
              orderBy: [
                { designerId: 'asc' },
                { dayIndex: 'asc' },
                { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
                { id: 'asc' },
              ],
            })
          : [];
        const beforeRowsByWeek = new Map<string, unknown[]>();
        for (const row of beforeRows) {
          const key = row.weekStartDate ? this.dateKey(new Date(row.weekStartDate)) : '';
          if (!key) continue;
          const rows = beforeRowsByWeek.get(key) ?? [];
          rows.push(row);
          beforeRowsByWeek.set(key, rows);
        }

        let restoredCount = 0;
        for (const entry of originals) {
          if (!currentById.has(entry.assignmentId)) continue;
          const originalWeekStart = entry.row.weekStartDate ? this.startOfUtcDay(new Date(entry.row.weekStartDate)) : null;
          const originalWeekEnd = entry.row.weekEndDate ? this.startOfUtcDay(new Date(entry.row.weekEndDate)) : null;
          await tx.schedulerAssignment.update({
            where: { id: entry.assignmentId },
            data: {
              designerId: entry.row.designerId,
              taskId: entry.row.taskId,
              dayIndex: entry.row.dayIndex,
              assignedHours: entry.row.assignedHours as any,
              parentId: entry.row.parentId,
              splitIndex: entry.row.splitIndex,
              totalParts: entry.row.totalParts,
              weekStartDate: originalWeekStart,
              weekEndDate: originalWeekEnd,
              notes: entry.row.notes,
              position: entry.row.position ?? 0,
              isLocked: entry.row.isLocked ?? false,
              assignedBy: entry.row.assignedBy,
              updatedAt: entry.row.updatedAt ? new Date(entry.row.updatedAt) : undefined,
            } as Prisma.SchedulerAssignmentUncheckedUpdateInput,
          });
          restoredCount += 1;
        }

        const afterRows = affectedWeeks.length
          ? await tx.schedulerAssignment.findMany({
              where: { weekStartDate: { in: affectedWeeks } },
              orderBy: [
                { designerId: 'asc' },
                { dayIndex: 'asc' },
                { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
                { id: 'asc' },
              ],
            })
          : [];
        const afterRowsByWeek = new Map<string, unknown[]>();
        for (const row of afterRows) {
          const key = row.weekStartDate ? this.dateKey(new Date(row.weekStartDate)) : '';
          if (!key) continue;
          const rows = afterRowsByWeek.get(key) ?? [];
          rows.push(row);
          afterRowsByWeek.set(key, rows);
        }

        for (const weekStartDate of affectedWeeks) {
          const key = this.dateKey(weekStartDate);
          const existingWeek = await tx.schedulerWeek.findUnique({ where: { weekStartDate } });
          const versionFrom = existingWeek?.version ?? 0;
          const versionTo = versionFrom + 1;
          if (existingWeek) {
            await tx.schedulerWeek.update({
              where: { weekStartDate },
              data: {
                version: { increment: 1 },
                updatedBy: actorUserId,
                lastPayloadHash: null,
              },
            });
          } else {
            await tx.schedulerWeek.create({
              data: {
                weekStartDate,
                version: versionTo,
                isLocked: false,
                updatedBy: actorUserId,
                lastPayloadHash: null,
              },
            });
          }

          await tx.schedulerAssignmentHistory.create({
            data: {
              weekStartDate,
              versionFrom,
              versionTo,
              changedBy: actorUserId,
              beforeJson: JSON.stringify(beforeRowsByWeek.get(key) ?? []),
              afterJson: JSON.stringify(afterRowsByWeek.get(key) ?? []),
            },
          });
        }

        await this.markLeaveRescheduleSnapshotsRestored(tx, leave.id);
        return {
          movedCount: restoredCount,
          affectedWeeks: affectedWeeks.map((date) => this.dateKey(date)),
        };
      }

      const schedulerRows = await tx.schedulerAssignment.findMany({
        where: {
          designerId: leave.userId,
          weekStartDate: { gte: this.weekStartForDate(leaveStart) },
        },
        orderBy: [
          { weekStartDate: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });

      const datedRows = schedulerRows
        .map((row) => ({ row, date: this.assignmentDate(row) }))
        .filter((entry): entry is { row: (typeof schedulerRows)[number]; date: Date } => {
          return entry.date != null && entry.date >= leaveStart;
        });

      if (datedRows.length === 0) {
        return { movedCount: 0, affectedWeeks: [] as string[] };
      }

      const latestAssignmentDate = datedRows.reduce(
        (latest, entry) => this.maxUtcDate(latest, entry.date),
        leaveEnd,
      );
      const horizonDays = Math.max(370, datedRows.length * 7 + 30);
      const horizonEnd = this.addUtcDays(this.maxUtcDate(latestAssignmentDate, leaveEnd), horizonDays);

      const [approvedLeaves, holidayKeys] = await Promise.all([
        tx.leaveRequest.findMany({
          where: {
            userId: leave.userId,
            status: { in: ['Approved', 'APPROVED', 'approved'] },
            revokedAt: null,
            startDate: { lte: horizonEnd },
            OR: [{ endDate: null }, { endDate: { gte: leaveStart } }],
          },
          select: {
            id: true,
            type: true,
            startDate: true,
            endDate: true,
          },
        }),
        this.loadHolidayKeys(tx, leaveStart, horizonEnd),
      ]);

      const leaveHoursByDate = new Map<string, number>();
      for (const approvedLeave of approvedLeaves) {
        const start = this.startOfUtcDay(new Date(approvedLeave.startDate));
        const end = this.startOfUtcDay(new Date(approvedLeave.endDate ?? approvedLeave.startDate));
        for (let date = start; date <= end; date = this.addUtcDays(date, 1)) {
          const key = this.dateKey(date);
          const blockedHours = this.leaveHoursForDate(
            {
              type: approvedLeave.type,
              startDate: start,
              endDate: end,
            },
            date,
          );
          leaveHoursByDate.set(key, Math.min(DAILY_CAPACITY, (leaveHoursByDate.get(key) ?? 0) + blockedHours));
        }
      }

      const availableCapacity = (date: Date): number => {
        const key = this.dateKey(date);
        if (this.isWeekend(date) || holidayKeys.has(key)) return 0;
        const leaveHours = leaveHoursByDate.get(key) ?? 0;
        if (leaveHours >= DAILY_CAPACITY) return 0;
        return Math.max(0, DAILY_CAPACITY - leaveHours);
      };

      const movedRows: Array<{
        id: string;
        fromWeekStartDate: Date;
        toWeekStartDate: Date;
        toWeekEndDate: Date;
        toDayIndex: number;
        fromDate: string;
        toDate: string;
      }> = [];
      const plannedUsage = new Map<string, number>();
      let cursorDate = new Date(leaveStart);

      for (const entry of datedRows) {
        const assignedHours = this.toHours(entry.row.assignedHours);
        if (assignedHours > DAILY_CAPACITY) {
          throw new BadRequestException(`Assignment ${entry.row.id} exceeds normal daily capacity.`);
        }

        let targetDate = new Date(cursorDate);
        while ((plannedUsage.get(this.dateKey(targetDate)) ?? 0) + assignedHours > availableCapacity(targetDate)) {
          targetDate = this.addUtcDays(targetDate, 1);
          if (targetDate > horizonEnd) {
            throw new BadRequestException('Could not find an available working day for leave revocation rescheduling.');
          }
        }

        const targetKey = this.dateKey(targetDate);
        plannedUsage.set(targetKey, (plannedUsage.get(targetKey) ?? 0) + assignedHours);
        cursorDate = targetDate;

        if (this.sameUtcDate(targetDate, entry.date)) continue;

        const toWeekStartDate = this.weekStartForDate(targetDate);
        movedRows.push({
          id: entry.row.id,
          fromWeekStartDate: this.weekStartForDate(entry.date),
          toWeekStartDate,
          toWeekEndDate: this.weekEndForWeekStart(toWeekStartDate),
          toDayIndex: this.dayIndexForDate(targetDate, toWeekStartDate),
          fromDate: this.dateKey(entry.date),
          toDate: targetKey,
        });
      }

      if (movedRows.length === 0) {
        return { movedCount: 0, affectedWeeks: [] as string[] };
      }

      const affectedWeekByKey = new Map<string, Date>();
      for (const row of movedRows) {
        affectedWeekByKey.set(this.dateKey(row.fromWeekStartDate), row.fromWeekStartDate);
        affectedWeekByKey.set(this.dateKey(row.toWeekStartDate), row.toWeekStartDate);
      }
      const affectedWeeks = [...affectedWeekByKey.values()].sort((a, b) => a.getTime() - b.getTime());

      const beforeRows = await tx.schedulerAssignment.findMany({
        where: { weekStartDate: { in: affectedWeeks } },
        orderBy: [
          { designerId: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { id: 'asc' },
        ],
      });
      const beforeRowsByWeek = new Map<string, unknown[]>();
      for (const row of beforeRows) {
        const key = row.weekStartDate ? this.dateKey(new Date(row.weekStartDate)) : '';
        if (!key) continue;
        const rows = beforeRowsByWeek.get(key) ?? [];
        rows.push(row);
        beforeRowsByWeek.set(key, rows);
      }

      for (const row of movedRows) {
        await tx.schedulerAssignment.update({
          where: { id: row.id },
          data: {
            weekStartDate: row.toWeekStartDate,
            weekEndDate: row.toWeekEndDate,
            dayIndex: row.toDayIndex,
            assignedBy: actorUserId,
          },
        });
      }

      const afterRows = await tx.schedulerAssignment.findMany({
        where: { weekStartDate: { in: affectedWeeks } },
        orderBy: [
          { designerId: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { id: 'asc' },
        ],
      });
      const afterRowsByWeek = new Map<string, unknown[]>();
      for (const row of afterRows) {
        const key = row.weekStartDate ? this.dateKey(new Date(row.weekStartDate)) : '';
        if (!key) continue;
        const rows = afterRowsByWeek.get(key) ?? [];
        rows.push(row);
        afterRowsByWeek.set(key, rows);
      }

      for (const weekStartDate of affectedWeeks) {
        const key = this.dateKey(weekStartDate);
        const existingWeek = await tx.schedulerWeek.findUnique({ where: { weekStartDate } });
        const versionFrom = existingWeek?.version ?? 0;
        const versionTo = versionFrom + 1;
        if (existingWeek) {
          await tx.schedulerWeek.update({
            where: { weekStartDate },
            data: {
              version: { increment: 1 },
              updatedBy: actorUserId,
              lastPayloadHash: null,
            },
          });
        } else {
          await tx.schedulerWeek.create({
            data: {
              weekStartDate,
              version: versionTo,
              isLocked: false,
              updatedBy: actorUserId,
              lastPayloadHash: null,
            },
          });
        }

        await tx.schedulerAssignmentHistory.create({
          data: {
            weekStartDate,
            versionFrom,
            versionTo,
            changedBy: actorUserId,
            beforeJson: JSON.stringify(beforeRowsByWeek.get(key) ?? []),
            afterJson: JSON.stringify(afterRowsByWeek.get(key) ?? []),
          },
        });
      }

      return {
        movedCount: movedRows.length,
        affectedWeeks: affectedWeeks.map((date) => this.dateKey(date)),
      };
    });

    if (result.movedCount > 0) {
      await this.activityLogger.log({
        action: ActivityAction.SCHEDULER_LEAVE_RESCHEDULED,
        userId: actorUserId,
        details: {
          event: ActivityAction.SCHEDULER_LEAVE_RESCHEDULED,
          messageKey: 'scheduler_leave_rescheduled',
          changes: {
            movedAssignments: result.movedCount,
            affectedWeeks: result.affectedWeeks,
          },
          context: {
            source: 'leave.revocation',
            leaveRequestId: leave.id ?? null,
            designerId: leave.userId,
            startDate: this.dateKey(leaveStart),
            endDate: this.dateKey(leaveEnd),
          },
        },
      });
      this.dashboardRealtime?.notifyOverviewRefresh('scheduler_leave_rescheduled');
      this.dashboardRealtime?.notifyUserNotificationRefresh(leave.userId);
    }

    return result;
  }

  private stablePayloadHash(assignments: SaveSchedulerWeekDto['assignments']): string {
    const normalized = assignments
      .map((a) => ({
        designerId: a.designerId,
        taskId: a.taskId,
        dayIndex: a.dayIndex,
        assignedHours: Number(a.assignedHours),
        parentId: a.parentId ?? null,
        splitIndex: a.splitIndex ?? null,
        totalParts: a.totalParts ?? null,
        notes: a.notes ?? null,
      }))
      .sort((a, b) => {
        const ka = `${a.designerId}|${a.dayIndex}|${a.taskId}|${a.splitIndex ?? 0}`;
        const kb = `${b.designerId}|${b.dayIndex}|${b.taskId}|${b.splitIndex ?? 0}`;
        return ka.localeCompare(kb);
      });
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  async findForWeekStart(weekStart: string, designerId?: string): Promise<SchedulerAssignmentDto[]> {
    const { weekStartDate } = this.parseWeekStart(weekStart);

    try {
      const rows = await this.prisma.schedulerAssignment.findMany({
        where: { weekStartDate, ...(designerId ? { designerId } : {}) },
        orderBy: [
          { designerId: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { id: 'asc' },
        ],
      });

      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
      const [approvedRequests, approvedLeaves, approvedRegularizations] = await Promise.all([
        this.prisma.overtimeRequest.findMany({
          where: {
            status: 'APPROVED',
            date: { gte: weekStartDate, lte: weekEndDate },
            ...(designerId ? { designerId } : {}),
          },
          select: {
            id: true,
            designerId: true,
            taskId: true,
            date: true,
            approvedHours: true,
          },
          orderBy: { approvedAt: 'asc' },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            status: { in: ['Approved', 'APPROVED', 'approved'] },
            revokedAt: null,
            startDate: { lte: weekEndDate },
            OR: [{ endDate: null }, { endDate: { gte: weekStartDate } }],
            ...(designerId ? { userId: designerId } : {}),
          },
          select: {
            id: true,
            userId: true,
            type: true,
            startDate: true,
            endDate: true,
            halfDaySession: true,
            status: true,
            user: { select: { fullName: true } },
          },
          orderBy: { startDate: 'asc' },
        }),
        this.prisma.regularizationRequest.findMany({
          where: {
            status: { in: ['Approved', 'APPROVED', 'approved'] },
            date: { gte: weekStartDate, lte: weekEndDate },
            ...(designerId ? { designerId } : {}),
          },
          select: {
            id: true,
            designerId: true,
            taskId: true,
            date: true,
            duration: true,
            reason: true,
            status: true,
            task: { select: { taskNo: true, title: true, opNo: true } },
          },
          orderBy: { reviewedAt: 'asc' },
        }),
      ]);

      const approvedByAssignmentKey = new Map<string, { hours: number; requestIds: string[] }>();
      for (const request of approvedRequests) {
        if (!request.designerId || !request.taskId || !request.date) continue;
        const dayIndex = this.dayIndexForDate(new Date(request.date), weekStartDate);
        if (dayIndex < 0 || dayIndex > 6) continue;
        const hours = this.toHours(request.approvedHours);
        if (!hours) continue;
        const key = `${request.designerId}|${request.taskId}|${dayIndex}`;
        const existing = approvedByAssignmentKey.get(key) ?? { hours: 0, requestIds: [] };
        approvedByAssignmentKey.set(key, {
          hours: existing.hours + hours,
          requestIds: [...existing.requestIds, request.id],
        });
      }

      const mappedRows = rows.map((r) => {
        const designerKey = r.designerId ?? '';
        const taskKey = r.taskId ?? '';
        const dayKey = r.dayIndex ?? 0;
        const overtimeKey = `${designerKey}|${taskKey}|${dayKey}`;
        const approvedOvertime = approvedByAssignmentKey.get(overtimeKey);
        const approvedOvertimeHours = approvedOvertime?.hours ?? 0;
        approvedByAssignmentKey.delete(overtimeKey);
        const scheduledHours = this.toHours(r.assignedHours);
        return this.mapRow({
          ...(r as unknown as RawAssignmentRow),
          designerId: designerKey,
          taskId: taskKey,
          dayIndex: dayKey,
          scheduledHours,
          approvedOvertimeHours,
          assignedHours: scheduledHours + approvedOvertimeHours,
          overtimeRequestIds: approvedOvertime?.requestIds ?? [],
        });
      });

      const virtualRows = approvedRequests
        .map((request) => {
          if (!request.designerId || !request.taskId || !request.date) return null;
          const dayIndex = this.dayIndexForDate(new Date(request.date), weekStartDate);
          if (dayIndex < 0 || dayIndex > 6) return null;
          const key = `${request.designerId}|${request.taskId}|${dayIndex}`;
          const approvedOvertime = approvedByAssignmentKey.get(key);
          const approvedOvertimeHours = approvedOvertime?.hours ?? 0;
          if (!approvedOvertimeHours) return null;
          approvedByAssignmentKey.delete(key);
          return this.mapRow({
            id: `overtime-${request.id}`,
            designerId: request.designerId,
            taskId: request.taskId,
            dayIndex,
            assignedHours: approvedOvertimeHours,
            scheduledHours: 0,
            approvedOvertimeHours,
            parentId: null,
            splitIndex: null,
            totalParts: null,
            weekStartDate,
            weekEndDate,
            notes: 'Approved overtime',
            isLocked: true,
            assignedBy: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            overtimeRequestIds: approvedOvertime?.requestIds ?? [request.id],
          });
        })
        .filter((row): row is SchedulerAssignmentDto => row != null);

      return [
        ...mappedRows,
        ...virtualRows,
        ...this.buildLeaveSystemRows(approvedLeaves, weekStartDate, weekEndDate),
        ...this.buildRegularizationSystemRows(approvedRegularizations, weekStartDate, weekEndDate),
      ];
    } catch (err) {
      this.fail('Scheduler assignments query failed', err);
    }
  }

  async getWeekMeta(weekStart: string): Promise<SchedulerWeekMetaDto> {
    const { weekStartDate } = this.parseWeekStart(weekStart);
    const row = await this.prisma.schedulerWeek.findUnique({ where: { weekStartDate } });
    return {
      weekStart,
      version: row?.version ?? 0,
      isLocked: Boolean(row?.isLocked ?? false),
      updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
      updatedBy: row?.updatedBy ?? null,
    };
  }

  async updateOvertimeRequestSchedulerAction(
    requestId: string,
    userId: string,
    action: 'ON_HOLD' | 'UNASSIGN',
  ) {
    if (!this.isUuid(requestId)) {
      throw new BadRequestException('Invalid overtime request id.');
    }

    const nextStatus = action === 'ON_HOLD' ? 'ON_HOLD' : 'UNASSIGNED';
    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await tx.overtimeRequest.findUnique({
        where: { id: requestId },
        include: {
          task: { select: { id: true, status: true } },
        },
      });

      if (!request) {
        throw new NotFoundException('Overtime request not found.');
      }
      if (String(request.status ?? '').toUpperCase() !== 'APPROVED') {
        throw new BadRequestException('Only approved overtime requests can be changed from the scheduler.');
      }
      if (request.date) {
        const weekStartDate = this.weekStartForDate(new Date(request.date));
        const week = await tx.schedulerWeek.findUnique({ where: { weekStartDate } });
        if (week?.isLocked) {
          throw new ForbiddenException('This scheduler week is locked.');
        }
      }

      const savedRequest = await tx.overtimeRequest.update({
        where: { id: requestId },
        data: { status: nextStatus },
        include: {
          task: { select: { id: true, taskNo: true, title: true, status: true } },
          designer: { select: { id: true, fullName: true } },
        },
      });

      if (action === 'ON_HOLD' && request.taskId) {
        await tx.task.update({
          where: { id: request.taskId },
          data: {
            status: 'ON_HOLD',
            holdPreviousStatus: request.task?.status ?? null,
          },
        });

        const todayMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
        await tx.schedulerAssignment.deleteMany({
          where: { taskId: request.taskId, weekStartDate: { gte: todayMidnight } },
        });
      }

      return savedRequest;
    });

    if (updated.date) {
      await this.touchSchedulerWeek(this.weekStartForDate(new Date(updated.date)), userId);
    }

    await this.activityLogger.log({
      action: ActivityAction.OVERTIME_REQUEST_STATUS_CHANGED,
      userId,
      taskId: updated.taskId ?? null,
      details: {
        event: ActivityAction.OVERTIME_REQUEST_STATUS_CHANGED,
        messageKey: action === 'ON_HOLD'
          ? 'overtime_scheduler_moved_on_hold'
          : 'overtime_scheduler_unassigned',
        taskSnapshot: updated.task
          ? {
              id: updated.task.id,
              taskNo: updated.task.taskNo,
              title: updated.task.title ?? undefined,
              status: action === 'ON_HOLD' ? 'ON_HOLD' : updated.task.status,
            }
          : undefined,
        changes: { oldStatus: 'APPROVED', newStatus: nextStatus, schedulerAction: action },
        context: {
          source: 'scheduler.overtimeAction',
          overtimeRequestId: requestId,
          designerId: updated.designerId ?? null,
        },
      },
    });

    this.dashboardRealtime?.notifyOverviewRefresh('overtime_scheduler_action');
    if (updated.designerId) {
      this.dashboardRealtime?.notifyUserNotificationRefresh(updated.designerId);
    }

    return updated;
  }

  async setWeekLock(weekStart: string, userId: string, locked: boolean): Promise<SchedulerWeekMetaDto> {
    const { weekStartDate } = this.parseWeekStart(weekStart);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.schedulerWeek.findUnique({ where: { weekStartDate } });
      const row = existing
        ? await tx.schedulerWeek.update({
            where: { weekStartDate },
            data: { isLocked: locked, updatedBy: userId },
          })
        : await tx.schedulerWeek.create({
            data: { weekStartDate, version: 0, isLocked: locked, updatedBy: userId },
          });

      return row;
    }, { timeout: 15_000 });

    await this.activityLogger.log({
      action: locked ? ActivityAction.SCHEDULER_WEEK_LOCKED : ActivityAction.SCHEDULER_WEEK_UNLOCKED,
      userId,
      details: {
        event: locked ? ActivityAction.SCHEDULER_WEEK_LOCKED : ActivityAction.SCHEDULER_WEEK_UNLOCKED,
        messageKey: locked ? 'scheduler_week_locked' : 'scheduler_week_unlocked',
        context: { weekStart, isLocked: locked },
      },
    });

    this.dashboardRealtime?.notifyOverviewRefresh(locked ? 'scheduler_week_locked' : 'scheduler_week_unlocked');

    return {
      weekStart,
      version: result.version,
      isLocked: Boolean(result.isLocked),
      updatedAt: result.updatedAt.toISOString(),
      updatedBy: result.updatedBy ?? null,
    };
  }

  async clearTaskSchedule(taskId: string): Promise<void> {
    const todayMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
    await this.prisma.schedulerAssignment.deleteMany({
      where: { taskId, weekStartDate: { gte: todayMidnight } },
    });
  }

  async saveWeekSnapshot(weekStart: string, userId: string, dto: SaveSchedulerWeekDto) {
    const { weekStartDate, weekEndDate } = this.parseWeekStart(weekStart);
    this.validateAssignments(dto);
    const payloadHash = this.stablePayloadHash(dto.assignments);

    const result = await this.prisma.$transaction(async (tx) => {
      const designerIds = Array.from(new Set(dto.assignments.map((a) => a.designerId)));
      const taskIds = Array.from(new Set(dto.assignments.map((a) => a.taskId)));

      const [schedulableUsers, tasks, previousRows, weekRows, approvedLeaves] = await Promise.all([
        tx.user.findMany({
          where: { id: { in: designerIds }, role: { name: { in: [UserRole.DESIGNER, UserRole.HOD] } } },
          select: { id: true },
        }),
        tx.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, status: true, assigneeId: true } }),
        tx.schedulerAssignment.findMany({ where: { weekStartDate } }),
        // UPDLOCK + ROWLOCK: prevents two concurrent transactions from both passing the
        // version check before either commits, which would cause a silent lost update.
        tx.$queryRaw<Array<{
          id: string;
          version: number;
          isLocked: boolean;
          lastPayloadHash: string | null;
          updatedAt: Date;
          updatedBy: string | null;
        }>>`SELECT id, version, isLocked, lastPayloadHash, updatedAt, updatedBy
            FROM ErpTSSchedulerWeek WITH (UPDLOCK, ROWLOCK)
            WHERE weekStartDate = ${weekStartDate}`,
        tx.leaveRequest.findMany({
          where: {
            userId: { in: designerIds },
            status: { in: ['Approved', 'APPROVED', 'approved'] },
            revokedAt: null,
            startDate: { lte: weekEndDate },
            OR: [{ endDate: null }, { endDate: { gte: weekStartDate } }],
          },
          select: {
            id: true,
            userId: true,
            type: true,
            startDate: true,
            endDate: true,
            user: { select: { fullName: true } },
          },
        }),
      ]);
      const week = weekRows[0] ?? null;

      if (schedulableUsers.length !== designerIds.length) {
        throw new BadRequestException('One or more designerId values are invalid or not schedulable employee role.');
      }
      if (tasks.length !== taskIds.length) {
        throw new BadRequestException('One or more taskId values are invalid.');
      }

      const existing = week ??
        (await tx.schedulerWeek.create({
          data: {
            weekStartDate,
            version: 0,
            isLocked: false,
            updatedBy: userId,
          },
        }));

      if (existing.isLocked) {
        throw new ForbiddenException('This scheduler week is locked.');
      }
      if (dto.version !== existing.version) {
        throw new ConflictException('Scheduler week has changed. Refresh and retry.');
      }

      this.assertNoApprovedFullDayLeaveConflicts(dto.assignments, approvedLeaves, weekStartDate);

      if (existing.lastPayloadHash && existing.lastPayloadHash === payloadHash) {
        return {
          version: existing.version,
          changed: false,
          assignments: previousRows,
          isLocked: Boolean(existing.isLocked),
          updatedAt: existing.updatedAt,
          updatedBy: existing.updatedBy,
        };
      }

      // --- Cross-week sequential split index recomputation ---
      // If any assignments carry split metadata, recompute splitIndex/totalParts globally
      // so that parts in other weeks are numbered sequentially (e.g. week1=1,2 + week2=3).
      const splitTaskIds = Array.from(new Set(
        dto.assignments
          .filter(a => a.splitIndex != null || a.parentId != null)
          .map(a => a.taskId),
      ));

      const otherWeekUpdates: Array<{ id: string; splitIndex: number; totalParts: number }> = [];

      if (splitTaskIds.length > 0) {
        const crossWeekRows = await tx.schedulerAssignment.findMany({
          where: {
            taskId: { in: splitTaskIds },
            weekStartDate: { not: weekStartDate },
          },
          select: { id: true, taskId: true, dayIndex: true, weekStartDate: true, splitIndex: true, totalParts: true },
          orderBy: [{ weekStartDate: 'asc' }, { dayIndex: 'asc' }],
        });

        const currentWeekMs = weekStartDate.getTime();

        for (const taskId of splitTaskIds) {
          const currentParts = dto.assignments
            .filter(a => a.taskId === taskId)
            .sort((a, b) => a.dayIndex - b.dayIndex);

          if (currentParts.length === 0) continue;

          const otherRows = (crossWeekRows as any[])
            .filter(r => r.taskId === taskId)
            .sort((a, b) => {
              const wDiff = new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime();
              return wDiff !== 0 ? wDiff : a.dayIndex - b.dayIndex;
            });

          // Single part with no cross-week peers — skip, no global label needed
          if (otherRows.length === 0 && currentParts.length <= 1) continue;

          const beforeCurrent = otherRows.filter(r => new Date(r.weekStartDate).getTime() < currentWeekMs);
          const afterCurrent = otherRows.filter(r => new Date(r.weekStartDate).getTime() > currentWeekMs);

          // All parts in global chronological order: earlier weeks → current week → later weeks
          const allParts: Array<
            | { source: 'other'; row: (typeof crossWeekRows)[0] }
            | { source: 'current'; assignment: (typeof dto.assignments)[0] }
          > = [
            ...beforeCurrent.map(r => ({ source: 'other' as const, row: r as any })),
            ...currentParts.map(a => ({ source: 'current' as const, assignment: a })),
            ...afterCurrent.map(r => ({ source: 'other' as const, row: r as any })),
          ];

          const totalParts = allParts.length;

          allParts.forEach((part, idx) => {
            const newSplitIndex = idx + 1;
            if (part.source === 'current') {
              part.assignment.splitIndex = newSplitIndex;
              part.assignment.totalParts = totalParts;
              if (!part.assignment.parentId) part.assignment.parentId = taskId;
            } else {
              if (part.row.splitIndex !== newSplitIndex || part.row.totalParts !== totalParts) {
                otherWeekUpdates.push({ id: part.row.id as string, splitIndex: newSplitIndex, totalParts });
              }
            }
          });
        }
      }
      // --- End cross-week recomputation ---

      await tx.schedulerAssignment.deleteMany({ where: { weekStartDate } });

      if (dto.assignments.length > 0) {
        await tx.schedulerAssignment.createMany({
          data: dto.assignments.map((a) => ({
            designerId: a.designerId,
            taskId: a.taskId,
            dayIndex: a.dayIndex,
            assignedHours: new Prisma.Decimal(a.assignedHours),
            parentId: a.parentId ?? null,
            splitIndex: a.splitIndex ?? null,
            totalParts: a.totalParts ?? null,
            position: a.position ?? 0,
            weekStartDate,
            weekEndDate,
            notes: a.notes ?? null,
            isLocked: false,
            assignedBy: userId,
          })),
        });
      }

      // Propagate corrected splitIndex/totalParts to other weeks' rows (single batch, not N round trips)
      if (otherWeekUpdates.length > 0) {
        const splitIndexCases = Prisma.join(
          otherWeekUpdates.map((u) => Prisma.sql`WHEN id = ${u.id} THEN ${u.splitIndex}`),
          ' ',
        );
        const totalPartsCases = Prisma.join(
          otherWeekUpdates.map((u) => Prisma.sql`WHEN id = ${u.id} THEN ${u.totalParts}`),
          ' ',
        );
        const ids = Prisma.join(otherWeekUpdates.map((u) => u.id));
        await tx.$executeRaw`
          UPDATE ErpTSSchedulerAssignment
          SET splitIndex  = CASE ${splitIndexCases} END,
              totalParts  = CASE ${totalPartsCases} END
          WHERE id IN (${ids})
        `;
      }

      const prevTaskIds = Array.from(new Set(previousRows.map((r: any) => r.taskId).filter(Boolean))) as string[];
      const affectedTaskIds = Array.from(new Set([...prevTaskIds, ...taskIds]));

      const assigneesByTask = new Map<string, Set<string>>();
      for (const row of dto.assignments) {
        if (!assigneesByTask.has(row.taskId)) assigneesByTask.set(row.taskId, new Set());
        assigneesByTask.get(row.taskId)?.add(row.designerId);
      }

      const reassignedTasks: Array<{ taskId: string; oldAssigneeId: string | null; newAssigneeId: string }> = [];
      const splitTasks: Array<{ taskId: string; designerIds: string[] }> = [];
      const assignOnlyByDesigner = new Map<string, string[]>();
      const assignPlannedByDesigner = new Map<string, string[]>();
      const unassignOnlyIds: string[] = [];
      const unassignNewIds: string[] = [];
      const splitAssigneeNullIds: string[] = [];
      const pushGroupedTask = (map: Map<string, string[]>, key: string, taskId: string) => {
        const ids = map.get(key) ?? [];
        ids.push(taskId);
        map.set(key, ids);
      };

      if (affectedTaskIds.length > 0) {
        const affectedTasks = await tx.task.findMany({
          where: { id: { in: affectedTaskIds } },
          select: { id: true, status: true, assigneeId: true },
        });

        for (const task of affectedTasks) {
          const designerSet = assigneesByTask.get(task.id) ?? new Set<string>();
          const assignedDesigner = designerSet.size === 1 ? [...designerSet][0] : null;

          const currentStatus = String(task.status ?? '').toUpperCase();
          const isTerminal = ['CLIENT_ACCEPTED', 'CLIENT_REJECTED'].includes(currentStatus);

          if (assignedDesigner) {
            // Promote DESIGN_NEW → DESIGN_PLANNED when given a scheduler slot; leave all other active statuses untouched.
            const shouldPlan = !isTerminal && currentStatus === 'DESIGN_NEW';
            if (shouldPlan) {
              pushGroupedTask(assignPlannedByDesigner, assignedDesigner, task.id);
            } else if (task.assigneeId !== assignedDesigner) {
              pushGroupedTask(assignOnlyByDesigner, assignedDesigner, task.id);
            }
          } else if (designerSet.size === 0) {
            // When unassigned, revert to DESIGN_NEW unless terminal or on hold.
            if (!isTerminal && currentStatus !== 'ON_HOLD') {
              unassignNewIds.push(task.id);
            } else if (task.assigneeId !== null) {
              unassignOnlyIds.push(task.id);
            }
          } else {
            // Split across multiple designers — null out assigneeId so the task
            // doesn't falsely appear assigned to only one person.
            if (task.assigneeId !== null) {
              splitAssigneeNullIds.push(task.id);
            }
          }

          if (assignedDesigner && assignedDesigner !== task.assigneeId) {
            reassignedTasks.push({ taskId: task.id, oldAssigneeId: task.assigneeId ?? null, newAssigneeId: assignedDesigner });
          }
          if (designerSet.size > 1) {
            splitTasks.push({ taskId: task.id, designerIds: [...designerSet] });
          }
        }
      }

      // Sync ErpTSTaskDesigner junction: reflects all designers assigned to each task this week.
      if (affectedTaskIds.length > 0) {
        await tx.$executeRaw`
          DELETE FROM ErpTSTaskDesigner
          WHERE taskId IN (${Prisma.join(affectedTaskIds)})
        `;
        const junctionRows: { taskId: string; designerId: string }[] = [];
        for (const [taskId, designerSet] of assigneesByTask.entries()) {
          for (const designerId of designerSet) {
            junctionRows.push({ taskId, designerId });
          }
        }
        if (junctionRows.length > 0) {
          await tx.$executeRaw`
            INSERT INTO ErpTSTaskDesigner (taskId, designerId)
            VALUES ${Prisma.join(junctionRows.map((row) => Prisma.sql`(${row.taskId}, ${row.designerId})`))}
          `;
        }

        for (const [assigneeId, ids] of assignPlannedByDesigner.entries()) {
          await tx.task.updateMany({
            where: { id: { in: ids } },
            data: { assigneeId, status: 'DESIGN_PLANNED' },
          });
        }
        for (const [assigneeId, ids] of assignOnlyByDesigner.entries()) {
          await tx.task.updateMany({
            where: { id: { in: ids } },
            data: { assigneeId },
          });
        }
        if (unassignNewIds.length > 0) {
          await tx.task.updateMany({
            where: { id: { in: unassignNewIds } },
            data: { assigneeId: null, status: 'DESIGN_NEW' },
          });
        }
        if (unassignOnlyIds.length > 0) {
          await tx.task.updateMany({
            where: { id: { in: unassignOnlyIds } },
            data: { assigneeId: null },
          });
        }
        if (splitAssigneeNullIds.length > 0) {
          await tx.task.updateMany({
            where: { id: { in: splitAssigneeNullIds } },
            data: { assigneeId: null },
          });
        }
      }

      const nextVersion = existing.version + 1;
      const updatedWeek = await tx.schedulerWeek.update({
        where: { weekStartDate },
        data: {
          version: nextVersion,
          updatedBy: userId,
          lastPayloadHash: payloadHash,
        },
      });

      await tx.schedulerAssignmentHistory.create({
        data: {
          weekStartDate,
          versionFrom: existing.version,
          versionTo: nextVersion,
          changedBy: userId,
          beforeJson: JSON.stringify(previousRows),
          afterJson: JSON.stringify(dto.assignments),
        },
      });

      const newRows = await tx.schedulerAssignment.findMany({
        where: { weekStartDate },
        orderBy: [
          { designerId: 'asc' },
          { dayIndex: 'asc' },
          { position: 'asc' } as unknown as Prisma.SchedulerAssignmentOrderByWithRelationInput,
          { id: 'asc' },
        ],
      });

      return {
        version: updatedWeek.version,
        changed: true,
        assignments: newRows,
        isLocked: Boolean(updatedWeek.isLocked),
        updatedAt: updatedWeek.updatedAt,
        updatedBy: updatedWeek.updatedBy,
        reassignedTasks,
        splitTasks,
      };
    }, { timeout: 30_000 });

    this.logger.debug(`[SCHED-NOTIFY] changed=${result.changed} reassignedCount=${result.reassignedTasks?.length ?? 0}`);
    if (result.changed && result.reassignedTasks?.length) {
      const allDesignerIds = Array.from(new Set([
        ...result.reassignedTasks.map((r) => r.newAssigneeId),
        ...result.reassignedTasks.map((r) => r.oldAssigneeId).filter(Boolean) as string[],
      ]));
      const designers = await this.prisma.user.findMany({
        where: { id: { in: allDesignerIds } },
        select: { id: true, fullName: true },
      });
      const nameById = new Map(designers.map((d) => [d.id, d.fullName]));

      const taskIds = Array.from(new Set(result.reassignedTasks.map((r) => r.taskId)));
      const taskDetails = await this.prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, taskNo: true, title: true },
      });
      const taskById = new Map(taskDetails.map((t) => [t.id, t]));

      await Promise.all(
        result.reassignedTasks.map((r) =>
          this.activityLogger.log({
            action: ActivityAction.ASSIGNED_TASK,
            userId,
            taskId: r.taskId,
            details: {
              event: ActivityAction.ASSIGNED_TASK,
              messageKey: 'task_assigned',
              taskSnapshot: {
                id: r.taskId,
                taskNo: taskById.get(r.taskId)?.taskNo,
                title: taskById.get(r.taskId)?.title ?? undefined,
              },
              changes: {
                newAssigneeId: r.newAssigneeId,
                newAssigneeName: nameById.get(r.newAssigneeId) ?? 'Unknown',
                oldAssigneeId: r.oldAssigneeId,
                oldAssigneeName: r.oldAssigneeId ? (nameById.get(r.oldAssigneeId) ?? null) : null,
                source: 'scheduler',
              },
            },
          }),
        ),
      );

      // Notify each newly assigned designer + all HODs
      const hodUsers = await this.prisma.user.findMany({
        where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
        select: { id: true },
      });
      for (const r of result.reassignedTasks) {
        const task = taskById.get(r.taskId);
        if (!task) continue;
        const taskLink = `/project-task-view/${r.taskId}`;
        const designerName = nameById.get(r.newAssigneeId) ?? 'Designer';
        const designerMsg = `${task.taskNo} has been scheduled for you.`;
        const hodMsg = `${task.taskNo} scheduled and assigned to ${designerName}.`;
        this.notificationsService
          .create({ userId: r.newAssigneeId, title: 'Task Scheduled for You', message: designerMsg, linkUrl: taskLink })
          .catch((err) => this.logger.error('Failed to notify designer on scheduler assign', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(r.newAssigneeId);
        for (const hod of hodUsers) {
          if (hod.id !== r.newAssigneeId) {
            this.notificationsService
              .create({ userId: hod.id, title: 'Task Scheduled', message: hodMsg, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on scheduler assign', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
          }
        }
      }

      // Notify each designer individually for split tasks (assigneeId = null, multiple designers)
      if (result.splitTasks?.length) {
        const splitTaskIds = result.splitTasks.map((s) => s.taskId);
        const splitDesignerIds = Array.from(new Set(result.splitTasks.flatMap((s) => s.designerIds)));
        const [splitTaskDetails, splitDesigners] = await Promise.all([
          this.prisma.task.findMany({ where: { id: { in: splitTaskIds } }, select: { id: true, taskNo: true } }),
          this.prisma.user.findMany({ where: { id: { in: splitDesignerIds } }, select: { id: true, fullName: true } }),
        ]);
        const splitTaskById = new Map(splitTaskDetails.map((t) => [t.id, t]));
        const splitNameById = new Map(splitDesigners.map((d) => [d.id, d.fullName]));

        for (const { taskId, designerIds } of result.splitTasks) {
          const task = splitTaskById.get(taskId);
          if (!task) continue;
          const taskLink = `/project-task-view/${taskId}`;
          const designerNames = designerIds.map((id) => splitNameById.get(id) ?? 'Designer').join(', ');
          for (const designerId of designerIds) {
            this.notificationsService
              .create({ userId: designerId, title: 'Task Scheduled for You', message: `${task.taskNo} has been scheduled for you.`, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify split designer on scheduler save', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
          }
          for (const hod of hodUsers) {
            this.notificationsService
              .create({ userId: hod.id, title: 'Task Scheduled', message: `${task.taskNo} split across: ${designerNames}.`, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on split task', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
          }
        }
      }
    }

    if (result.changed) {
      await this.activityLogger.log({
        action: ActivityAction.SCHEDULER_WEEK_SAVED,
        userId,
        details: {
          event: ActivityAction.SCHEDULER_WEEK_SAVED,
          messageKey: 'scheduler_week_saved',
          context: {
            weekStart,
            version: result.version,
            assignmentsCount: result.assignments.length,
            weekdayCapacityHours: DAILY_CAPACITY,
            overtimeCapHours: MAX_DAILY_HOURS,
          },
        },
      });
      this.dashboardRealtime?.notifyOverviewRefresh('scheduler_week_saved');
    }

    return {
      weekStart,
      version: result.version,
      isLocked: result.isLocked,
      updatedAt: result.updatedAt.toISOString(),
      updatedBy: result.updatedBy ?? null,
      assignments: result.assignments.map((r: any) =>
        this.mapRow({
          ...(r as unknown as RawAssignmentRow),
          designerId: r.designerId ?? '',
          taskId: r.taskId ?? '',
          dayIndex: r.dayIndex ?? 0,
        }),
      ),
    };
  }
}
