import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

type RawChatterPostRow = {
  id: string;
  taskId: string | null;
  authorId: string | null;
  title: string | null;
  message: string | null;
  postType: string | null;
  mentionUserId: string | null;
  priority: string | number | null;
  seenByCount: number | null;
  attachmentCount: number | null;
  isPinned: boolean | number | null;
  editedAt: Date | null;
  visibility: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ChatterPostDto = {
  id: string;
  taskId: string | null;
  authorId: string | null;
  title: string;
  message: string;
  postType: string | null;
  mentionUserId: string | null;
  priority: string | number | null;
  seenByCount: number;
  attachmentCount: number;
  isPinned: boolean;
  editedAt: string | null;
  visibility: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ChatterPostsService {
  private readonly logger = new Logger(ChatterPostsService.name);
  private readonly table: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const catalog = (this.config.get<string>('erp.sqlCatalog') ?? '').trim();
    if (catalog && !/^[\w-]+$/.test(catalog)) {
      throw new Error('Invalid erp.sqlCatalog / ERP_SQL_CATALOG');
    }
    this.table = catalog ? `[${catalog}].[dbo].[ErpTSChatterPost]` : `[dbo].[ErpTSChatterPost]`;
  }

  private fail(context: string, err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`${context}: ${msg}`);
    throw new HttpException(`${context}: ${msg}`, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private esc(s: string): string {
    return s.replace(/'/g, "''");
  }

  private toIso(d: Date | null | undefined): string | null {
    if (d == null || isNaN(new Date(d).getTime())) return null;
    return new Date(d).toISOString();
  }

  private toBool(value: boolean | number | null | undefined): boolean {
    if (value === true || value === 1) return true;
    return false;
  }

  private mapRow(row: RawChatterPostRow): ChatterPostDto {
    return {
      id: String(row.id ?? '').trim(),
      taskId: row.taskId != null && String(row.taskId).trim() ? String(row.taskId).trim() : null,
      authorId: row.authorId != null && String(row.authorId).trim() ? String(row.authorId).trim() : null,
      title: row.title?.trim() ?? '',
      message: row.message?.trim() ?? '',
      postType: row.postType?.trim() ?? null,
      mentionUserId:
        row.mentionUserId != null && String(row.mentionUserId).trim() ? String(row.mentionUserId).trim() : null,
      priority: row.priority,
      seenByCount: row.seenByCount == null || Number.isNaN(Number(row.seenByCount)) ? 0 : Number(row.seenByCount),
      attachmentCount:
        row.attachmentCount == null || Number.isNaN(Number(row.attachmentCount)) ? 0 : Number(row.attachmentCount),
      isPinned: this.toBool(row.isPinned),
      editedAt: this.toIso(row.editedAt ? new Date(row.editedAt) : null),
      visibility: row.visibility?.trim() ?? null,
      createdAt: this.toIso(row.createdAt ? new Date(row.createdAt) : new Date(0)) ?? new Date(0).toISOString(),
      updatedAt: this.toIso(row.updatedAt ? new Date(row.updatedAt) : row.createdAt ? new Date(row.createdAt) : new Date(0)) ?? new Date(0).toISOString(),
    };
  }

  private selectListSql(): string {
    return `
      CAST(id AS NVARCHAR(450)) AS id,
      CAST(taskId AS NVARCHAR(450)) AS taskId,
      CAST(authorId AS NVARCHAR(450)) AS authorId,
      title,
      message,
      postType,
      CAST(mentionUserId AS NVARCHAR(450)) AS mentionUserId,
      priority,
      seenByCount,
      attachmentCount,
      isPinned,
      editedAt,
      visibility,
      createdAt,
      updatedAt
    `;
  }

  async findAll(limitParam?: string, taskIdFilter?: string): Promise<ChatterPostDto[]> {
    const limit = Math.min(1000, Math.max(1, Number.parseInt(limitParam ?? '500', 10) || 500));
    const taskId = taskIdFilter?.trim() ?? '';
    const taskClause =
      taskId.length > 0
        ? `AND CAST(taskId AS NVARCHAR(450)) = N'${this.esc(taskId)}'`
        : '';

    try {
      const rows = await this.prisma.$queryRawUnsafe<RawChatterPostRow[]>(`
      SELECT TOP (${limit})
        ${this.selectListSql()}
      FROM ${this.table}
      WHERE 1=1
      ${taskClause}
      ORDER BY updatedAt DESC, createdAt DESC
    `);
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      this.fail('Chatter posts query failed', err);
    }
  }
}
