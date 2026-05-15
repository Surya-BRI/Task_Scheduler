import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export type ChatterPostDto = {
  id: string;
  taskId: string | null;
  authorId: string | null;
  title: string;
  message: string;
  postType: string | null;
  mentionUserId: string | null;
  priority: string | null;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async listMentionUsers() {
    const users = await this.usersService.findAll();
    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
    }));
  }

  private mapRow(row: any): ChatterPostDto {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
    const editedAtRaw = row.editedAt;
    const editedAt =
      editedAtRaw instanceof Date
        ? editedAtRaw.toISOString()
        : editedAtRaw
          ? new Date(editedAtRaw).toISOString()
          : null;

    return {
      id: String(row.id),
      taskId: row.taskId != null ? String(row.taskId) : null,
      authorId: row.authorId != null ? String(row.authorId) : null,
      title: row.title,
      message: row.message,
      postType: row.postType ?? null,
      mentionUserId: row.mentionUserId != null ? String(row.mentionUserId) : null,
      priority: row.priority ?? null,
      seenByCount: Number(row.seenByCount ?? 0),
      attachmentCount: Number(row.attachmentCount ?? row._count?.attachments ?? 0),
      isPinned: Boolean(row.isPinned),
      editedAt,
      visibility: row.visibility ?? null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  async findAll(limitParam?: string, taskIdFilter?: string): Promise<ChatterPostDto[]> {
    const limit = Math.min(1000, Math.max(1, Number.parseInt(limitParam ?? '500', 10) || 500));
    const taskId = taskIdFilter?.trim() || null;

    // Raw query: ERP rows may have NULL authorId; Prisma client rejects those until regenerated.
    const rows = taskId
      ? await this.prisma.$queryRaw<
          Array<Record<string, unknown>>
        >`
          SELECT TOP (${limit})
            id, taskId, authorId, title, message, postType, mentionUserId, priority,
            seenByCount, attachmentCount, isPinned, editedAt, visibility, createdAt, updatedAt
          FROM ErpTSChatterPost
          WHERE taskId = ${taskId}
          ORDER BY updatedAt DESC, createdAt DESC`
      : await this.prisma.$queryRaw<
          Array<Record<string, unknown>>
        >`
          SELECT TOP (${limit})
            id, taskId, authorId, title, message, postType, mentionUserId, priority,
            seenByCount, attachmentCount, isPinned, editedAt, visibility, createdAt, updatedAt
          FROM ErpTSChatterPost
          ORDER BY updatedAt DESC, createdAt DESC`;

    return rows.map((r) => this.mapRow(r));
  }

  async create(dto: CreateChatterPostDto, authorId: string, files?: Express.Multer.File[]): Promise<ChatterPostDto> {
    const newPost = await this.prisma.chatterPost.create({
      data: {
        title: dto.title,
        message: dto.message,
        postType: dto.postType || null,
        priority: dto.priority || null,
        visibility: dto.visibility || null,
        taskId: dto.taskId || null,
        authorId: authorId,
        mentionUserId: optionalUuid(dto.mentionUserId),
        attachments: files && files.length > 0 ? {
          create: files.map((f) => ({
            fileName: f.originalname,
            filePath: f.path.replace(/\\/g, '/'),
            mimeType: f.mimetype,
            sizeBytes: BigInt(f.size),
          }))
        } : undefined,
      },
      include: {
        _count: {
          select: { attachments: true }
        }
      }
    });

    // Also log this as an activity
    try {
      await this.prisma.activityLog.create({
        data: {
          action: 'CREATED_CHATTER_POST',
          details: JSON.stringify({ title: dto.title, postType: dto.postType }),
          userId: authorId,
          taskId: dto.taskId || null,
        }
      });
    } catch (e) {
      this.logger.error('Failed to create activity log for chatter post', e);
    }

    return this.mapRow(newPost);
  }
}
