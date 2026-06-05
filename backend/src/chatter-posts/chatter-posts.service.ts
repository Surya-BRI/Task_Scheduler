import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateChatterCommentDto } from './dto/create-chatter-comment.dto';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';
import { ActivityAction } from '../activities/activity-events';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { TaskFilesService } from '../tasks/task-files.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function sqlQuotedUuid(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export type ChatterAttachmentDto = {
  id: string;
  fileName: string;
  filePath: string;
  fileUrl?: string | null;
  mimeType: string | null;
  sizeBytes: number;
  url: string;
};

export type ChatterCommentDto = {
  id: string;
  postId: string | null;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
  mentionUserId: string | null;
  message: string;
  createdAt: string;
};

export type ChatterLinkAttachmentDto = {
  id: string;
  url: string;
  displayName: string | null;
  platform: string | null;
};

export type ChatterPostDto = {
  id: string;
  taskId: string | null;
  taskName: string | null;
  projectId: string | null;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
  mentionUserName: string | null;
  projectName: string | null;
  assigneeName: string | null;
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
  attachments: ChatterAttachmentDto[];
  linkAttachments: ChatterLinkAttachmentDto[];
};

@Injectable()
export class ChatterPostsService {
  private readonly logger = new Logger(ChatterPostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly taskFilesService: TaskFilesService,
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
      mentionUserId: row.mentionUserId != null ? String(row.mentionUserId) : null,
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
        c.mentionUserId,
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

  /** Fetch attachments from ErpTSChatterPostAttachment for a set of post IDs and generate signed URLs */
  private async findAttachmentsByPostIds(postIds: string[]): Promise<Map<string, ChatterAttachmentDto[]>> {
    const ids = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
    const result = new Map<string, ChatterAttachmentDto[]>();
    if (ids.length === 0) return result;

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        a.id,
        a.chatterPostId,
        a.fileName,
        a.filePath,
        a.fileUrl,
        a.mimeType,
        a.sizeBytes
      FROM ErpTSChatterPostAttachment a
      WHERE a.chatterPostId IN (${Prisma.join(ids)})
      ORDER BY a.createdAt ASC`;

    // Generate signed URLs for each attachment
    for (const row of rows) {
      const postId = String(row.chatterPostId);
      const filePath = String(row.filePath ?? '');
      const fileUrl = row.fileUrl != null ? String(row.fileUrl) : null;

      let url = '';
      if (filePath) {
        try {
          url = await this.taskFilesService.createSignedReadUrl(filePath);
        } catch (err) {
          this.logger.warn(`Failed to generate signed URL for attachment ${row.id}: ${err}`);
          url = '';
        }
      }

      const dto: ChatterAttachmentDto = {
        id: String(row.id),
        fileName: String(row.fileName ?? ''),
        filePath,
        fileUrl,
        mimeType: row.mimeType != null ? String(row.mimeType) : null,
        sizeBytes: Number(row.sizeBytes ?? 0),
        url: url || fileUrl || '', // Prefer signed URL for secure retrieval, fallback to stored S3 URL
      };

      const bucket = result.get(postId) ?? [];
      bucket.push(dto);
      result.set(postId, bucket);
    }

    return result;
  }

  private async findLinksByPostIds(postIds: string[]): Promise<Map<string, ChatterLinkAttachmentDto[]>> {
    const ids = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
    const result = new Map<string, ChatterLinkAttachmentDto[]>();
    if (ids.length === 0) return result;

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        l.id,
        l.chatterPostId,
        l.url,
        l.displayName,
        l.platform
      FROM ErpTSLinkAttachment l
      WHERE l.chatterPostId IN (${Prisma.join(ids)})
      ORDER BY l.createdAt ASC`;

    for (const row of rows) {
      const postId = String(row.chatterPostId);
      const dto: ChatterLinkAttachmentDto = {
        id: String(row.id),
        url: String(row.url ?? ''),
        displayName: row.displayName != null ? String(row.displayName) : null,
        platform: row.platform != null ? String(row.platform) : null,
      };
      const bucket = result.get(postId) ?? [];
      bucket.push(dto);
      result.set(postId, bucket);
    }

    return result;
  }

  private parseLinkAttachmentsJson(raw?: string | null): Array<{ url: string; displayName?: string; platform?: string }> {
    if (!raw?.trim()) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const links: Array<{ url: string; displayName?: string; platform?: string }> = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const url = String((item as { url?: string }).url ?? '').trim();
        if (!url || !/^https?:\/\//i.test(url)) continue;
        links.push({
          url,
          displayName: (item as { displayName?: string; name?: string }).displayName
            ?? (item as { name?: string }).name,
          platform: (item as { platform?: string; platformLabel?: string }).platform
            ?? (item as { platformLabel?: string }).platformLabel,
        });
      }
      return links;
    } catch (err) {
      this.logger.warn(`Invalid linkAttachmentsJson: ${err}`);
      return [];
    }
  }

  private formatTaskDisplayName(
    title?: string | null,
    taskNo?: string | null,
    opNo?: string | null,
  ): string | null {
    const t = title?.trim() ?? '';
    const no = taskNo?.trim() ?? '';
    const op = opNo?.trim() ?? '';
    if (t && no) return `${t} (${no})`;
    if (t) return t;
    if (no) return no;
    if (op) return op;
    return null;
  }

  private resolveDisplayTitle(storedTitle: string | null | undefined, taskName: string | null): string {
    const title = (storedTitle ?? '').trim();
    if (title && title.toLowerCase() !== 'chatter post') return title;
    if (taskName?.trim()) return taskName.trim();
    return title || 'Chatter Post';
  }

  private async loadTaskMeta(taskId: string): Promise<{
    taskName: string | null;
    projectName: string | null;
    projectId: string | null;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ title: string | null; taskNo: string | null; opNo: string | null; projectName: string | null; projectId: string | null }>
    >`
      SELECT TOP 1
        t.title,
        t.taskNo,
        t.opNo,
        pr.name AS projectName,
        t.projectId
      FROM ErpTSTask t
      LEFT JOIN ErpTSProject pr ON pr.id = t.projectId
      WHERE t.id = ${taskId}`;
    const row = rows[0];
    if (!row) return { taskName: null, projectName: null, projectId: null };
    return {
      taskName: this.formatTaskDisplayName(row.title, row.taskNo, row.opNo),
      projectName: row.projectName?.trim() || null,
      projectId: row.projectId != null ? String(row.projectId) : null,
    };
  }

  private postSelectColumns(alias = 'p'): string {
    return `
      ${alias}.id, ${alias}.taskId, ${alias}.authorId,
      u.fullName AS authorName, r.name AS authorRole,
      mu.fullName AS mentionUserName, pr.name AS projectName,
      CONVERT(varchar(36), t.projectId) AS projectId,
      t.title AS taskTitle, t.taskNo AS taskNo, t.opNo AS taskOpNo,
      assignee.fullName AS assigneeName,
      ${alias}.title, ${alias}.message, ${alias}.postType, ${alias}.mentionUserId, ${alias}.priority,
      ${alias}.seenByCount, ${alias}.attachmentCount, ${alias}.isPinned, ${alias}.editedAt, ${alias}.visibility,
      ${alias}.createdAt, ${alias}.updatedAt
    `;
  }

  private postJoinSql(alias = 'p'): string {
    return `
      FROM ErpTSChatterPost ${alias}
      LEFT JOIN ErpTSUser u ON u.id = ${alias}.authorId
      LEFT JOIN ErpTSRole r ON r.id = u.roleId
      LEFT JOIN ErpTSUser mu ON mu.id = ${alias}.mentionUserId
      LEFT JOIN ErpTSTask t ON t.id = ${alias}.taskId
      LEFT JOIN ErpTSProject pr ON pr.id = t.projectId
      LEFT JOIN ErpTSUser assignee ON assignee.id = t.assigneeId
    `;
  }

  private async enrichPosts(posts: ChatterPostDto[]): Promise<ChatterPostDto[]> {
    const postIds = posts.map((p) => p.id);
    const [comments, attachmentsMap, linksMap] = await Promise.all([
      this.findCommentsByPostIds(postIds),
      this.findAttachmentsByPostIds(postIds),
      this.findLinksByPostIds(postIds),
    ]);
    const withComments = this.attachComments(posts, comments);
    return withComments.map((post) => ({
      ...post,
      attachments: attachmentsMap.get(post.id) ?? [],
      linkAttachments: linksMap.get(post.id) ?? [],
    }));
  }

  private mapRow(row: any): Omit<ChatterPostDto, 'comments' | 'attachments' | 'linkAttachments'> {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
    const editedAtRaw = row.editedAt;
    const editedAt =
      editedAtRaw instanceof Date
        ? editedAtRaw.toISOString()
        : editedAtRaw
          ? new Date(editedAtRaw).toISOString()
          : null;

    const taskName = this.formatTaskDisplayName(row.taskTitle, row.taskNo, row.taskOpNo);
    const displayTitle = this.resolveDisplayTitle(row.title, taskName);

    return {
      id: String(row.id),
      taskId: row.taskId != null ? String(row.taskId) : null,
      taskName,
      projectId: row.projectId != null ? String(row.projectId) : null,
      authorId: row.authorId != null ? String(row.authorId) : null,
      authorName: row.authorName != null ? String(row.authorName) : null,
      authorRole: row.authorRole != null ? String(row.authorRole) : null,
      mentionUserName: row.mentionUserName != null ? String(row.mentionUserName) : null,
      projectName: row.projectName != null ? String(row.projectName) : null,
      assigneeName: row.assigneeName != null ? String(row.assigneeName) : null,
      title: displayTitle,
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
    mentionUserIdFilter?: string,
    commentedByUserIdFilter?: string,
    postTypeFilter?: string,
  ): Promise<ChatterPostDto[]> {
    const limit = Math.min(1000, Math.max(1, Number.parseInt(limitParam ?? '500', 10) || 500));
    const taskId = optionalUuid(taskIdFilter);
    const projectId = optionalUuid(projectIdFilter);
    const mentionUserId = optionalUuid(mentionUserIdFilter);
    const commentedByUserId = optionalUuid(commentedByUserIdFilter);
    const postType = postTypeFilter?.trim() || null;

    const whereParts: string[] = [];
    if (taskId) {
      whereParts.push(`p.taskId = ${sqlQuotedUuid(taskId)}`);
    } else if (projectId) {
      whereParts.push(`t.projectId = ${sqlQuotedUuid(projectId)}`);
      whereParts.push('p.taskId IS NOT NULL');
    }
    if (mentionUserId) {
      const mentionSql = sqlQuotedUuid(mentionUserId);
      whereParts.push(`(
        p.mentionUserId = ${mentionSql}
        OR EXISTS (
          SELECT 1 FROM ErpTSChatterComment cm
          WHERE cm.postId = p.id AND cm.mentionUserId = ${mentionSql}
        )
      )`);
    }
    if (commentedByUserId) {
      whereParts.push(`EXISTS (
        SELECT 1 FROM ErpTSChatterComment cm
        WHERE cm.postId = p.id AND cm.authorId = ${sqlQuotedUuid(commentedByUserId)}
      )`);
    }
    if (postType) {
      whereParts.push(`p.postType = N'${postType.replace(/'/g, "''")}'`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT TOP (${limit})
        ${this.postSelectColumns('p')}
      ${this.postJoinSql('p')}
      ${whereSql}
      ORDER BY p.updatedAt DESC, p.createdAt DESC
    `);

    const posts = rows.map((r) => ({
      ...this.mapRow(r),
      comments: [] as ChatterCommentDto[],
      attachments: [] as ChatterAttachmentDto[],
      linkAttachments: [] as ChatterLinkAttachmentDto[],
    }));

    return this.enrichPosts(posts);
  }

  async loadPostById(postId: string): Promise<ChatterPostDto | null> {
    const id = optionalUuid(postId);
    if (!id) return null;
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT TOP (1)
        ${this.postSelectColumns('p')}
      ${this.postJoinSql('p')}
      WHERE p.id = ${sqlQuotedUuid(id)}
    `);
    const row = rows[0];
    if (!row) return null;
    const posts = await this.enrichPosts([
      {
        ...this.mapRow(row),
        comments: [],
        attachments: [],
        linkAttachments: [],
      },
    ]);
    return posts[0] ?? null;
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

    const mentionUserId = optionalUuid(dto.mentionUserId);
    const messageSql = `N'${dto.message.trim().replace(/'/g, "''")}'`;
    const mentionSql = mentionUserId ? sqlQuotedUuid(mentionUserId) : 'NULL';

    const idRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(`
      DECLARE @ids TABLE (cid uniqueidentifier);
      INSERT INTO ErpTSChatterComment (postId, authorId, mentionUserId, message, createdAt)
      OUTPUT INSERTED.id INTO @ids(cid)
      VALUES (
        ${sqlQuotedUuid(normalizedPostId)},
        ${sqlQuotedUuid(authorId)},
        ${mentionSql},
        ${messageSql},
        SYSUTCDATETIME()
      );
      SELECT CONVERT(varchar(36), cid) AS id FROM @ids;
    `);
    const newCommentId = idRows[0]?.id;
    if (!newCommentId) {
      throw new BadRequestException('Failed to create chatter comment');
    }

    await this.prisma.$executeRawUnsafe(`
      UPDATE ErpTSChatterPost
      SET updatedAt = SYSUTCDATETIME()
      WHERE id = ${sqlQuotedUuid(normalizedPostId)}
    `);

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

    const comments = await this.findCommentsByPostIds([normalizedPostId]);
    const saved = comments.find((c) => c.id === String(newCommentId));
    if (saved) return saved;

    throw new BadRequestException('Comment created but could not be loaded');
  }

  async create(dto: CreateChatterPostDto, authorId: string, files?: Express.Multer.File[]): Promise<ChatterPostDto> {
    // Upload files to S3 first
    const uploadResults: Array<{ key: string; fileName: string; mimeType: string; size: number; url: string }> = [];

    const incomingFileCount = files?.length ?? 0;
    if (incomingFileCount > 0) {
      this.logger.log(`Upload started: ${incomingFileCount} file(s) for chatter post`);
      for (const file of files!) {
        if (!file?.buffer) {
          this.logger.error(`File "${file?.originalname ?? 'unknown'}" missing buffer after multipart parse`);
          throw new BadRequestException(
            `File "${file?.originalname ?? 'upload'}" was not received correctly. Please retry.`,
          );
        }

        try {
          const result = await this.taskFilesService.uploadTaskFile(file, authorId);
          uploadResults.push(result);
          this.logger.log(
            `Upload completed: "${file.originalname}" -> ${result.key} (${result.size} bytes)`,
          );
        } catch (err) {
          this.logger.error(`Failed to upload file "${file.originalname}" to S3: ${err}`);
          if (err instanceof BadRequestException) {
            throw err; // Re-throw validation errors (size, type)
          }
          throw new InternalServerErrorException(
            `Failed to upload file "${file.originalname}" to S3`,
          );
        }
      }

      if (uploadResults.length === 0) {
        throw new BadRequestException(
          'No files were uploaded. Check file type (images, PDF, Office docs) and size (max 20MB).',
        );
      }
    }

    const linkPayload = this.parseLinkAttachmentsJson(dto.linkAttachmentsJson);
    const totalAttachments = uploadResults.length + linkPayload.length;

    const taskId = optionalUuid(dto.taskId);
    let taskMeta: { taskName: string | null; projectName: string | null; projectId: string | null } = {
      taskName: null,
      projectName: null,
      projectId: null,
    };
    if (taskId) {
      taskMeta = await this.loadTaskMeta(taskId);
    }
    const resolvedTitle = this.resolveDisplayTitle(dto.title, taskMeta.taskName);

    let newPost: any;
    try {
      newPost = await this.prisma.chatterPost.create({
        data: {
          title: resolvedTitle,
          message: dto.message,
          postType: dto.postType || null,
          priority: dto.priority || null,
          visibility: dto.visibility || null,
          taskId: taskId || null,
          authorId: authorId,
          mentionUserId: optionalUuid(dto.mentionUserId),
          attachmentCount: totalAttachments > 0 ? totalAttachments : undefined,
          attachments: uploadResults.length > 0 ? {
            create: uploadResults.map((r) => ({
              fileName: r.fileName,
              filePath: r.key,
              fileUrl: r.url,
              mimeType: r.mimeType,
              sizeBytes: BigInt(r.size),
            }))
          } : undefined,
          links: linkPayload.length > 0 ? {
            create: linkPayload.map((link) => ({
              id: randomUUID(),
              url: link.url,
              displayName: link.displayName?.trim() || link.url,
              platform: link.platform?.trim() || null,
            })),
          } : undefined,
        },
        include: {
          _count: {
            select: { attachments: true, links: true },
          },
        },
      });
      this.logger.log(
        `DB save completed: post ${newPost.id} (${uploadResults.length} file(s), ${linkPayload.length} link(s))`,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to save chatter post to database: ${detail}`, err instanceof Error ? err.stack : undefined);
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(
        `Failed to save chatter post${detail ? `: ${detail}` : ''}`,
      );
    }

    const [attachmentsMap, linksMap, mentionRow] = await Promise.all([
      this.findAttachmentsByPostIds([newPost.id]),
      this.findLinksByPostIds([newPost.id]),
      dto.mentionUserId
        ? this.prisma.user.findUnique({
            where: { id: optionalUuid(dto.mentionUserId) ?? undefined },
            select: { fullName: true },
          })
        : Promise.resolve(null),
    ]);
    const attachmentDtos = attachmentsMap.get(newPost.id) ?? [];
    const linkDtos = linksMap.get(newPost.id) ?? [];

    const projectId = taskMeta.projectId;
    const projectName = taskMeta.projectName;
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
          title: resolvedTitle,
          postType: dto.postType ?? null,
          filesUploaded: uploadResults.length,
        },
        context: {
          projectId,
          chatterPostId: newPost.id,
        },
      },
    });

    const loaded = await this.loadPostById(newPost.id);
    if (loaded) return loaded;

    return {
      ...this.mapRow(newPost),
      taskName: taskMeta.taskName,
      projectId,
      mentionUserName: mentionRow?.fullName ?? null,
      projectName,
      comments: [],
      attachments: attachmentDtos,
      linkAttachments: linkDtos,
    };
  }
}
