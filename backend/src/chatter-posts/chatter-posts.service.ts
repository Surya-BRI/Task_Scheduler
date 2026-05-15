import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateChatterCommentDto } from './dto/create-chatter-comment.dto';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export type ChatterCommentDto = {
  id: string;
  postId: string | null;
  authorId: string | null;
  message: string;
  createdAt: string;
};

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
  comments: ChatterCommentDto[];
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

  private mapCommentRow(row: Record<string, unknown>): ChatterCommentDto {
    const createdAt =
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as string | number | Date);
    return {
      id: String(row.id),
      postId: row.postId != null ? String(row.postId) : null,
      authorId: row.authorId != null ? String(row.authorId) : null,
      message: String(row.message ?? ''),
      createdAt: createdAt.toISOString(),
    };
  }

  private async findCommentsByPostIds(postIds: string[]): Promise<ChatterCommentDto[]> {
    const ids = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, postId, authorId, message, createdAt
      FROM ErpTSChatterComment
      WHERE postId IN (${Prisma.join(ids)})
      ORDER BY createdAt DESC`;

    return rows.map((row) => this.mapCommentRow(row));
  }

  private attachComments(posts: ChatterPostDto[], comments: ChatterCommentDto[]): ChatterPostDto[] {
    const byPostId = new Map<string, ChatterCommentDto[]>();
    for (const comment of comments) {
      const key = comment.postId ?? '';
      if (!key) continue;
      const bucket = byPostId.get(key) ?? [];
      bucket.push(comment);
      byPostId.set(key, bucket);
    }
    return posts.map((post) => ({
      ...post,
      comments: byPostId.get(post.id) ?? [],
    }));
  }

  private mapRow(row: any): Omit<ChatterPostDto, 'comments'> {
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

    const posts = rows.map((r) => ({ ...this.mapRow(r), comments: [] as ChatterCommentDto[] }));
    const comments = await this.findCommentsByPostIds(posts.map((p) => p.id));
    return this.attachComments(posts, comments);
  }

  async findCommentsForPost(postId: string): Promise<ChatterCommentDto[]> {
    const id = postId.trim();
    if (!optionalUuid(id)) {
      throw new BadRequestException('postId must be a valid UUID');
    }
    return this.findCommentsByPostIds([id]);
  }

  async createComment(
    postId: string,
    dto: CreateChatterCommentDto,
    authorId: string,
  ): Promise<ChatterCommentDto> {
    const normalizedPostId = postId.trim();
    if (!optionalUuid(normalizedPostId)) {
      throw new BadRequestException('postId must be a valid UUID');
    }

    const postExists = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT TOP 1 id FROM ErpTSChatterPost WHERE id = ${normalizedPostId}`;
    if (!postExists.length) {
      throw new NotFoundException('Chatter post not found');
    }

    const created = await this.prisma.chatterComment.create({
      data: {
        postId: normalizedPostId,
        authorId,
        message: dto.message.trim(),
      },
    });

    try {
      await this.prisma.activityLog.create({
        data: {
          action: 'CREATED_CHATTER_COMMENT',
          details: JSON.stringify({ postId: normalizedPostId }),
          userId: authorId,
          taskId: null,
        },
      });
    } catch (e) {
      this.logger.error('Failed to create activity log for chatter comment', e);
    }

    return this.mapCommentRow(created as unknown as Record<string, unknown>);
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

    return { ...this.mapRow(newPost), comments: [] };
  }
}
