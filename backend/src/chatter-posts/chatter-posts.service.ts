import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
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
import { UpdateChatterCommentDto, UpdateChatterPostDto } from './dto/update-chatter-post.dto';
import { ActivityAction } from '../activities/activity-events';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { TaskFilesService } from '../tasks/task-files.service';
import {
  MentionUserRef,
  isDesignerDepartmentMentionable,
  messageSnippet,
  mergeCollectedMentionUserIds,
  parseMentionUserIdsFromMessage,
  resolveProjectNo,
  resolveTaskOpNo,
  uniqueUuids,
  weekRangeContaining,
} from './chatter-mentions.util';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import { UserRole } from '../common/constants/roles.enum';
import { buildWhere, filterValidUuids, optionalUuid } from '../common/utils/sql-param.util';
import { isSameUserId, normalizeUserId } from '../common/utils/user-id.util';

function optionalPaginationCursor(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
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

export type ChatterSeenByUserDto = ChatterMentionedUserDto;

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
  seenByUsers?: ChatterSeenByUserDto[];
  likeCount?: number;
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
  private mentionDirectoryCache: { data: MentionUserRef[]; expiresAt: number } | null = null;
  private readonly MENTION_CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly taskFilesService: TaskFilesService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // security-sql:allow-static-ddl
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
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSChatterPostLike')
        BEGIN
          CREATE TABLE dbo.ErpTSChatterPostLike (
            id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
            postId UNIQUEIDENTIFIER NOT NULL,
            userId UNIQUEIDENTIFIER NOT NULL,
            createdAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_ErpTSChatterPostLike_post_user UNIQUE (postId, userId)
          );
        END
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ErpTSChatterPostSeen')
        BEGIN
          CREATE TABLE dbo.ErpTSChatterPostSeen (
            id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
            postId UNIQUEIDENTIFIER NOT NULL,
            userId UNIQUEIDENTIFIER NOT NULL,
            seenAt DATETIME NOT NULL DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_ErpTSChatterPostSeen_post_user UNIQUE (postId, userId)
          );
          CREATE NONCLUSTERED INDEX IX_ErpTSChatterPostSeen_userId ON dbo.ErpTSChatterPostSeen (userId);
          CREATE NONCLUSTERED INDEX IX_ErpTSChatterPostSeen_postId ON dbo.ErpTSChatterPostSeen (postId);
        END
      `);
      // security-sql:allow-static-ddl
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO ErpTSChatterPostMention (postId, userId)
        SELECT p.id, p.mentionUserId
        FROM ErpTSChatterPost p
        WHERE p.mentionUserId IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ErpTSChatterPostMention pm
            WHERE pm.postId = p.id AND pm.userId = p.mentionUserId
          );
        INSERT INTO ErpTSChatterCommentMention (commentId, userId)
        SELECT c.id, c.mentionUserId
        FROM ErpTSChatterComment c
        WHERE c.mentionUserId IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ErpTSChatterCommentMention cm
            WHERE cm.commentId = c.id AND cm.userId = c.mentionUserId
          );
      `);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not ensure chatter schema columns: ${detail}`);
    }
  }

  private filterValidUuidList(ids: string[]): string[] {
    return filterValidUuids(ids);
  }

  private commentIdsMatch(a: string, b: string): boolean {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }

  /** Stable lowercase UUID key for maps keyed by post/comment ids. */
  private entityIdKey(value?: string | null): string | null {
    return normalizeUserId(value);
  }

  private async loadChatterParticipantUserIds(
    taskId?: string | null,
    projectId?: string | null,
  ): Promise<string[]> {
    const resolvedTaskId = optionalUuid(taskId);
    const resolvedProjectId = optionalUuid(projectId);
    if (!resolvedTaskId && !resolvedProjectId) return [];

    const rows = resolvedTaskId
      ? await this.prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
          SELECT DISTINCT CONVERT(varchar(36), u.id) AS userId
          FROM ErpTSChatterPost p
          LEFT JOIN ErpTSTask t ON t.id = p.taskId
          LEFT JOIN ErpTSChatterComment c ON c.postId = p.id
          INNER JOIN ErpTSUser u ON u.id = p.authorId OR u.id = c.authorId
          WHERE p.taskId = ${resolvedTaskId}
        `)
      : await this.prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
          SELECT DISTINCT CONVERT(varchar(36), u.id) AS userId
          FROM ErpTSChatterPost p
          LEFT JOIN ErpTSTask t ON t.id = p.taskId
          LEFT JOIN ErpTSChatterComment c ON c.postId = p.id
          INNER JOIN ErpTSUser u ON u.id = p.authorId OR u.id = c.authorId
          WHERE (p.projectId = ${resolvedProjectId} OR t.projectId = ${resolvedProjectId})
        `);
    return rows.map((row) => String(row.userId)).filter(Boolean);
  }

  async resolveEligibleMentionUsers(
    viewerId: string,
    role: UserRole | string,
    taskId?: string | null,
    projectId?: string | null,
  ): Promise<MentionUserRef[]> {
    const allUsers = await this.usersService.findAll();
    const byId = new Map(
      allUsers.map((user) => {
        const key = normalizeUserId(user.id) ?? user.id;
        return [key, user];
      }),
    );
    const eligibleIds = new Set<string>();
    const addEligibleId = (id?: string | null) => {
      const key = normalizeUserId(id);
      if (key) eligibleIds.add(key);
    };
    const resolveUserDepartmentId = (user: (typeof allUsers)[number]) =>
      user.department?.id ?? null;

    if (role === UserRole.HOD) {
      const hod = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { departmentId: true },
      });
      for (const user of allUsers) {
        if (isSameUserId(user.id, viewerId)) {
          addEligibleId(user.id);
          continue;
        }
        const userRole = user.role?.name;
        if (userRole === UserRole.HOD) {
          addEligibleId(user.id);
          continue;
        }
        if (userRole === UserRole.DESIGNER) {
          if (isDesignerDepartmentMentionable(hod?.departmentId, resolveUserDepartmentId(user))) {
            addEligibleId(user.id);
          }
        }
      }
    } else {
      addEligibleId(viewerId);
      const viewer = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { departmentId: true },
      });
      for (const user of allUsers) {
        if (user.role?.name === UserRole.HOD) {
          addEligibleId(user.id);
          continue;
        }
        if (user.role?.name === UserRole.DESIGNER) {
          if (isDesignerDepartmentMentionable(viewer?.departmentId, resolveUserDepartmentId(user))) {
            addEligibleId(user.id);
          }
        }
      }

      const resolvedTaskId = optionalUuid(taskId);
      let resolvedProjectId = optionalUuid(projectId);
      if (resolvedTaskId) {
        const task = await this.prisma.task.findUnique({
          where: { id: resolvedTaskId },
          select: { assigneeId: true, projectId: true, taskDesigners: { select: { designerId: true } } },
        });
        addEligibleId(task?.assigneeId);
        task?.taskDesigners?.forEach((td) => addEligibleId(td.designerId));
        if (task?.projectId) resolvedProjectId = task.projectId;
      }
      if (resolvedProjectId) {
        const projectTasks = await this.prisma.task.findMany({
          where: { projectId: resolvedProjectId },
          select: { assigneeId: true, taskDesigners: { select: { designerId: true } } },
        });
        for (const row of projectTasks) {
          addEligibleId(row.assigneeId);
          row.taskDesigners?.forEach((td) => addEligibleId(td.designerId));
        }
      }

      const participants = await this.loadChatterParticipantUserIds(resolvedTaskId, resolvedProjectId);
      for (const id of participants) addEligibleId(id);
    }

    return [...eligibleIds]
      .map((id) => byId.get(id))
      .filter((user): user is NonNullable<typeof user> => Boolean(user))
      .map((user) => ({ id: user.id, fullName: user.fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  private async resolveExistingUserIds(ids: string[]): Promise<string[]> {
    const valid = uniqueUuids(ids);
    if (!valid.length) return [];
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT CONVERT(varchar(36), id) AS id FROM ErpTSUser WHERE id IN (${Prisma.join(valid)})
    `);
    const existing = new Set(
      rows.map((row) => normalizeUserId(String(row.id))).filter(Boolean) as string[],
    );
    return valid.filter((id) => existing.has(normalizeUserId(id) as string));
  }

  private async collectPostMentionUserIds(
    dto: CreateChatterPostDto,
    message: string,
    authorId: string,
    role: UserRole | string,
    taskId?: string | null,
    projectId?: string | null,
  ): Promise<string[]> {
    const directory = await this.resolveEligibleMentionUsers(authorId, role, taskId, projectId);
    const eligible = new Set(directory.map((user) => user.id));
    const explicitIds = uniqueUuids([dto.mentionUserId, ...(dto.mentionUserIds ?? [])]);
    const validatedExplicit = await this.resolveExistingUserIds(explicitIds);
    const parsed = parseMentionUserIdsFromMessage(message, directory);
    return mergeCollectedMentionUserIds({
      explicitIds: validatedExplicit,
      parsedFromMessageIds: parsed,
      eligibleIds: eligible,
    });
  }

  private async collectCommentMentionUserIds(
    dto: CreateChatterCommentDto,
    message: string,
    authorId: string,
    role: UserRole | string,
    taskId?: string | null,
    projectId?: string | null,
  ): Promise<string[]> {
    const directory = await this.resolveEligibleMentionUsers(authorId, role, taskId, projectId);
    const eligible = new Set(directory.map((user) => user.id));
    const explicitIds = uniqueUuids([dto.mentionUserId, ...(dto.mentionUserIds ?? [])]);
    const validatedExplicit = await this.resolveExistingUserIds(explicitIds);
    const parsed = parseMentionUserIdsFromMessage(message, directory);
    return mergeCollectedMentionUserIds({
      explicitIds: validatedExplicit,
      parsedFromMessageIds: parsed,
      eligibleIds: eligible,
    });
  }

  private mergeMentionedUsersList(
    junctionUsers: ChatterMentionedUserDto[],
    columnUserId?: string | null,
    columnUserName?: string | null,
  ): ChatterMentionedUserDto[] {
    const map = new Map<string, ChatterMentionedUserDto>();
    for (const user of junctionUsers) {
      const id = normalizeUserId(user.id);
      if (!id) continue;
      map.set(id, { id, fullName: String(user.fullName ?? '').trim() || 'User' });
    }
    const columnId = normalizeUserId(columnUserId);
    if (columnId && !map.has(columnId)) {
      map.set(columnId, {
        id: columnId,
        fullName: String(columnUserName ?? '').trim() || 'User',
      });
    }
    return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  private async insertPostMentions(postId: string, userIds: string[]): Promise<void> {
    const ids = uniqueUuids(userIds);
    if (!ids.length) return;
    await this.prisma.$executeRaw(Prisma.sql`
      MERGE INTO ErpTSChatterPostMention AS target
      USING (VALUES ${Prisma.join(ids.map((uid) => Prisma.sql`(${postId}, ${uid})`))}) AS src(postId, userId)
      ON target.postId = src.postId AND target.userId = src.userId
      WHEN NOT MATCHED THEN INSERT (postId, userId) VALUES (src.postId, src.userId);
    `);
  }

  private async insertCommentMentions(commentId: string, userIds: string[]): Promise<void> {
    const ids = uniqueUuids(userIds);
    if (!ids.length) return;
    await this.prisma.$executeRaw(Prisma.sql`
      MERGE INTO ErpTSChatterCommentMention AS target
      USING (VALUES ${Prisma.join(ids.map((uid) => Prisma.sql`(${commentId}, ${uid})`))}) AS src(commentId, userId)
      ON target.commentId = src.commentId AND target.userId = src.userId
      WHEN NOT MATCHED THEN INSERT (commentId, userId) VALUES (src.commentId, src.userId);
    `);
  }

  private async loadPostMentionsMap(
    postIds: string[],
  ): Promise<Map<string, ChatterMentionedUserDto[]>> {
    const validIds = this.filterValidUuidList(postIds);
    const result = new Map<string, ChatterMentionedUserDto[]>();
    if (!validIds.length) return result;

    const rows = await this.prisma.$queryRaw<
      Array<{ postId: string; userId: string; fullName: string }>
    >(Prisma.sql`
      SELECT
        CONVERT(varchar(36), pm.postId) AS postId,
        CONVERT(varchar(36), pm.userId) AS userId,
        u.fullName
      FROM ErpTSChatterPostMention pm
      INNER JOIN ErpTSUser u ON u.id = pm.userId
      WHERE pm.postId IN (${Prisma.join(validIds)})
      ORDER BY u.fullName ASC
    `);

    for (const row of rows) {
      const key = this.entityIdKey(String(row.postId));
      if (!key) continue;
      const bucket = result.get(key) ?? [];
      const id = normalizeUserId(String(row.userId));
      if (!id) continue;
      bucket.push({ id, fullName: String(row.fullName ?? '').trim() });
      result.set(key, bucket);
    }
    return result;
  }

  private async loadCommentMentionsMap(
    commentIds: string[],
  ): Promise<Map<string, ChatterMentionedUserDto[]>> {
    const validIds = this.filterValidUuidList(commentIds);
    const result = new Map<string, ChatterMentionedUserDto[]>();
    if (!validIds.length) return result;

    const rows = await this.prisma.$queryRaw<
      Array<{ commentId: string; userId: string; fullName: string }>
    >(Prisma.sql`
      SELECT
        CONVERT(varchar(36), cm.commentId) AS commentId,
        CONVERT(varchar(36), cm.userId) AS userId,
        u.fullName
      FROM ErpTSChatterCommentMention cm
      INNER JOIN ErpTSUser u ON u.id = cm.userId
      WHERE cm.commentId IN (${Prisma.join(validIds)})
      ORDER BY u.fullName ASC
    `);

    for (const row of rows) {
      const key = this.entityIdKey(String(row.commentId));
      if (!key) continue;
      const bucket = result.get(key) ?? [];
      const id = normalizeUserId(String(row.userId));
      if (!id) continue;
      bucket.push({ id, fullName: String(row.fullName ?? '').trim() });
      result.set(key, bucket);
    }
    return result;
  }

  private async loadPostSeenMap(
    postIds: string[],
  ): Promise<Map<string, ChatterSeenByUserDto[]>> {
    const validIds = this.filterValidUuidList(postIds);
    const result = new Map<string, ChatterSeenByUserDto[]>();
    if (!validIds.length) return result;

    const rows = await this.prisma.$queryRaw<
      Array<{ postId: string; userId: string; fullName: string }>
    >(Prisma.sql`
      SELECT
        CONVERT(varchar(36), ps.postId) AS postId,
        CONVERT(varchar(36), ps.userId) AS userId,
        u.fullName
      FROM ErpTSChatterPostSeen ps
      INNER JOIN ErpTSUser u ON u.id = ps.userId
      WHERE ps.postId IN (${Prisma.join(validIds)})
      ORDER BY ps.seenAt ASC, u.fullName ASC
    `);

    for (const row of rows) {
      const key = this.entityIdKey(String(row.postId));
      if (!key) continue;
      const bucket = result.get(key) ?? [];
      const id = normalizeUserId(String(row.userId));
      if (!id) continue;
      bucket.push({ id, fullName: String(row.fullName ?? '').trim() || 'User' });
      result.set(key, bucket);
    }
    return result;
  }

  private async loadPostLikeCountMap(postIds: string[]): Promise<Map<string, number>> {
    const validIds = this.filterValidUuidList(postIds);
    const result = new Map<string, number>();
    if (!validIds.length) return result;

    const rows = await this.prisma.$queryRaw<Array<{ postId: string; cnt: number }>>(Prisma.sql`
      SELECT CONVERT(varchar(36), postId) AS postId, COUNT(*) AS cnt
      FROM ErpTSChatterPostLike
      WHERE postId IN (${Prisma.join(validIds)})
      GROUP BY postId
    `);

    for (const row of rows) {
      const key = this.entityIdKey(String(row.postId));
      if (!key) continue;
      result.set(key, Number(row.cnt ?? 0));
    }
    return result;
  }

  private async syncSeenByCounts(postIds: string[]): Promise<void> {
    const validIds = this.filterValidUuidList(postIds);
    if (!validIds.length) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE p
      SET seenByCount = COALESCE(c.cnt, 0)
      FROM ErpTSChatterPost p
      LEFT JOIN (
        SELECT postId, COUNT(*) AS cnt
        FROM ErpTSChatterPostSeen
        WHERE postId IN (${Prisma.join(validIds)})
        GROUP BY postId
      ) c ON c.postId = p.id
      WHERE p.id IN (${Prisma.join(validIds)});
    `);
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

  private buildChatterDeepLink(params: {
    postId: string;
    commentId?: string | null;
    taskId?: string | null;
    projectId?: string | null;
  }): string {
    const q = new URLSearchParams();
    q.set('postId', params.postId);
    if (params.commentId) q.set('commentId', params.commentId);
    if (params.taskId) {
      q.set('tab', 'chatter');
      return `/task-summary/${params.taskId}?${q.toString()}`;
    }
    if (params.projectId) {
      q.set('tab', 'chatter');
      return `/chatter?${q.toString()}&projectId=${params.projectId}`;
    }
    return `/chatter?${q.toString()}`;
  }

  private async assertQsChatterContextAccess(
    taskId: string | null | undefined,
    projectId: string | null | undefined,
    userId: string,
    role: UserRole | string,
  ) {
    if (String(role) !== UserRole.QS) return;
    const task = optionalUuid(taskId);
    const project = optionalUuid(projectId);
    if (!task && !project) {
      throw new ForbiddenException('QS chatter must be tied to an assigned project or task');
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT TOP 1 [assignment].[id] AS [id]
      FROM [ErpTSProjectQsAssignment] [assignment]
      ${task ? Prisma.sql`INNER JOIN [ErpTSTask] [task] ON [task].[projectId] = [assignment].[projectId]` : Prisma.empty}
      WHERE [assignment].[qsUserId] = ${userId}
        ${task ? Prisma.sql`AND [task].[id] = ${task}` : Prisma.sql`AND [assignment].[projectId] = ${project}`}
    `);
    if (rows.length === 0) {
      throw new ForbiddenException('QS users can only use chatter for assigned projects');
    }
  }

  private async notifyMentionedUsers(params: {
    mentionedUserIds: string[];
    authorId: string;
    authorName: string;
    postId: string;
    commentId?: string | null;
    isComment?: boolean;
    messageText?: string;
    listingLabel?: string | null;
    taskId?: string | null;
    projectId?: string | null;
  }): Promise<void> {
    const ref = params.listingLabel?.trim() || 'a discussion';
    const snippet = messageSnippet(params.messageText ?? '');
    const kind = params.isComment ? 'comment' : 'post';
    const link = this.buildChatterDeepLink({
      postId: params.postId,
      commentId: params.commentId,
      taskId: params.taskId,
      projectId: params.projectId,
    });

    for (const userId of uniqueUuids(params.mentionedUserIds)) {
      if (userId === params.authorId) continue;
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId,
            title: 'You were mentioned in Chatter',
            message: `${params.authorName} mentioned you in a ${kind} about ${ref}${snippet ? `: "${snippet}"` : '.'}`,
            linkUrl: link,
          },
        });
        this.dashboardRealtime?.notifyUserNotificationRefresh(userId);
      } catch (err) {
        this.logger.warn(`Mention notification failed for ${userId}: ${err}`);
      }
    }
  }

  private async loadCommentById(commentId: string): Promise<ChatterCommentDto | null> {
    const id = optionalUuid(commentId);
    if (!id) return null;

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
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
      WHERE c.id = ${id}
    `);

    const row = rows[0];
    if (!row) return null;
    const dto = this.mapCommentRow(row);
    const mentionMap = await this.loadCommentMentionsMap([id]);
    const mentionedUsers = mentionMap.get(this.entityIdKey(id) ?? id) ?? [];
    if (!mentionedUsers.length) return dto;
    return {
      ...dto,
      mentionedUsers,
      mentionUserId: mentionedUsers[0]?.id ?? dto.mentionUserId,
    };
  }

  async listMentionUsers(
    viewerId: string,
    role: UserRole | string,
    taskId?: string,
    projectId?: string,
  ) {
    return this.resolveEligibleMentionUsers(viewerId, role, taskId, projectId);
  }

  private mapCommentRow(
    row: Record<string, unknown>,
    mentionedUsers: ChatterMentionedUserDto[] = [],
  ): ChatterCommentDto {
    const createdAt =
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as string | number | Date);
    const primaryMention = normalizeUserId(
      mentionedUsers[0]?.id ?? (row.mentionUserId != null ? String(row.mentionUserId) : null),
    );
    return {
      id: normalizeUserId(String(row.id)) ?? String(row.id),
      postId: normalizeUserId(row.postId != null ? String(row.postId) : null),
      authorId: normalizeUserId(row.authorId != null ? String(row.authorId) : null),
      authorName: row.authorName != null ? String(row.authorName) : null,
      authorRole: row.authorRole != null ? String(row.authorRole) : null,
      mentionUserId: primaryMention,
      mentionedUsers,
      message: String(row.message ?? ''),
      createdAt: createdAt.toISOString(),
    };
  }

  private async findCommentsByPostIds(postIds: string[]): Promise<ChatterCommentDto[]> {
    const validIds = this.filterValidUuidList(postIds);
    if (!validIds.length) return [];

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
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
      WHERE c.postId IN (${Prisma.join(validIds)})
      ORDER BY c.createdAt DESC`);

    const commentDtos = rows.map((row) => this.mapCommentRow(row));
    const mentionMap = await this.loadCommentMentionsMap(commentDtos.map((c) => c.id));
    return commentDtos.map((comment) => {
      const extra = mentionMap.get(this.entityIdKey(comment.id) ?? comment.id) ?? [];
      const mentionedUsers = this.mergeMentionedUsersList(
        extra,
        comment.mentionUserId,
        null,
      );
      if (!mentionedUsers.length) return comment;
      return {
        ...comment,
        mentionedUsers,
        mentionUserId: mentionedUsers[0]?.id ?? comment.mentionUserId,
      };
    });
  }

  private attachComments(posts: ChatterPostDto[], comments: ChatterCommentDto[]): ChatterPostDto[] {
    const byPostId = new Map<string, ChatterCommentDto[]>();
    for (const comment of comments) {
      const key = this.entityIdKey(comment.postId) ?? comment.postId ?? '';
      if (!key) continue;
      const bucket = byPostId.get(key) ?? [];
      bucket.push(comment);
      byPostId.set(key, bucket);
    }
    return posts.map((post) => {
      const postKey = this.entityIdKey(post.id) ?? post.id;
      const rawComments = byPostId.get(postKey) ?? [];
      const commentsById = new Map<string, ChatterCommentDto>();
      for (const comment of rawComments) {
        const commentKey = this.entityIdKey(comment.id) ?? comment.id;
        if (!commentKey) continue;
        commentsById.set(commentKey, comment);
      }
      return {
        ...post,
        comments: [...commentsById.values()],
      };
    });
  }

  /** Fetch attachments from ErpTSChatterPostAttachment for a set of post IDs and generate signed URLs */
  private async findAttachmentsByPostIds(postIds: string[]): Promise<Map<string, ChatterAttachmentDto[]>> {
    const ids = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
    const result = new Map<string, ChatterAttachmentDto[]>();
    if (ids.length === 0) return result;

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
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
      ORDER BY a.createdAt ASC`);

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

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        l.id,
        l.chatterPostId,
        l.url,
        l.displayName,
        l.platform
      FROM ErpTSLinkAttachment l
      WHERE l.chatterPostId IN (${Prisma.join(ids)})
      ORDER BY l.createdAt ASC`);

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
    >(Prisma.sql`
      SELECT TOP 1
        t.title,
        t.taskNo,
        t.opNo,
        pr.name AS projectName,
        pr.projectNo AS projectNo,
        t.projectId
      FROM ErpTSTask t
      LEFT JOIN ErpTSProject pr ON pr.id = t.projectId
      WHERE t.id = ${taskId}`);
    const row = rows[0];
    if (!row) {
      return { taskName: null, taskOpNo: null, projectName: null, projectNo: null, projectId: null };
    }
    const taskOpNo = resolveTaskOpNo(row.opNo, row.taskNo);
    return {
      taskName: row.title?.trim() || taskOpNo,
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
    const [comments, attachmentsMap, linksMap, mentionMap, seenMap, likeCountMap] = await Promise.all([
      this.findCommentsByPostIds(postIds),
      this.findAttachmentsByPostIds(postIds),
      this.findLinksByPostIds(postIds),
      this.loadPostMentionsMap(postIds),
      this.loadPostSeenMap(postIds),
      this.loadPostLikeCountMap(postIds),
    ]);
    const withComments = this.attachComments(posts, comments);
    return withComments.map((post) => {
      const postKey = this.entityIdKey(post.id) ?? post.id;
      const mentionedUsers = this.mergeMentionedUsersList(
        mentionMap.get(postKey) ?? post.mentionedUsers ?? [],
        post.mentionUserId,
        post.mentionUserName,
      );
      const seenByUsers = seenMap.get(postKey) ?? [];
      const seenByCount = seenByUsers.length;
      const primaryMention = mentionedUsers[0]?.fullName ?? post.mentionUserName;
      return {
        ...post,
        mentionedUsers,
        mentionUserId: mentionedUsers[0]?.id ?? normalizeUserId(post.mentionUserId),
        mentionUserName: primaryMention ?? post.mentionUserName,
        seenByUsers,
        seenByCount,
        likeCount: likeCountMap.get(postKey) ?? 0,
        attachments: attachmentsMap.get(postKey) ?? [],
        linkAttachments: linksMap.get(postKey) ?? [],
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
      id: normalizeUserId(String(row.id)) ?? String(row.id),
      taskId,
      taskName: taskOpNo,
      taskOpNo,
      projectId: row.projectId != null ? String(row.projectId) : null,
      projectNo,
      listingLabel,
      authorId: normalizeUserId(row.authorId != null ? String(row.authorId) : null),
      authorName: row.authorName != null ? String(row.authorName) : null,
      authorRole: row.authorRole != null ? String(row.authorRole) : null,
      mentionUserName: row.mentionUserName != null ? String(row.mentionUserName) : null,
      projectName: row.projectName != null ? String(row.projectName) : null,
      assigneeName: row.assigneeName != null ? String(row.assigneeName) : null,
      title: displayTitle,
      message: row.message,
      postType: row.postType ?? null,
      mentionUserId: normalizeUserId(row.mentionUserId != null ? String(row.mentionUserId) : null),
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
    cursor?: string,
    viewerId?: string,
    viewerRole?: string,
  ): Promise<{ data: ChatterPostDto[]; pageInfo: { hasMore: boolean; nextCursor: string | null } }> {
    const limit = Math.min(200, Math.max(1, Number.parseInt(limitParam ?? '50', 10) || 50));
    const taskId = optionalUuid(taskIdFilter);
    const projectId = optionalUuid(projectIdFilter);
    const mentionUserId = optionalUuid(mentionUserIdFilter);
    const commentedByUserId = optionalUuid(commentedByUserIdFilter);
    const postType = postTypeFilter?.trim() || null;

    const whereFragments: Prisma.Sql[] = [];
    if (viewerRole === UserRole.QS) {
      if (!viewerId) throw new ForbiddenException('QS access requires an authenticated user');
      whereFragments.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM ErpTSProjectQsAssignment qsa
        WHERE qsa.qsUserId = ${viewerId}
          AND qsa.projectId = COALESCE(t.projectId, p.projectId)
      )`);
    }
    if (taskId) {
      whereFragments.push(Prisma.sql`p.taskId = ${taskId}`);
    } else if (projectId) {
      whereFragments.push(Prisma.sql`(
        t.projectId = ${projectId}
        OR p.projectId = ${projectId}
      )`);
    }
    if (mentionUserId) {
      whereFragments.push(Prisma.sql`(
        p.mentionUserId = ${mentionUserId}
        OR EXISTS (
          SELECT 1 FROM ErpTSChatterPostMention pm
          WHERE pm.postId = p.id AND pm.userId = ${mentionUserId}
        )
        OR EXISTS (
          SELECT 1 FROM ErpTSChatterComment cm
          WHERE cm.postId = p.id AND cm.mentionUserId = ${mentionUserId}
        )
        OR EXISTS (
          SELECT 1 FROM ErpTSChatterComment cm
          INNER JOIN ErpTSChatterCommentMention cmm ON cmm.commentId = cm.id
          WHERE cm.postId = p.id AND cmm.userId = ${mentionUserId}
        )
      )`);
    }
    if (commentedByUserId) {
      whereFragments.push(Prisma.sql`EXISTS (
        SELECT 1 FROM ErpTSChatterComment cm
        WHERE cm.postId = p.id AND cm.authorId = ${commentedByUserId}
      )`);
    }
    if (postType) {
      whereFragments.push(Prisma.sql`p.postType = ${postType}`);
    }
    if (weekStartFilter?.trim()) {
      const range = weekRangeContaining(weekStartFilter.trim());
      if (range) {
        whereFragments.push(Prisma.sql`p.createdAt >= ${range.start} AND p.createdAt <= ${range.end}`);
      }
    }
    const cursorIso = optionalPaginationCursor(cursor);
    if (cursorIso) {
      whereFragments.push(Prisma.sql`p.updatedAt < ${cursorIso}`);
    }

    const whereClause = buildWhere(whereFragments);
    const fetchLimit = limit + 1;

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT TOP (${fetchLimit})
        ${Prisma.raw(this.postSelectColumns('p'))}
      ${Prisma.raw(this.postJoinSql('p'))}
      ${whereClause}
      ORDER BY p.updatedAt DESC, p.createdAt DESC
    `);

    const hasMore = rows.length > limit;
    const slicedRows = hasMore ? rows.slice(0, limit) : rows;
    const posts = slicedRows.map((r) => ({
      ...this.mapRow(r),
      comments: [] as ChatterCommentDto[],
      attachments: [] as ChatterAttachmentDto[],
      linkAttachments: [] as ChatterLinkAttachmentDto[],
    }));

    const data = await this.enrichPosts(posts);
    const lastItem = data[data.length - 1];
    const nextCursor =
      hasMore && lastItem ? optionalPaginationCursor(lastItem.updatedAt) : null;
    return { data, pageInfo: { hasMore: hasMore && Boolean(nextCursor), nextCursor } };
  }

  async loadPostById(
    postId: string,
    viewerId?: string,
    viewerRole?: string,
  ): Promise<ChatterPostDto | null> {
    const id = optionalUuid(postId);
    if (!id) return null;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT TOP (1)
        ${Prisma.raw(this.postSelectColumns('p'))}
      ${Prisma.raw(this.postJoinSql('p'))}
      WHERE p.id = ${id}
    `);
    const row = rows[0];
    if (!row) return null;

    const taskId = row.taskId != null ? String(row.taskId) : null;
    const projectId = row.projectId != null ? String(row.projectId) : null;
    if (viewerId && viewerRole) {
      await this.assertQsChatterContextAccess(taskId, projectId, viewerId, viewerRole);
    }

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

  async findCommentsForPost(
    postId: string,
    viewerId?: string,
    viewerRole?: string,
  ): Promise<ChatterCommentDto[]> {
    const id = postId.trim();
    if (!optionalUuid(id)) {
      throw new BadRequestException('postId must be a valid UUID');
    }
    if (viewerId && viewerRole) {
      const post = await this.loadPostById(id, viewerId, viewerRole);
      if (!post) {
        throw new NotFoundException('Chatter post not found');
      }
    }
    return this.findCommentsByPostIds([id]);
  }

  async createComment(
    postId: string,
    dto: CreateChatterCommentDto,
    authorId: string,
    authorRole: UserRole | string,
  ): Promise<ChatterCommentDto> {
    const normalizedPostId = postId.trim();
    if (!optionalUuid(normalizedPostId)) {
      throw new BadRequestException('postId must be a valid UUID');
    }

    const postExists = await this.prisma.$queryRaw<Array<{ id: string; taskId: string | null; projectId: string | null }>>(Prisma.sql`
      SELECT TOP 1 p.id, p.taskId, COALESCE(t.projectId, p.projectId) AS projectId
      FROM ErpTSChatterPost p
      LEFT JOIN ErpTSTask t ON t.id = p.taskId
      WHERE p.id = ${normalizedPostId}`);
    if (!postExists.length) {
      throw new NotFoundException('Chatter post not found');
    }

    const postContext = postExists[0];
    await this.assertQsChatterContextAccess(postContext.taskId, postContext.projectId, authorId, authorRole);
    const mentionUserIds = await this.collectCommentMentionUserIds(
      dto,
      dto.message,
      authorId,
      authorRole,
      postContext.taskId,
      postContext.projectId,
    );
    const mentionUserId = mentionUserIds[0] ?? optionalUuid(dto.mentionUserId);
    const message = dto.message.trim();

    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      DECLARE @ids TABLE (cid uniqueidentifier);
      INSERT INTO ErpTSChatterComment (postId, authorId, mentionUserId, message, createdAt)
      OUTPUT INSERTED.id INTO @ids(cid)
      VALUES (
        ${normalizedPostId},
        ${authorId},
        ${mentionUserId},
        ${message},
        SYSUTCDATETIME()
      );
      SELECT CONVERT(varchar(36), cid) AS id FROM @ids;
    `);
    const newCommentId = idRows[0]?.id;
    if (!newCommentId) {
      throw new BadRequestException('Failed to create chatter comment');
    }

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ErpTSChatterPost
      SET updatedAt = SYSUTCDATETIME()
      WHERE id = ${normalizedPostId}
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
        taskSnapshot: postExists[0].taskId
          ? {
              id: postExists[0].taskId,
              taskNo: postMeta?.taskOpNo ?? undefined,
              title: postMeta?.taskName ?? postMeta?.taskOpNo ?? undefined,
            }
          : undefined,
        projectSnapshot: postExists[0].projectId
          ? {
              id: postExists[0].projectId,
              projectNo: postMeta?.projectNo ?? undefined,
              name: postMeta?.projectName ?? undefined,
            }
          : undefined,
        changes: { postId: normalizedPostId },
        context: { projectId: postExists[0].projectId ?? null, postId: normalizedPostId },
      },
    });

    this.dashboardRealtime?.notifyChatterRefresh({
      event: 'chatter_comment_created',
      postId: normalizedPostId,
      taskId: postExists[0].taskId ?? null,
      projectId: postExists[0].projectId ?? null,
      at: new Date().toISOString(),
    });

    if (mentionUserIds.length > 0) {
      await this.notifyMentionedUsers({
        mentionedUserIds: mentionUserIds,
        authorId,
        authorName: author?.fullName?.trim() || 'Someone',
        postId: normalizedPostId,
        commentId: newCommentId,
        isComment: true,
        messageText: dto.message,
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

  async create(
    dto: CreateChatterPostDto,
    authorId: string,
    authorRole: UserRole | string,
    files?: Express.Multer.File[],
  ): Promise<ChatterPostDto> {
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
    const resolvedProjectId = taskMeta.projectId ?? dtoProjectId;
    await this.assertQsChatterContextAccess(taskId, resolvedProjectId, authorId, authorRole);
    const mentionUserIds = await this.collectPostMentionUserIds(
      dto,
      dto.message,
      authorId,
      authorRole,
      taskId,
      resolvedProjectId,
    );
    const primaryMentionUserId = mentionUserIds[0] ?? optionalUuid(dto.mentionUserId);

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
        isComment: false,
        messageText: dto.message,
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
        taskSnapshot: newPost.taskId
          ? {
              id: newPost.taskId,
              taskNo: taskMeta.taskOpNo ?? undefined,
              title: taskMeta.taskName ?? undefined,
            }
          : undefined,
        projectSnapshot: projectId
          ? {
              id: projectId,
              projectNo: taskMeta.projectNo ?? projectMeta.projectNo ?? undefined,
              name: projectName ?? undefined,
            }
          : undefined,
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

    this.dashboardRealtime?.notifyChatterRefresh({
      event: 'chatter_post_created',
      postId: newPost.id,
      taskId: newPost.taskId ?? null,
      projectId: projectId ?? null,
      at: new Date().toISOString(),
    });

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

  async updatePost(postId: string, dto: UpdateChatterPostDto, requesterId: string): Promise<ChatterPostDto> {
    const id = optionalUuid(postId);
    if (!id) throw new BadRequestException('postId must be a valid UUID');

    const rows = await this.prisma.$queryRaw<Array<{ authorId: string | null; taskId: string | null; projectId: string | null }>>(Prisma.sql`
      SELECT TOP 1 CONVERT(varchar(36), authorId) AS authorId, CONVERT(varchar(36), taskId) AS taskId, CONVERT(varchar(36), projectId) AS projectId
      FROM ErpTSChatterPost WHERE id = ${id}
    `);
    if (!rows.length) throw new NotFoundException('Chatter post not found');
    if (!isSameUserId(rows[0].authorId, requesterId)) {
      throw new ForbiddenException('Only the post author can edit this post');
    }

    const setFragments: Prisma.Sql[] = [
      Prisma.sql`updatedAt = SYSUTCDATETIME()`,
      Prisma.sql`editedAt = SYSUTCDATETIME()`,
    ];
    if (dto.message !== undefined) setFragments.push(Prisma.sql`message = ${dto.message}`);
    if (dto.title !== undefined) setFragments.push(Prisma.sql`title = ${dto.title}`);

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ErpTSChatterPost SET ${Prisma.join(setFragments, ', ')} WHERE id = ${id}
    `);

    this.dashboardRealtime?.notifyChatterRefresh({
      event: 'chatter_post_updated',
      postId: id,
      taskId: rows[0].taskId ?? null,
      projectId: rows[0].projectId ?? null,
      at: new Date().toISOString(),
    });

    const updated = await this.loadPostById(id);
    if (!updated) throw new BadRequestException('Post updated but could not be reloaded');
    return updated;
  }

  async deletePost(postId: string, requesterId: string): Promise<void> {
    const id = optionalUuid(postId);
    if (!id) throw new BadRequestException('postId must be a valid UUID');

    const rows = await this.prisma.$queryRaw<Array<{ authorId: string | null; taskId: string | null; projectId: string | null }>>(Prisma.sql`
      SELECT TOP 1 CONVERT(varchar(36), authorId) AS authorId, CONVERT(varchar(36), taskId) AS taskId, CONVERT(varchar(36), projectId) AS projectId
      FROM ErpTSChatterPost WHERE id = ${id}
    `);
    if (!rows.length) throw new NotFoundException('Chatter post not found');
    if (!isSameUserId(rows[0].authorId, requesterId)) {
      throw new ForbiddenException('Only the post author can delete this post');
    }

    await this.prisma.$executeRaw(Prisma.sql`DELETE FROM ErpTSChatterPost WHERE id = ${id}`);

    this.dashboardRealtime?.notifyChatterRefresh({
      event: 'chatter_post_deleted',
      postId: id,
      taskId: rows[0].taskId ?? null,
      projectId: rows[0].projectId ?? null,
      at: new Date().toISOString(),
    });
  }

  async updateComment(postId: string, commentId: string, dto: UpdateChatterCommentDto, requesterId: string): Promise<ChatterCommentDto> {
    const cid = optionalUuid(commentId);
    const pid = optionalUuid(postId);
    if (!cid || !pid) throw new BadRequestException('postId and commentId must be valid UUIDs');

    const rows = await this.prisma.$queryRaw<Array<{ authorId: string | null }>>(Prisma.sql`
      SELECT TOP 1 CONVERT(varchar(36), authorId) AS authorId
      FROM ErpTSChatterComment WHERE id = ${cid} AND postId = ${pid}
    `);
    if (!rows.length) throw new NotFoundException('Comment not found');
    if (!isSameUserId(rows[0].authorId, requesterId)) {
      throw new ForbiddenException('Only the comment author can edit this comment');
    }

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ErpTSChatterComment SET message = ${dto.message} WHERE id = ${cid}
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ErpTSChatterPost SET updatedAt = SYSUTCDATETIME() WHERE id = ${pid}
    `);

    this.dashboardRealtime?.notifyChatterRefresh({
      event: 'chatter_comment_created',
      postId: pid,
      at: new Date().toISOString(),
    });

    const loaded = await this.loadCommentById(cid);
    if (!loaded) throw new BadRequestException('Comment updated but could not be reloaded');
    return loaded;
  }

  async deleteComment(postId: string, commentId: string, requesterId: string): Promise<void> {
    const cid = optionalUuid(commentId);
    const pid = optionalUuid(postId);
    if (!cid || !pid) throw new BadRequestException('postId and commentId must be valid UUIDs');

    const rows = await this.prisma.$queryRaw<Array<{ authorId: string | null }>>(Prisma.sql`
      SELECT TOP 1 CONVERT(varchar(36), authorId) AS authorId
      FROM ErpTSChatterComment WHERE id = ${cid} AND postId = ${pid}
    `);
    if (!rows.length) throw new NotFoundException('Comment not found');
    if (!isSameUserId(rows[0].authorId, requesterId)) {
      throw new ForbiddenException('Only the comment author can delete this comment');
    }

    await this.prisma.$executeRaw(Prisma.sql`DELETE FROM ErpTSChatterComment WHERE id = ${cid}`);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ErpTSChatterPost SET updatedAt = SYSUTCDATETIME() WHERE id = ${pid}
    `);

    this.dashboardRealtime?.notifyChatterRefresh({
      event: 'chatter_comment_deleted',
      postId: pid,
      at: new Date().toISOString(),
    });
  }

  async markPostsSeen(
    postIds: string[],
    userId: string,
  ): Promise<{
    updates: Array<{ postId: string; seenByCount: number; seenByUsers: ChatterSeenByUserDto[] }>;
  }> {
    const uid = optionalUuid(userId);
    if (!uid) throw new BadRequestException('Invalid userId');

    const ids = uniqueUuids(postIds);
    if (!ids.length) return { updates: [] };

    const validIds = this.filterValidUuidList(ids);
    if (!validIds.length) return { updates: [] };

    const existingRows = await this.prisma.$queryRaw<
      Array<{ id: string; taskId: string | null; projectId: string | null }>
    >(Prisma.sql`
      SELECT
        CONVERT(varchar(36), id) AS id,
        CONVERT(varchar(36), taskId) AS taskId,
        CONVERT(varchar(36), projectId) AS projectId
      FROM ErpTSChatterPost
      WHERE id IN (${Prisma.join(validIds)})
    `);
    const existingIds = filterValidUuids(existingRows.map((row) => String(row.id)));
    if (!existingIds.length) return { updates: [] };

    await this.prisma.$executeRaw(Prisma.sql`
      MERGE INTO ErpTSChatterPostSeen AS target
      USING (VALUES ${Prisma.join(existingIds.map((postId) => Prisma.sql`(${postId}, ${uid})`))}) AS src(postId, userId)
      ON target.postId = src.postId AND target.userId = src.userId
      WHEN NOT MATCHED THEN INSERT (postId, userId, seenAt) VALUES (src.postId, src.userId, SYSUTCDATETIME());
    `);

    await this.syncSeenByCounts(existingIds);
    const seenMap = await this.loadPostSeenMap(existingIds);
    const updates = existingIds.map((postId) => {
      const postKey = this.entityIdKey(postId) ?? postId;
      const seenByUsers = seenMap.get(postKey) ?? [];
      return {
        postId: postKey,
        seenByCount: seenByUsers.length,
        seenByUsers,
      };
    });

    const firstRow = existingRows[0];
    this.dashboardRealtime?.notifyChatterRefresh({
      event: 'chatter_post_updated',
      postId: firstRow?.id ?? null,
      taskId: firstRow?.taskId ?? null,
      projectId: firstRow?.projectId ?? null,
      at: new Date().toISOString(),
    });

    return { updates };
  }

  async likePost(postId: string, userId: string): Promise<{ likeCount: number; liked: boolean }> {
    const id = optionalUuid(postId);
    const uid = optionalUuid(userId);
    if (!id || !uid) throw new BadRequestException('Invalid postId or userId');

    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT TOP 1 id FROM ErpTSChatterPostLike WHERE postId = ${id} AND userId = ${uid}
    `);

    let liked: boolean;
    if (existing.length > 0) {
      await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM ErpTSChatterPostLike WHERE postId = ${id} AND userId = ${uid}
      `);
      liked = false;
    } else {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO ErpTSChatterPostLike (postId, userId) VALUES (${id}, ${uid})
      `);
      liked = true;
    }

    const countRows = await this.prisma.$queryRaw<Array<{ cnt: number }>>(Prisma.sql`
      SELECT COUNT(*) AS cnt FROM ErpTSChatterPostLike WHERE postId = ${id}
    `);
    const likeCount = Number(countRows[0]?.cnt ?? 0);

    return { likeCount, liked };
  }

  async togglePin(postId: string, isPinned: boolean, requesterId: string): Promise<{ isPinned: boolean }> {
    const id = optionalUuid(postId);
    if (!id) throw new BadRequestException('postId must be a valid UUID');

    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: { select: { name: true } } },
    });
    const roleName = requester?.role?.name ?? '';
    if (!['HOD', 'ADMIN'].includes(roleName)) throw new ForbiddenException('Only HOD or ADMIN can pin posts');

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE ErpTSChatterPost SET isPinned = ${isPinned ? 1 : 0} WHERE id = ${id}
    `);

    return { isPinned };
  }
}
