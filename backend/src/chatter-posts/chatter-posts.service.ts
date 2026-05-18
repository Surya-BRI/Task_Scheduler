import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateChatterCommentDto } from './dto/create-chatter-comment.dto';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';
import { ActivityAction } from '../activities/activity-events';
import { ActivityLoggerService } from '../activities/activity-logger.service';

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
  authorName: string | null;
  authorRole: string | null;
  message: string;
  createdAt: string;
};

export type ChatterPostDto = {
  id: string;
  taskId: string | null;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly activityLogger: ActivityLoggerService,
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
      authorName: row.authorName != null ? String(row.authorName) : null,
      authorRole: row.authorRole != null ? String(row.authorRole) : null,
      message: String(row.message ?? ''),
      createdAt: createdAt.toISOString(),
    };
  }

  private async findCommentsByPostIds(postIds: string[]): Promise<ChatterCommentDto[]> {
    const ids = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        c.id,
        c.postId,
        c.authorId,
        u.fullName AS authorName,
        r.name AS authorRole,
        c.message,
        c.createdAt
      FROM ErpTSChatterComment c
      LEFT JOIN ErpTSUser u ON u.id = c.authorId
      LEFT JOIN ErpTSRole r ON r.id = u.roleId
      WHERE c.postId IN (${Prisma.join(ids)})
      ORDER BY c.createdAt DESC`;

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
      authorName: row.authorName != null ? String(row.authorName) : null,
      authorRole: row.authorRole != null ? String(row.authorRole) : null,
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

  async findAll(
    limitParam?: string,
    taskIdFilter?: string,
    projectIdFilter?: string,
  ): Promise<ChatterPostDto[]> {
    const limit = Math.min(1000, Math.max(1, Number.parseInt(limitParam ?? '500', 10) || 500));
    const taskId = taskIdFilter?.trim() || null;
    const projectId = projectIdFilter?.trim() || null;

    // Raw query: ERP rows may have NULL authorId; Prisma client rejects those until regenerated.
    const rows = taskId
      ? await this.prisma.$queryRaw<
          Array<Record<string, unknown>>
        >`
          SELECT TOP (${limit})
            p.id, p.taskId, p.authorId, u.fullName AS authorName, r.name AS authorRole, p.title, p.message, p.postType, p.mentionUserId, p.priority,
            p.seenByCount, p.attachmentCount, p.isPinned, p.editedAt, p.visibility, p.createdAt, p.updatedAt
          FROM ErpTSChatterPost p
          LEFT JOIN ErpTSUser u ON u.id = p.authorId
          LEFT JOIN ErpTSRole r ON r.id = u.roleId
          WHERE p.taskId = ${taskId}
          ORDER BY p.updatedAt DESC, p.createdAt DESC`
      : projectId
        ? await this.prisma.$queryRaw<
            Array<Record<string, unknown>>
          >`
            SELECT TOP (${limit})
              p.id, p.taskId, p.authorId, p.title, p.message, p.postType, p.mentionUserId, p.priority,
              u.fullName AS authorName, r.name AS authorRole,
              p.seenByCount, p.attachmentCount, p.isPinned, p.editedAt, p.visibility, p.createdAt, p.updatedAt
            FROM ErpTSChatterPost p
            JOIN ErpTSTask t ON t.id = p.taskId
            LEFT JOIN ErpTSUser u ON u.id = p.authorId
            LEFT JOIN ErpTSRole r ON r.id = u.roleId
            WHERE t.projectId = ${projectId}
            ORDER BY p.updatedAt DESC, p.createdAt DESC`
      : await this.prisma.$queryRaw<
          Array<Record<string, unknown>>
        >`
          SELECT TOP (${limit})
            p.id, p.taskId, p.authorId, u.fullName AS authorName, r.name AS authorRole, p.title, p.message, p.postType, p.mentionUserId, p.priority,
            p.seenByCount, p.attachmentCount, p.isPinned, p.editedAt, p.visibility, p.createdAt, p.updatedAt
          FROM ErpTSChatterPost p
          LEFT JOIN ErpTSUser u ON u.id = p.authorId
          LEFT JOIN ErpTSRole r ON r.id = u.roleId
          ORDER BY p.updatedAt DESC, p.createdAt DESC`;

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

    const postExists = await this.prisma.$queryRaw<Array<{ id: string; taskId: string | null; projectId: string | null }>>`
      SELECT TOP 1 p.id, p.taskId, t.projectId
      FROM ErpTSChatterPost p
      LEFT JOIN ErpTSTask t ON t.id = p.taskId
      WHERE p.id = ${normalizedPostId}`;
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

    await this.activityLogger.log({
      action: ActivityAction.CREATED_CHATTER_COMMENT,
      userId: authorId,
      taskId: postExists[0].taskId ?? null,
      details: {
        event: ActivityAction.CREATED_CHATTER_COMMENT,
        messageKey: 'chatter_comment_created',
        taskSnapshot: postExists[0].taskId ? { id: postExists[0].taskId } : undefined,
        projectSnapshot: postExists[0].projectId ? { id: postExists[0].projectId } : undefined,
        changes: { postId: normalizedPostId },
        context: { projectId: postExists[0].projectId ?? null, postId: normalizedPostId },
      },
    });

    return this.mapCommentRow(created as unknown as Record<string, unknown>);
  }

  async create(dto: CreateChatterPostDto, authorId: string, files?: Express.Multer.File[]): Promise<ChatterPostDto> {
    const newPost = await this.prisma.chatterPost.create({
      data: {
        title: dto.title?.trim() || 'Chatter Post',
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

    let projectId: string | null = null;
    if (newPost.taskId) {
      const taskRow = await this.prisma.$queryRaw<Array<{ projectId: string | null; taskNo: string | null; opNo: string | null }>>`
        SELECT TOP 1 projectId, taskNo, opNo
        FROM ErpTSTask
        WHERE id = ${newPost.taskId}`;
      projectId = taskRow[0]?.projectId ?? null;
    }
    await this.activityLogger.log({
      action: ActivityAction.CREATED_CHATTER_POST,
      userId: authorId,
      taskId: newPost.taskId ?? null,
      details: {
        event: ActivityAction.CREATED_CHATTER_POST,
        messageKey: 'chatter_post_created',
        taskSnapshot: newPost.taskId ? { id: newPost.taskId } : undefined,
        projectSnapshot: projectId ? { id: projectId } : undefined,
        changes: {
          title: dto.title?.trim() || 'Chatter Post',
          postType: dto.postType ?? null,
        },
        context: {
          projectId,
          chatterPostId: newPost.id,
        },
      },
    });

    return { ...this.mapRow(newPost), comments: [] };
  }
}
