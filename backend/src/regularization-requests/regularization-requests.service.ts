import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { UserRole } from '../common/constants/roles.enum';
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';
import { ReviewRegularizationRequestDto } from './dto/review-regularization-request.dto';
import { UpdateRegularizationStatusDto } from './dto/update-regularization-status.dto';
import { isUuidString, sqlUniqueIdentifier } from './sql-uuid.util';
import type { RegularizationRequestsContract } from './regularization-requests.contract';

type RawRegularizationRow = {
  id: string;
  designerId: string;
  taskId: string;
  date: Date;
  duration: string | number | null;
  reason: string | null;
  notes: string | null;
  status: string | null;
  approverId: string | null;
  approverRemarks?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  taskTitle?: string | null;
  taskNo?: string | null;
  opNo?: string | null;
  designerName?: string | null;
  departmentName?: string | null;
  approverName?: string | null;
};

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

@Injectable()
export class RegularizationRequestsService implements RegularizationRequestsContract {
  private readonly logger = new Logger(RegularizationRequestsService.name);
  private readonly table: string;
  private readonly taskTable: string;
  private readonly userTable: string;
  private readonly deptTable: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly activityLogger: ActivityLoggerService,
  ) {
    const catalog = (this.config.get<string>('erp.sqlCatalog') ?? '').trim();
    if (catalog && !/^[\w-]+$/.test(catalog)) {
      throw new Error('Invalid erp.sqlCatalog / ERP_SQL_CATALOG');
    }
    const prefix = catalog ? `[${catalog}].[dbo]` : `[dbo]`;
    this.table = `${prefix}.[ErpTSRegularizationRequest]`;
    this.taskTable = `${prefix}.[ErpTSTask]`;
    this.userTable = `${prefix}.[ErpTSUser]`;
    this.deptTable = `[dbo].[Department]`;
  }

  private fail(context: string, err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`${context}: ${msg}`);
    throw new HttpException(`${context}: ${msg}`, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private esc(s: string): string {
    return s.replace(/'/g, "''");
  }

  private formatDuration(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return `${value} mins`;
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

  private joinSql(alias = 'r'): string {
    return `
      FROM ${this.table} ${alias}
      LEFT JOIN ${this.taskTable} t ON t.id = ${alias}.taskId
      LEFT JOIN ${this.userTable} du ON du.id = ${alias}.designerId
      LEFT JOIN ${this.deptTable} d ON d.id = du.departmentId
      LEFT JOIN ${this.userTable} au ON au.id = ${alias}.approverId
    `;
  }

  private selectListSql(alias = 'r'): string {
    return `
      CONVERT(varchar(36), ${alias}.id) AS id,
      CONVERT(varchar(36), ${alias}.designerId) AS designerId,
      CONVERT(varchar(36), ${alias}.taskId) AS taskId,
      ${alias}.[date],
      ${alias}.duration,
      ${alias}.reason,
      ${alias}.notes,
      ${alias}.status,
      CONVERT(varchar(36), ${alias}.approverId) AS approverId,
      ${alias}.approverRemarks,
      ${alias}.reviewedAt,
      ${alias}.createdAt,
      LTRIM(RTRIM(t.title)) AS taskTitle,
      LTRIM(RTRIM(t.taskNo)) AS taskNo,
      LTRIM(RTRIM(t.opNo)) AS opNo,
      LTRIM(RTRIM(du.fullName)) AS designerName,
      LTRIM(RTRIM(d.name)) AS departmentName,
      LTRIM(RTRIM(au.fullName)) AS approverName
    `;
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

  private mapRow(row: RawRegularizationRow): RegularizationRequestView {
    return {
      id: row.id,
      designerId: row.designerId,
      designerName: row.designerName?.trim() || 'Unknown',
      employeeId: row.designerId,
      departmentName: row.departmentName?.trim() || '—',
      taskId: row.taskId,
      taskName: this.formatTaskDisplay({
        title: row.taskTitle,
        taskNo: row.taskNo,
        opNo: row.opNo,
      }),
      date: this.toYyyyMmDd(row.date ? new Date(row.date) : null),
      duration: this.formatDuration(row.duration),
      reason: row.reason ?? '',
      notes: row.notes ?? '',
      status: this.mapStatus(row.status),
      approverId: row.approverId && row.approverId.trim() ? row.approverId : null,
      approverName: row.approverName?.trim() || null,
      approverRemarks: row.approverRemarks?.trim() || null,
      reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date(0).toISOString(),
    };
  }

  private async loadRowById(id: string): Promise<RegularizationRequestView> {
    const idLit = sqlUniqueIdentifier(id);
    const rows = await this.prisma.$queryRawUnsafe<RawRegularizationRow[]>(`
      SELECT TOP (1)
        ${this.selectListSql('r')}
      ${this.joinSql('r')}
      WHERE r.id = ${idLit}
    `);
    const row = rows[0];
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
    if (role === UserRole.HOD || role === UserRole.ADMIN) return;
    if (submitterId !== designerId) {
      throw new ForbiddenException('You can only submit regularization requests for yourself');
    }
  }

  private async assertReviewerAccess(reviewerId: string, role: UserRole, request: RegularizationRequestView) {
    if (role === UserRole.ADMIN) return;

    if (role !== UserRole.HOD) {
      throw new ForbiddenException('Only HOD or Admin can review regularization requests');
    }

    const [reviewer, designer] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: reviewerId }, select: { departmentId: true } }),
      this.prisma.user.findUnique({ where: { id: request.designerId }, select: { departmentId: true } }),
    ]);

    if (reviewer?.departmentId && designer?.departmentId && reviewer.departmentId !== designer.departmentId) {
      throw new ForbiddenException('You can only review requests from your department');
    }
  }

  async listTaskOptions(designerId: string): Promise<RegularizationTaskOption[]> {
    if (!isUuidString(designerId)) {
      throw new BadRequestException('designerId must be a UUID matching ErpTSRegularizationRequest.designerId (uniqueidentifier).');
    }
    const designerSql = sqlUniqueIdentifier(designerId);

    let historicalTaskIds: string[] = [];
    try {
      const idRows = await this.prisma.$queryRawUnsafe<Array<{ taskId: string }>>(`
        SELECT DISTINCT CONVERT(varchar(36), taskId) AS taskId
        FROM ${this.table}
        WHERE designerId = ${designerSql} AND taskId IS NOT NULL
      `);
      historicalTaskIds = idRows.map((r) => r.taskId).filter((id) => isUuidString(id));
    } catch (err) {
      this.logger.warn(`Regularization historical task ids: ${err instanceof Error ? err.message : err}`);
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
      throw new BadRequestException('designerId must be a UUID matching ErpTSRegularizationRequest.designerId (uniqueidentifier).');
    }
    try {
      const designerSql = sqlUniqueIdentifier(designerId);
      const rows = await this.prisma.$queryRawUnsafe<RawRegularizationRow[]>(`
      SELECT TOP (1000)
        ${this.selectListSql('r')}
      ${this.joinSql('r')}
      WHERE r.designerId = ${designerSql}
      ORDER BY r.createdAt DESC
    `);
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.fail('Regularization list query failed', err);
    }
  }

  async findOne(id: string, userId: string, role: UserRole): Promise<RegularizationRequestView> {
    if (!isUuidString(id)) throw new BadRequestException('id must be a UUID.');
    const request = await this.loadRowById(id);

    if (role === UserRole.ADMIN || role === UserRole.HOD) {
      if (role === UserRole.HOD) {
        await this.assertReviewerAccess(userId, role, request);
      }
      return request;
    }

    if (request.designerId !== userId) {
      throw new ForbiddenException('You do not have access to this request');
    }
    return request;
  }

  async findPendingApprovals(managerId: string, role: UserRole): Promise<RegularizationRequestView[]> {
    if (role !== UserRole.HOD && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only HOD or Admin can view pending approvals');
    }

    let departmentFilter = '';
    if (role === UserRole.HOD) {
      const manager = await this.prisma.user.findUnique({
        where: { id: managerId },
        select: { departmentId: true },
      });
      if (manager?.departmentId) {
        departmentFilter = `AND du.departmentId = N'${this.esc(manager.departmentId)}'`;
      }
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<RawRegularizationRow[]>(`
        SELECT TOP (500)
          ${this.selectListSql('r')}
        ${this.joinSql('r')}
        WHERE LOWER(LTRIM(RTRIM(r.status))) = N'pending'
        ${departmentFilter}
        ORDER BY r.createdAt DESC
      `);
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      this.fail('Regularization pending approvals query failed', err);
    }
  }

  async findTeamRequests(
    managerId: string,
    role: UserRole,
    filters: { status?: string; designerId?: string },
  ): Promise<RegularizationRequestView[]> {
    if (role !== UserRole.HOD && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only HOD or Admin can view team requests');
    }

    const whereParts: string[] = ['1=1'];
    if (filters.status?.trim()) {
      whereParts.push(`LOWER(LTRIM(RTRIM(r.status))) = LOWER(N'${this.esc(filters.status.trim())}')`);
    }
    if (filters.designerId?.trim() && isUuidString(filters.designerId)) {
      whereParts.push(`r.designerId = ${sqlUniqueIdentifier(filters.designerId.trim())}`);
    }
    if (role === UserRole.HOD) {
      const manager = await this.prisma.user.findUnique({
        where: { id: managerId },
        select: { departmentId: true },
      });
      if (manager?.departmentId) {
        whereParts.push(`du.departmentId = N'${this.esc(manager.departmentId)}'`);
      }
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<RawRegularizationRow[]>(`
        SELECT TOP (1000)
          ${this.selectListSql('r')}
        ${this.joinSql('r')}
        WHERE ${whereParts.join(' AND ')}
        ORDER BY r.createdAt DESC
      `);
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      this.fail('Regularization team requests query failed', err);
    }
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
      select: { id: true },
    });
    if (!task) throw new BadRequestException('Task not found');

    const hods = await this.findDepartmentHods(designer.departmentId);
    const assignedHodId = hods[0]?.id ?? null;

    const status = dto.status?.trim() || 'Pending';
    const dur = dto.duration.trim();
    const durationSql = /^\d+$/.test(dur) ? dur : `N'${this.esc(dur)}'`;
    const notesSql = dto.notes?.trim() ? `N'${this.esc(dto.notes.trim())}'` : 'NULL';
    const approverSql = assignedHodId ? sqlUniqueIdentifier(assignedHodId) : 'NULL';

    const designerSql = sqlUniqueIdentifier(dto.designerId);
    const taskSql = sqlUniqueIdentifier(dto.taskId);

    let idRows: Array<{ id: string }>;
    try {
      idRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(`
      DECLARE @ids TABLE (rid uniqueidentifier);
      INSERT INTO ${this.table} (
        designerId,
        taskId,
        [date],
        duration,
        reason,
        notes,
        status,
        approverId,
        createdAt
      )
      OUTPUT INSERTED.id INTO @ids(rid)
      VALUES (
        ${designerSql},
        ${taskSql},
        CAST(N'${this.esc(dto.date)}' AS DATE),
        ${durationSql},
        N'${this.esc(dto.reason)}',
        ${notesSql},
        N'${this.esc(status)}',
        ${approverSql},
        SYSUTCDATETIME()
      );
      SELECT CONVERT(varchar(36), rid) AS id FROM @ids;
    `);
    } catch (err) {
      this.fail('Regularization insert failed', err);
    }

    const newId = idRows[0]?.id;
    if (newId == null || !isUuidString(newId)) {
      throw new Error('Insert did not return id');
    }

    const request = await this.loadRowById(newId);

    await this.activityLogger.log({
      action: ActivityAction.REGULARIZATION_SUBMITTED,
      userId: submitterId,
      taskId: dto.taskId,
      details: {
        event: ActivityAction.REGULARIZATION_SUBMITTED,
        messageKey: 'regularization_submitted',
        changes: {
          requestId: newId,
          date: dto.date,
          reason: dto.reason,
          status,
          assignedHodId,
        },
        context: { designerId: dto.designerId, departmentId: designer.departmentId ?? null },
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

    const idLit = sqlUniqueIdentifier(id);
    const approverLit = sqlUniqueIdentifier(reviewerId);
    const remarksSql = remarks ? `N'${this.esc(remarks)}'` : 'NULL';

    try {
      await this.prisma.$executeRawUnsafe(`
      UPDATE ${this.table}
      SET
        status = N'${this.esc(dto.status)}',
        approverId = ${approverLit},
        approverRemarks = ${remarksSql},
        reviewedAt = SYSUTCDATETIME()
      WHERE id = ${idLit}
    `);
    } catch (err) {
      this.fail('Regularization review update failed', err);
    }

    const updated = await this.loadRowById(id);

    const action =
      dto.status === 'Approved'
        ? ActivityAction.REGULARIZATION_APPROVED
        : ActivityAction.REGULARIZATION_REJECTED;

    await this.activityLogger.log({
      action,
      userId: reviewerId,
      taskId: updated.taskId,
      details: {
        event: action,
        messageKey: dto.status === 'Approved' ? 'regularization_approved' : 'regularization_rejected',
        changes: {
          requestId: id,
          status: dto.status,
          approverId: reviewerId,
          remarks: remarks || null,
          reviewedAt: updated.reviewedAt,
        },
        context: { designerId: updated.designerId },
      },
    });

    await this.notifyDesigner(updated, dto.status, remarks).catch((err) => {
      this.logger.warn(`Failed to notify designer: ${err instanceof Error ? err.message : err}`);
    });

    return updated;
  }

  /** @deprecated Use review() — kept for backward compatibility */
  async updateStatus(id: string, dto: UpdateRegularizationStatusDto, reviewerId?: string, role?: UserRole): Promise<RegularizationRequestView> {
    if (reviewerId && role && (dto.status === 'Approved' || dto.status === 'Rejected')) {
      return this.review(id, reviewerId, role, {
        status: dto.status,
        remarks: undefined,
      });
    }

    if (!isUuidString(id)) {
      throw new BadRequestException('id must be a UUID.');
    }
    const idLit = sqlUniqueIdentifier(id);

    const defaultApprover = process.env.REGULARIZATION_DEFAULT_APPROVER_ID?.trim();
    const approverGuid = dto.approverId?.trim() ?? (defaultApprover && isUuidString(defaultApprover) ? defaultApprover : null);
    const approverSql =
      approverGuid && isUuidString(approverGuid) ? sqlUniqueIdentifier(approverGuid) : 'NULL';

    try {
      await this.prisma.$executeRawUnsafe(`
      UPDATE ${this.table}
      SET
        status = N'${this.esc(dto.status)}',
        approverId = ${approverSql}
      WHERE id = ${idLit}
    `);
    } catch (err) {
      this.fail('Regularization status update failed', err);
    }

    return this.loadRowById(id);
  }
}
