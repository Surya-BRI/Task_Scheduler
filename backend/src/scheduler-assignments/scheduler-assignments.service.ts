import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

type RawAssignmentRow = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: string | number | null;
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
};

export type SchedulerAssignmentDto = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: number;
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
};

@Injectable()
export class SchedulerAssignmentsService {
  private readonly logger = new Logger(SchedulerAssignmentsService.name);
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
      ? `[${catalog}].[dbo].[ErpTSSchedulerAssignment]`
      : `[dbo].[ErpTSSchedulerAssignment]`;
  }

  private fail(context: string, err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`${context}: ${msg}`);
    throw new HttpException(`${context}: ${msg}`, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private esc(s: string): string {
    return s.replace(/'/g, "''");
  }

  private toIso(d: Date | null | undefined): string {
    if (d == null || isNaN(new Date(d).getTime())) return new Date(0).toISOString();
    return new Date(d).toISOString();
  }

  private toHours(value: string | number | null | undefined): number {
    if (value == null) return 0;
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(n) ? n : 0;
  }

  private toBool(value: boolean | number | null | undefined): boolean {
    if (value === true || value === 1) return true;
    return false;
  }

  private mapRow(row: RawAssignmentRow): SchedulerAssignmentDto {
    const parentId = row.parentId?.trim() ? row.parentId.trim() : null;
    const assignedBy = row.assignedBy?.trim() ? row.assignedBy.trim() : null;
    return {
      id: row.id,
      designerId: String(row.designerId ?? '').trim(),
      taskId: String(row.taskId ?? '').trim(),
      dayIndex: Number(row.dayIndex),
      assignedHours: this.toHours(row.assignedHours),
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
    };
  }

  private selectListSql(): string {
    return `
      CAST(id AS NVARCHAR(450)) AS id,
      CAST(designerId AS NVARCHAR(64)) AS designerId,
      CAST(taskId AS NVARCHAR(450)) AS taskId,
      dayIndex,
      assignedHours,
      CAST(parentId AS NVARCHAR(450)) AS parentId,
      splitIndex,
      totalParts,
      weekStartDate,
      weekEndDate,
      notes,
      isLocked,
      CAST(assignedBy AS NVARCHAR(450)) AS assignedBy,
      createdAt,
      updatedAt
    `;
  }

  /** weekStart: Monday date as YYYY-MM-DD (matches UI week picker). */
  async findForWeekStart(weekStart: string): Promise<SchedulerAssignmentDto[]> {
    const trimmed = weekStart.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('weekStart must be YYYY-MM-DD (Monday of the week).');
    }

    try {
      const dateLit = this.esc(trimmed);
      const rows = await this.prisma.$queryRawUnsafe<RawAssignmentRow[]>(`
      SELECT TOP (2000)
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE CAST(weekStartDate AS DATE) = CAST(N'${dateLit}' AS DATE)
      ORDER BY designerId, dayIndex, id
    `);
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.fail('Scheduler assignments query failed', err);
    }
  }
}
