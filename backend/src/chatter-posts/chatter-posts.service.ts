import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';

const DEBUG_SESSION_ID = '370717';

/** Append one NDJSON line to `debug-370717.log` (repo root or parent of `process.cwd()`). */
function appendSessionDebugLine(entry: Record<string, unknown>): void {
  const line =
    JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      ...entry,
      timestamp: new Date().toISOString(),
    }) + '\n';
  for (const base of [process.cwd(), join(process.cwd(), '..')]) {
    try {
      appendFileSync(join(base, 'debug-370717.log'), line, { flag: 'a' });
      return;
    } catch {
      /* try next base */
    }
  }
}

/** Allow only bracketed SQL Server identifiers and dots (no semicolons / quotes). */
function assertSafeChatterSqlFromObject(ref: string): void {
  const s = ref.trim();
  if (s.length > 280) {
    throw new Error('ERP_CHATTER_POST_SQL_OBJECT is too long');
  }
  if (!/^[\s\[\]a-zA-Z0-9_.-]+$/.test(s)) {
    throw new Error('ERP_CHATTER_POST_SQL_OBJECT: only identifiers, brackets, dots, and spaces are allowed');
  }
  if (/;|'|--|\/\*|\*\//i.test(s)) {
    throw new Error('ERP_CHATTER_POST_SQL_OBJECT: forbidden sequence');
  }
}

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
    const sqlObjectRaw = this.config.get<string>('erp.chatterPostSqlObject') || process.env.ERP_CHATTER_POST_SQL_OBJECT || '';
    const sqlObject = sqlObjectRaw.trim();
    if (sqlObject) {
      assertSafeChatterSqlFromObject(sqlObject);
      this.table = sqlObject;
    } else {
      const catalog = (this.config.get<string>('erp.sqlCatalog') ?? '').trim();
      if (catalog && !/^[\w-]+$/.test(catalog)) {
        throw new Error('Invalid erp.sqlCatalog / ERP_SQL_CATALOG');
      }
      const tableFromConfig = this.config.get<string>('erp.chatterPostTable');
      const tableFromEnv = process.env.ERP_CHATTER_POST_TABLE;
      const tableName = (tableFromConfig || tableFromEnv || 'ErpTSChatterPost').trim();
      if (!/^[\w-]+$/.test(tableName)) {
        throw new Error('Invalid erp.chatterPostTable / ERP_CHATTER_POST_TABLE');
      }
      this.table = catalog ? `[${catalog}].[dbo].[${tableName}]` : `[dbo].[${tableName}]`;
    }
    this.logger.log(`Chatter posts FROM object: ${this.table}`);
    appendSessionDebugLine({
      location: 'chatter-posts.service.ts:constructor',
      message: 'chatter_table_ready',
      data: {
        table: this.table,
        usedSqlObjectOverride: Boolean(sqlObject),
      },
    });
  }

  private fail(context: string, err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`${context}: ${msg}`);
    appendSessionDebugLine({
      location: 'chatter-posts.service.ts:fail',
      message: 'chatter_query_error',
      data: { context, error: msg.slice(0, 400) },
    });
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

  private getUuidOrNull(val: string | null | undefined): string {
    if (!val) return 'NULL';
    const s = val.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(s)) {
      return `N'${this.esc(s)}'`;
    }
    return 'NULL';
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
      appendSessionDebugLine({
        location: 'chatter-posts.service.ts:findAll',
        message: 'chatter_query_ok',
        data: { rowCount: rows.length, limit },
      });
      return rows.map((r) => this.mapRow(r));
    } catch (err) {
      this.fail('Chatter posts query failed', err);
    }
  }

  async create(dto: CreateChatterPostDto, files?: Express.Multer.File[]): Promise<ChatterPostDto> {
    const id = randomUUID();
    const taskId = this.getUuidOrNull(dto.taskId);
    const authorId = this.getUuidOrNull(dto.authorId);
    const title = `N'${this.esc(dto.title)}'`;
    const message = `N'${this.esc(dto.message)}'`;
    const postType = dto.postType ? `N'${this.esc(dto.postType)}'` : 'NULL';
    const mentionUserId = this.getUuidOrNull(dto.mentionUserId);
    const priority = dto.priority ? `N'${this.esc(dto.priority)}'` : 'NULL';
    const visibility = dto.visibility ? `N'${this.esc(dto.visibility)}'` : 'NULL';
    const now = new Date().toISOString();
    const attachmentCount = files ? files.length : 0;

    try {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO ${this.table} (
          id, taskId, authorId, title, message, postType, mentionUserId, 
          priority, seenByCount, attachmentCount, isPinned, visibility, 
          createdAt, updatedAt
        ) VALUES (
          N'${id}', ${taskId}, ${authorId}, ${title}, ${message}, ${postType}, ${mentionUserId},
          ${priority}, 0, ${attachmentCount}, 0, ${visibility},
          '${now}', '${now}'
        )
      `);

      if (files && files.length > 0) {
        for (const file of files) {
          const fileId = randomUUID();
          const fileName = `N'${this.esc(file.originalname)}'`;
          const filePath = `N'${this.esc(file.path.replace(/\\/g, '/'))}'`;
          const mimeType = `N'${this.esc(file.mimetype)}'`;
          const sizeBytes = file.size;

          await this.prisma.$executeRawUnsafe(`
            INSERT INTO [dbo].[ErpTSChatterPostAttachment] (
              id, chatterPostId, fileName, filePath, mimeType, sizeBytes, createdAt
            ) VALUES (
              N'${fileId}', N'${id}', ${fileName}, ${filePath}, ${mimeType}, ${sizeBytes}, '${now}'
            )
          `);
        }
      }

      const [newRow] = await this.prisma.$queryRawUnsafe<RawChatterPostRow[]>(`
        SELECT ${this.selectListSql()}
        FROM ${this.table}
        WHERE id = N'${id}'
      `);

      if (!newRow) {
        throw new Error('Failed to retrieve newly created chatter post');
      }

      appendSessionDebugLine({
        location: 'chatter-posts.service.ts:create',
        message: 'chatter_post_created',
        data: { id },
      });

      return this.mapRow(newRow);
    } catch (err) {
      this.fail('Failed to create chatter post', err);
    }
  }
}
