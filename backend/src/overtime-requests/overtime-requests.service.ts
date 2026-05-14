import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { UpdateOvertimeRequestDto } from './dto/update-overtime-request.dto';
import { isUuidString, sqlUniqueIdentifier } from '../regularization-requests/sql-uuid.util';

type RawOvertimeRow = {
  id: string;
  designerId: string;
  taskId: string;
  date: Date;
  estimatedRemaining: string | null;
  requestedHours: string | null;
  approvedHours: string | null;
  reason: string | null;
  status: string | null;
  createdAt: Date;
};

export type OvertimeRequestView = {
  id: string;
  designerId: string;
  taskId: string;
  taskName: string;
  date: string;
  estimatedRemaining: string;
  requested: string;
  approved: string;
  reason: string;
  status: string;
  createdAt: string;
};

@Injectable()
export class OvertimeRequestsService {
  private readonly logger = new Logger(OvertimeRequestsService.name);
  private readonly table: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const catalog = (this.config.get<string>('erp.sqlCatalog') ?? '').trim();
    if (catalog && !/^[\w-]+$/.test(catalog)) {
      throw new Error('Invalid erp.sqlCatalog / ERP_SQL_CATALOG');
    }
    this.table = catalog
      ? `[${catalog}].[dbo].[ErpTSOvertimeRequest]`
      : `[dbo].[ErpTSOvertimeRequest]`;
  }

  private fail(context: string, err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`${context}: ${msg}`);
    throw new HttpException(`${context}: ${msg}`, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private esc(s: string): string {
    return s.replace(/'/g, "''");
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

  private mapUiStatus(db: string | null | undefined): string {
    const t = (db ?? '').trim().toLowerCase();
    if (t === 'approved') return 'Approved';
    if (t === 'rejected') return 'Rejected';
    return 'Pending Approval';
  }

  private selectListSql(): string {
    return `
      CONVERT(varchar(36), id) AS id,
      CONVERT(varchar(36), designerId) AS designerId,
      CONVERT(varchar(36), taskId) AS taskId,
      [date],
      estimatedRemaining,
      requestedHours,
      approvedHours,
      reason,
      status,
      createdAt
    `;
  }

  private mapRow(row: RawOvertimeRow): OvertimeRequestView {
    const req = (row.requestedHours ?? '').trim() || '—';
    const appr = (row.approvedHours ?? '').trim();
    return {
      id: row.id,
      designerId: row.designerId,
      taskId: row.taskId,
      taskName: `Task #${row.taskId}`,
      date: this.toYyyyMmDd(row.date ? new Date(row.date) : null),
      estimatedRemaining: (row.estimatedRemaining ?? '').trim() || '—',
      requested: req,
      approved: appr.length ? appr : '—',
      reason: (row.reason ?? '').trim() || '—',
      status: this.mapUiStatus(row.status),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date(0).toISOString(),
    };
  }

  async findByDesigner(designerId: string): Promise<OvertimeRequestView[]> {
    if (!isUuidString(designerId)) {
      throw new BadRequestException(
        'designerId must be a UUID matching ErpTSOvertimeRequest.designerId (uniqueidentifier).',
      );
    }
    try {
      const designerSql = sqlUniqueIdentifier(designerId);
      const rows = await this.prisma.$queryRawUnsafe<RawOvertimeRow[]>(`
      SELECT TOP (1000)
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE designerId = ${designerSql}
      ORDER BY createdAt DESC
    `);
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.fail('Overtime list query failed', err);
    }
  }

  async create(dto: CreateOvertimeRequestDto): Promise<OvertimeRequestView> {
    const status = dto.status?.trim() || 'Pending';
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
        estimatedRemaining,
        requestedHours,
        approvedHours,
        reason,
        status,
        createdAt
      )
      OUTPUT INSERTED.id INTO @ids(rid)
      VALUES (
        ${designerSql},
        ${taskSql},
        CAST(N'${this.esc(dto.date)}' AS DATE),
        N'${this.esc(dto.estimatedRemaining)}',
        N'${this.esc(dto.requestedHours)}',
        NULL,
        N'${this.esc(dto.reason)}',
        N'${this.esc(status)}',
        SYSUTCDATETIME()
      );
      SELECT CONVERT(varchar(36), rid) AS id FROM @ids;
    `);
    } catch (err) {
      this.fail('Overtime insert failed', err);
    }

    const newId = idRows[0]?.id;
    if (newId == null || !isUuidString(newId)) {
      throw new Error('Insert did not return id');
    }

    let rows: RawOvertimeRow[];
    try {
      const idLit = sqlUniqueIdentifier(newId);
      rows = await this.prisma.$queryRawUnsafe<RawOvertimeRow[]>(`
      SELECT TOP (1)
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE id = ${idLit}
    `);
    } catch (err) {
      this.fail('Overtime load-after-insert failed', err);
    }
    const row = rows[0];
    if (!row) throw new NotFoundException('Created overtime request not found');
    return this.mapRow(row);
  }

  async update(id: string, dto: UpdateOvertimeRequestDto): Promise<OvertimeRequestView> {
    if (!isUuidString(id)) {
      throw new BadRequestException('id must be a UUID.');
    }
    const idLit = sqlUniqueIdentifier(id);
    const st = dto.status;
    let setClause: string;
    if (st === 'Pending') {
      setClause = `status = N'${this.esc(st)}'`;
    } else if (st === 'Approved') {
      const v = `N'${this.esc((dto.approvedHours ?? '').trim() || '0 hours')}'`;
      setClause = `status = N'${this.esc(st)}', approvedHours = ${v}`;
    } else {
      setClause = `status = N'${this.esc(st)}', approvedHours = N'0 hours'`;
    }

    try {
      await this.prisma.$executeRawUnsafe(`
      UPDATE ${this.table}
      SET ${setClause}
      WHERE id = ${idLit}
    `);
    } catch (err) {
      this.fail('Overtime update failed', err);
    }

    let rows: RawOvertimeRow[];
    try {
      rows = await this.prisma.$queryRawUnsafe<RawOvertimeRow[]>(`
      SELECT TOP (1)
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE id = ${idLit}
    `);
    } catch (err) {
      this.fail('Overtime load-after-update failed', err);
    }
    const row = rows[0];
    if (!row) throw new NotFoundException('Overtime request not found');
    return this.mapRow(row);
  }
}
