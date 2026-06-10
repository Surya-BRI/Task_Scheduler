import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateChatterCommentDto } from './dto/create-chatter-comment.dto';
import { CreateChatterPostDto } from './dto/create-chatter-post.dto';
import { ActivityAction } from '../activities/activity-events';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { TaskFilesService } from '../tasks/task-files.service';
import {
  MentionUserRef,
  parseMentionUserIdsFromMessage,
  resolveProjectNo,
  resolveTaskOpNo,
  uniqueUuids,
  weekRangeContaining,
} from './chatter-mentions.util';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';

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

export type ChatterMentionedUserDto = {
  id: string;
  fullName: string;
};

export type ChatterCommentDto = {
  id: string;
  postId: string | null;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
  mentionUserId: string | null;
  mentionedUsers: ChatterMentionedUserDto[];
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
  taskOpNo: string | null;
  projectId: string | null;
  projectNo: string | null;
  listingLabel: string | null;
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
  mentionedUsers: ChatterMentionedUserDto[];
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
export class ChatterPostsService implements OnModuleInit {
  private readonly logger = new Logger(ChatterPostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly taskFilesService: TaskFilesService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        IF COL_LENGTH('dbo.ErpTSChatterPost', 'projectId') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSChatterPost ADD projectId UNIQUEIDENTIFIER NULL;
        END
        IF COL_LENGTH('dbo.ErpTSChatterComment', 'mentionUserId') IS NULL
        BEGIN
          ALTER TABLE dbo.ErpTSChatterComment ADD mentionUserId UNIQUEIDENTIFIER NULL;
        END
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSChatterPostMention')
        BEGIN
          CREATE TABLE dbo.ErpTSChatterPostMention (
            id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
            postId UNIQUEIDENTIFIER NOT NULL,
            userId UNIQUEIDENTIFIER NOT NULL,
            createdAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_ErpTSChatterPostMention_post_user UNIQUE (postId, userId)
          );
          CREATE NONCLUSTERED INDEX IX_ErpTSChatterPostMention_userId ON dbo.ErpTSChatterPostMention (userId);
        END
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSChatterCommentMention')
        BEGIN
          CREATE TABLE dbo.ErpTSChatterCommentMention (
            id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
            commentId UNIQUEIDENTIFIER NOT NULL,
            userId UNIQUEIDENTIFIER NOT NULL,
            createdAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_ErpTSChatterCommentMention_comment_user UNIQUE (commentId, userId)
          );
          CREATE NONCLUSTERED INDEX IX_ErpTSChatterCommentMention_userId ON dbo.ErpTSChatterCommentMention (userId);
        END
      `);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not ensure chatter schema columns: ${detail}`);
    }
  }

  private sqlInUuidList(ids: string[]): string {
    const uuids = [...new Set(ids.map((id) => optionalUuid(id)).filter(Boolean) as string[])];
    return uuids.map((id) => sqlQuotedUuid(id)).join(', ');
  }

  private commentIdsMatch(a: string, b: string): boolean {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }

  private async loadMentionDirectory(): Promise<MentionUserRef[]> {
    const users = await this.usersService.findAll();
    return users.map((user) => ({ id: user.id, fullName: user.fullName }));
  }

  private async collectPostMentionUserIds(
    dto: CreateChatterPostDto,
    message: string,
  ): Promise<string[]> {
    const directory = await this.loadMentionDirectory();
    return uniqueUuids([
      dto.mentionUserId,
      ...(dto.mentionUserIds ?? []),
      ...parseMentionUserIdsFromMessage(message, directory),
    ]);
  }

  private async collectCommentMentionUserIds(
    dto: CreateChatterCommentDto,
    message: string,
  ): Promise<string[]> {
    const directory = await this.loadMentionDirectory();
    return uniqueUuids([
      dto.mentionUserId,
      ...(dto.mentionUserIds ?? []),
      ...parseMentionUserIdsFromMessage(message, directory),
    ]);
  }

  private async insertPostMentions(postId: string, userIds: string[]): Promise<void> {
    const ids = uniqueUuids(userIds);
    if (!ids.length) return;
    const postSql = sqlQuotedUuid(postId);
    for (const userId of ids) {
      await this.prisma.$executeRawUnsafe(`
        IF NOT EXISTS (
          SELECT 1 FROM ErpTSChatterPostMention
          WHERE postId = ${postSql} AND userId = ${sqlQuotedUuid(userId)}
        )
        INSERT INTO ErpTSChatterPostMention (postId, userId) VALUES (${postSql}, ${sqlQuotedUuid(userId)});
      `);
    }
  }

  private async insertCommentMentions(commentId: string, userIds: string[]): Promise<void> {
    const ids = uniqueUuids(userIds);
    if (!ids.length) return;
    const commentSql = sqlQuotedUuid(commentId);
    for (const userId of ids) {
      await this.prisma.$executeRawUnsafe(`
        IF NOT EXISTS (
          SELECT 1 FROM ErpTSChatterCommentMention
          WHERE commentId = ${commentSql} AND userId = ${sqlQuotedUuid(userId)}
        )
        INSERT INTO ErpTSChatterCommentMention (commentId, userId) VALUES (${commentSql}, ${sqlQuotedUuid(userId)});
      `);
    }
  }

  private async loadPostMentionsMap(
    postIds: string[],
  ): Promise<Map<string, ChatterMentionedUserDto[]>> {
    const inList = this.sqlInUuidList(postIds);
    const result = new Map<string, ChatterMentionedUserDto[]>();
    if (!inList) return result;

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ postId: string; userId: string; fullName: string }>
    >(`
      SELECT
        CONVERT(varchar(36), pm.postId) AS postId,
        CONVERT(varchar(36), pm.userId) AS userId,
        u.fullName
      FROM ErpTSChatterPostMention pm
      INNER JOIN ErpTSUser u ON u.id = pm.userId
      WHERE pm.postId IN (${inList})
      ORDER BY u.fullName ASC
    `);

    for (const row of rows) {
      const key = String(row.postId);
      const bucket = result.get(key) ?? [];
      bucket.push({ id: String(row.userId), fullName: String(row.fullName ?? '').trim() });
      result.set(key, bucket);
    }
    return result;
  }

  private async loadCommentMentionsMap(
    commentIds: string[],
  ): Promise<Map<string, ChatterMentionedUserDto[]>> {
    const inList = this.sqlInUuidList(commentIds);
    const result = new Map<string, ChatterMentionedUserDto[]>();
    if (!inList) return result;

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ commentId: string; userId: string; fullName: string }>
    >(`
      SELECT
        CONVERT(varchar(36), cm.commentId) AS commentId,
        CONVERT(varchar(36), cm.userId) AS userId,
        u.fullName
      FROM ErpTSChatterCommentMention cm
      INNER JOIN ErpTSUser u ON u.id = cm.userId
      WHERE cm.commentId IN (${inList})
      ORDER BY u.fullName ASC
    `);

    for (const row of rows) {
      const key = String(row.commentId);
      const bucket = result.get(key) ?? [];
      bucket.push({ id: String(row.userId), fullName: String(row.fullName ?? '').trim() });
      result.set(key, bucket);
    }
    return result;
  }

  private resolveListingLabel(
    taskId: string | null,
    taskOpNo: string | null,
    projectNo: string | null,
  ): string | null {
    if (taskId && taskOpNo) return taskOpNo;
    if (projectNo) return projectNo;
    if (taskOpNo) return taskOpNo;
    return null;
  }

  private async notifyMentionedUsers(params: {
    mentionedUserIds: string[];
    authorId: string;
    authorName: string;
    postId: string;
    listingLabel?: string | null;
    taskId?: string | null;
    projectId?: string | null;
  }): Promise<void> {
    const ref = params.listingLabel?.trim() || 'a discussion';
    const link = params.taskId
      ? `/tasks/${params.taskId}?tab=chatter`
      : params.projectId
        ? `/projects/${params.projectId}?tab=chatter`
        : '/chatter';

    for (const userId of uniqueUuids(params.mentionedUserIds)) {
      if (userId === params.authorId) continue;
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId,
            title: 'You were mentioned in Chatter',
            message: `${params.authorName} mentioned you in a post about ${ref}.`,
            linkUrl: link,
          },
        });
      } catch (err) {
        this.logger.warn(`Mention notification failed for ${userId}: ${err}`);
      }
    }
  }

  private async loadCommentById(commentId: string): Promise<ChatterCommentDto | null> {
    const id = optionalUuid(commentId);
    if (!id) return null;

    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
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
      WHERE c.id = ${sqlQuotedUuid(id)}
    `);

    const row = rows[0];
    return row ? this.mapCommentRow(row) : null;
  }

  async listMentionUsers() {
    const users = await this.usersService.findAll();
    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
    }));
  }

  private mapCommentRow(
    row: Record<string, unknown>,
    mentionedUsers: ChatterMentionedUserDto[] = [],
  ): ChatterCommentDto {
    const createdAt =
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as string | number | Date);
    const primaryMention = mentionedUsers[0]?.id ?? (row.mentionUserId != null ? String(row.mentionUserId) : null);
    return {
      id: String(row.id),
      postId: row.postId != null ? String(row.postId) : null,
      authorId: row.authorId != null ? String(row.authorId) : null,
      authorName: row.authorName != null ? String(row.authorName) : null,
      authorRole: row.authorRole != null ? String(row.authorRole) : null,
      mentionUserId: primaryMention,
      mentionedUsers,
      message: String(row.message ?? ''),
      createdAt: createdAt.toISOString(),
    };
  }

  private async findCommentsByPostIds(postIds: string[]): Promise<ChatterCommentDto[]> {
    const inList = this.sqlInUuidList(postIds);
    if (!inList) return [];

    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
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
      WHERE c.postId IN (${inList})
      ORDER BY c.createdAt DESC`);

    const commentDtos = rows.map((row) => this.mapCommentRow(row));
    const mentionMap = await this.loadCommentMentionsMap(commentDtos.map((c) => c.id));
    return commentDtos.map((comment) => {
      const extra = mentionMap.get(comment.id) ?? [];
      if (!extra.length) return comment;
      return {
        ...comment,
        mentionedUsers: extra,
        mentionUserId: extra[0]?.id ?? comment.mentionUserId,
      };
    });
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
    const isGenericTaskNo = !no || /^TSK(?:[\s-]|$)/i.test(no);
    const ref = op || (!isGenericTaskNo ? no : '') || no;
    if (t && ref) return `${t} (${ref})`;
    if (t) return t;
    if (ref) return ref;
    return null;
  }

  private resolveDisplayTitle(storedTitle: string | null | undefined, taskName: string | null): string {
    const title = (storedTitle ?? '').trim();
    if (title && title.toLowerCase() !== 'chatter post') return title;
    if (taskName?.trim()) return taskName.trim();
    return title || 'Chatter Post';
  }

  private async loadProjectMeta(
    projectId: string,
  ): Promise<{ projectName: string | null; projectNo: string | null }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, projectNo: true },
    });
    return {
      projectName: project?.name?.trim() || null,
      projectNo: resolveProjectNo(project?.projectNo),
    };
  }

  private async loadTaskMeta(taskId: string): Promise<{
    taskName: string | null;
    taskOpNo: string | null;
    projectName: string | null;
    projectNo: string | null;
    projectId: string | null;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        title: string | null;
        taskNo: string | null;
        opNo: string | null;
        projectName: string | null;
        projectNo: string | null;
        projectId: string | null;
      }>
    >`
      SELECT TOP 1
        t.title,
        t.taskNo,
        t.opNo,
        pr.name AS projectName,
        pr.projectNo AS projectNo,
        t.projectId
      FROM ErpTSTask t
      LEFT JOIN ErpTSProject pr ON pr.id = t.projectId
      WHERE t.id = ${taskId}`;
    const row = rows[0];
    if (!row) {
      return { taskName: null, taskOpNo: null, projectName: null, projectNo: null, projectId: null };
    }
    const taskOpNo = resolveTaskOpNo(row.opNo, row.taskNo);
    return {
      taskName: taskOpNo,
      projectName: row.projectName?.trim() || null,
      projectId: row.projectId != null ? String(row.projectId) : null,
      taskOpNo,
      projectNo: resolveProjectNo(row.projectNo),
    };
  }

  private postSelectColumns(alias = 'p'): string {
    return `
      ${alias}.id, ${alias}.taskId, ${alias}.authorId,
      u.fullName AS authorName, r.name AS authorRole,
      mu.fullName AS mentionUserName,
      COALESCE(pr.name, prDirect.name) AS projectName,
      COALESCE(pr.projectNo, prDirect.projectNo) AS projectNo,
      CONVERT(varchar(36), COALESCE(t.projectId, ${alias}.projectId)) AS projectId,
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
      LEFT JOIN ErpTSProject prDirect ON prDirect.id = ${alias}.projectId
      LEFT JOIN ErpTSUser assignee ON assignee.id = t.assigneeId
    `;
  }

  private async enrichPosts(posts: ChatterPostDto[]): Promise<ChatterPostDto[]> {
    const postIds = posts.map((p) => p.id);
    const [comments, attachmentsMap, linksMap, mentionMap] = await Promise.all([
      this.findCommentsByPostIds(postIds),
      this.findAttachmentsByPostIds(postIds),
      this.findLinksByPostIds(postIds),
      this.loadPostMentionsMap(postIds),
    ]);
    const withComments = this.attachComments(posts, comments);
    return withComments.map((post) => {
      const mentionedUsers = mentionMap.get(post.id) ?? post.mentionedUsers ?? [];
      const primaryMention = mentionedUsers[0]?.fullName ?? post.mentionUserName;
      return {
        ...post,
        mentionedUsers,
        mentionUserId: mentionedUsers[0]?.id ?? post.mentionUserId,
        mentionUserName: primaryMention ?? post.mentionUserName,
        attachments: attachmentsMap.get(post.id) ?? [],
        linkAttachments: linksMap.get(post.id) ?? [],
      };
    });
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

    const taskOpNo = resolveTaskOpNo(
      row.taskOpNo != null ? String(row.taskOpNo) : null,
      row.taskNo != null ? String(row.taskNo) : null,
    );
    const projectNo = resolveProjectNo(row.projectNo != null ? String(row.projectNo) : null);
    const taskId = row.taskId != null ? String(row.taskId) : null;
    const listingLabel = this.resolveListingLabel(taskId, taskOpNo, projectNo);
    const displayTitle = listingLabel ?? this.resolveDisplayTitle(row.title, taskOpNo);

    return {
      id: String(row.id),
      taskId,
      taskName: taskOpNo,
      taskOpNo,
      projectId: row.projectId != null ? String(row.projectId) : null,
      projectNo,
      listingLabel,
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
      mentionedUsers: [],
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
    weekStartFilter?: string,
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
      const projectSql = sqlQuotedUuid(projectId);
      whereParts.push(`(
        t.projectId = ${projectSql}
        OR p.projectId = ${projectSql}
      )`);
    }
    if (mentionUserId) {
      const mentionSql = sqlQuotedUuid(mentionUserId);
      whereParts.push(`(
        p.mentionUserId = ${mentionSql}
        OR EXISTS (
          SELECT 1 FROM ErpTSChatterPostMention pm
          WHERE pm.postId = p.id AND pm.userId = ${mentionSql}
        )
        OR EXISTS (
          SELECT 1 FROM ErpTSChatterComment cm
          WHERE cm.postId = p.id AND cm.mentionUserId = ${mentionSql}
        )
        OR EXISTS (
          SELECT 1 FROM ErpTSChatterComment cm
          INNER JOIN ErpTSChatterCommentMention cmm ON cmm.commentId = cm.id
          WHERE cm.postId = p.id AND cmm.userId = ${mentionSql}
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
    if (weekStartFilter?.trim()) {
      const range = weekRangeContaining(weekStartFilter.trim());
      if (range) {
        const startSql = `'${range.start.toISOString().replace(/'/g, "''")}'`;
        const endSql = `'${range.end.toISOString().replace(/'/g, "''")}'`;
        whereParts.push(`p.createdAt >= ${startSql} AND p.createdAt <= ${endSql}`);
      }
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

    const mentionUserIds = await this.collectCommentMentionUserIds(dto, dto.message);
    const mentionUserId = mentionUserIds[0] ?? optionalUuid(dto.mentionUserId);
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

    if (mentionUserIds.length > 0) {
      await this.insertCommentMentions(newCommentId, mentionUserIds);
    }

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { fullName: true },
    });
    const postMeta = await this.loadPostById(normalizedPostId);

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

    this.dashboardRealtime?.notifyOverviewRefresh('chatter_post_created');

    if (mentionUserIds.length > 0) {
      await this.notifyMentionedUsers({
        mentionedUserIds: mentionUserIds,
        authorId,
        authorName: author?.fullName?.trim() || 'Someone',
        postId: normalizedPostId,
        listingLabel: postMeta?.listingLabel,
        taskId: postMeta?.taskId,
        projectId: postMeta?.projectId,
      });
    }

    const loaded = await this.loadCommentById(newCommentId);
    if (loaded) return loaded;

    const comments = await this.findCommentsByPostIds([normalizedPostId]);
    const saved = comments.find((c) => this.commentIdsMatch(c.id, newCommentId));
    if (saved) return saved;

    this.logger.error(
      `Comment ${newCommentId} inserted for post ${normalizedPostId} but reload returned ${comments.length} row(s)`,
    );
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
    const dtoProjectId = optionalUuid(dto.projectId);

    let taskMeta: {
      taskName: string | null;
      taskOpNo: string | null;
      projectName: string | null;
      projectNo: string | null;
      projectId: string | null;
    } = {
      taskName: null,
      taskOpNo: null,
      projectName: null,
      projectNo: null,
      projectId: null,
    };
    let projectMeta: { projectName: string | null; projectNo: string | null } = {
      projectName: null,
      projectNo: null,
    };
    if (taskId) {
      taskMeta = await this.loadTaskMeta(taskId);
    } else if (dtoProjectId) {
      projectMeta = await this.loadProjectMeta(dtoProjectId);
      taskMeta.projectId = dtoProjectId;
      taskMeta.projectName = projectMeta.projectName;
      taskMeta.projectNo = projectMeta.projectNo;
    }
    const listingLabel = this.resolveListingLabel(
      taskId,
      taskMeta.taskOpNo,
      taskMeta.projectNo ?? projectMeta.projectNo,
    );
    const resolvedTitle = listingLabel ?? this.resolveDisplayTitle(dto.title, taskMeta.taskOpNo);
    const mentionUserIds = await this.collectPostMentionUserIds(dto, dto.message);
    const primaryMentionUserId = mentionUserIds[0] ?? optionalUuid(dto.mentionUserId);
    const resolvedProjectId = taskMeta.projectId ?? dtoProjectId;

    let newPost: any;
    try {
      newPost = await this.prisma.chatterPost.create({
        data: {
          title: resolvedTitle,
          message: dto.message,
          postType: dto.postType || null,
          priority: dto.priority?.trim() ? dto.priority.trim() : null,
          visibility: dto.visibility || null,
          taskId: taskId || null,
          projectId: resolvedProjectId,
          authorId: authorId,
          mentionUserId: primaryMentionUserId,
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

    if (mentionUserIds.length > 0) {
      await this.insertPostMentions(newPost.id, mentionUserIds);
    }

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { fullName: true },
    });

    const [attachmentsMap, linksMap] = await Promise.all([
      this.findAttachmentsByPostIds([newPost.id]),
      this.findLinksByPostIds([newPost.id]),
    ]);
    const attachmentDtos = attachmentsMap.get(newPost.id) ?? [];
    const linkDtos = linksMap.get(newPost.id) ?? [];

    const projectId = resolvedProjectId;
    const projectName = taskMeta.projectName ?? projectMeta.projectName;

    if (mentionUserIds.length > 0) {
      await this.notifyMentionedUsers({
        mentionedUserIds: mentionUserIds,
        authorId,
        authorName: author?.fullName?.trim() || 'Someone',
        postId: newPost.id,
        listingLabel,
        taskId: newPost.taskId,
        projectId,
      });
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

    this.dashboardRealtime?.notifyOverviewRefresh('chatter_post_created');

    const loaded = await this.loadPostById(newPost.id);
    if (loaded) return loaded;

    return {
      ...this.mapRow(newPost),
      taskName: taskMeta.taskOpNo,
      taskOpNo: taskMeta.taskOpNo,
      projectNo: taskMeta.projectNo ?? projectMeta.projectNo,
      listingLabel,
      projectId,
      mentionUserName: null,
      projectName,
      comments: [],
      attachments: attachmentDtos,
      linkAttachments: linkDtos,
    };
  }
}
