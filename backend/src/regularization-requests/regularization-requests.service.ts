import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';
import { UpdateRegularizationStatusDto } from './dto/update-regularization-status.dto';
import { isUuidString, sqlUniqueIdentifier } from './sql-uuid.util';

/** Row shape when SELECT uses CONVERT(varchar(36), …) for uniqueidentifier columns. */
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
  createdAt: Date;
};

export type RegularizationRequestView = {
  id: string;
  designerId: string;
  taskId: string;
  taskName: string;
  date: string;
  duration: string;
  reason: string;
  notes: string;
  status: 'unsubmitted' | 'Pending' | 'Approved' | 'Rejected';
  approverId: string | null;
  createdAt: string;
};

@Injectable()
export class RegularizationRequestsService {
  private readonly logger = new Logger(RegularizationRequestsService.name);
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
      ? `[${catalog}].[dbo].[ErpTSRegularizationRequest]`
      : `[dbo].[ErpTSRegularizationRequest]`;
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

  private selectListSql(): string {
    return `
      CONVERT(varchar(36), id) AS id,
      CONVERT(varchar(36), designerId) AS designerId,
      CONVERT(varchar(36), taskId) AS taskId,
      [date],
      duration,
      reason,
      notes,
      status,
      CONVERT(varchar(36), approverId) AS approverId,
      createdAt
    `;
  }

  private mapRow(row: RawRegularizationRow): RegularizationRequestView {
    return {
      id: row.id,
      designerId: row.designerId,
      taskId: row.taskId,
      taskName: `Task #${row.taskId}`,
      date: this.toYyyyMmDd(row.date ? new Date(row.date) : null),
      duration: this.formatDuration(row.duration),
      reason: row.reason ?? '',
      notes: row.notes ?? '',
      status: this.mapStatus(row.status),
      approverId: row.approverId && row.approverId.trim() ? row.approverId : null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date(0).toISOString(),
    };
  }

  async findByDesigner(designerId: string): Promise<RegularizationRequestView[]> {
    if (!isUuidString(designerId)) {
      throw new BadRequestException('designerId must be a UUID matching ErpTSRegularizationRequest.designerId (uniqueidentifier).');
    }
    try {
      const designerSql = sqlUniqueIdentifier(designerId);
      const rows = await this.prisma.$queryRawUnsafe<RawRegularizationRow[]>(`
      SELECT TOP (1000)
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE designerId = ${designerSql}
      ORDER BY createdAt DESC
    `);
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.fail('Regularization list query failed', err);
    }
  }

  async create(dto: CreateRegularizationRequestDto): Promise<RegularizationRequestView> {
    const status = dto.status?.trim() || 'Pending';
    const dur = dto.duration.trim();
    const durationSql = /^\d+$/.test(dur) ? dur : `N'${this.esc(dur)}'`;
    const notesSql = dto.notes?.trim() ? `N'${this.esc(dto.notes.trim())}'` : 'NULL';

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
        NULL,
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

    let rows: RawRegularizationRow[];
    try {
      const idLit = sqlUniqueIdentifier(newId);
      rows = await this.prisma.$queryRawUnsafe<RawRegularizationRow[]>(`
      SELECT TOP (1)
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE id = ${idLit}
    `);
    } catch (err) {
      this.fail('Regularization load-after-insert failed', err);
    }
    const row = rows[0];
    if (!row) throw new NotFoundException('Created row not found');
    return this.mapRow(row);
  }

  async updateStatus(id: string, dto: UpdateRegularizationStatusDto): Promise<RegularizationRequestView> {
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

    let rows: RawRegularizationRow[];
    try {
      rows = await this.prisma.$queryRawUnsafe<RawRegularizationRow[]>(`
      SELECT TOP (1)
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE id = ${idLit}
    `);
    } catch (err) {
      this.fail('Regularization load-after-update failed', err);
    }
    const row = rows[0];
    if (!row) throw new NotFoundException('Regularization request not found');
    return this.mapRow(row);
  }
}
