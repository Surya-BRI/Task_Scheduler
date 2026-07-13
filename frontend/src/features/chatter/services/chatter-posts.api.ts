import { apiClient } from '@/lib/api-client';
import { isSameUserId, normalizeUserId } from '@/lib/user-id';
import { parseMentionUserIdsFromMessage } from '../utils/mention-utils';

export type ChatterMentionedUserDto = {
  id: string;
  fullName: string;
};

export type ChatterCommentDto = {
  id: string;
  postId: string | null;
  authorId: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  mentionUserId?: string | null;
  mentionedUsers?: ChatterMentionedUserDto[];
  message: string;
  createdAt: string;
};

export type ChatterAttachmentDto = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number;
  url: string;
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
  taskName?: string | null;
  taskOpNo?: string | null;
  projectId?: string | null;
  projectNo?: string | null;
  listingLabel?: string | null;
  authorId: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  mentionUserName?: string | null;
  projectName?: string | null;
  assigneeName?: string | null;
  title: string;
  message: string;
  postType: string | null;
  mentionUserId: string | null;
  mentionedUsers?: ChatterMentionedUserDto[];
  priority: string | number | null;
  seenByCount: number;
  seenByUsers?: ChatterMentionedUserDto[];
  likeCount?: number;
  attachmentCount: number;
  isPinned: boolean;
  editedAt: string | null;
  likedByMe?: boolean;
  visibility: string | null;
  createdAt: string;
  updatedAt: string;
  comments?: ChatterCommentDto[];
  attachments?: ChatterAttachmentDto[];
  linkAttachments?: ChatterLinkAttachmentDto[];
};

/** Shape expected by `ChatterScreen` / `ChatterCard` for the main feed */
export type ChatterFeedPost = {
  id: string;
  title: string;
  author: string;
  authorId?: string | null;
  time: string;
  mention: string;
  mentionUserId?: string | null;
  mentionedUsers?: ChatterMentionedUserDto[];
  message: string;
  projectName: string;
  projectNo?: string | null;
  projectId?: string | null;
  taskName?: string | null;
  taskOpNo?: string | null;
  listingLabel?: string | null;
  responsibleUser: string;
  priority: 'low' | 'medium' | 'high' | null;
  seenBy: number;
  seenByUsers?: ChatterMentionedUserDto[];
  likeCount?: number;
  designerName?: string | null;
  comments: Array<{
    id: string;
    message: string;
    author: string;
    authorId: string | null;
    mentionUserId?: string | null;
    mentionedUsers?: ChatterMentionedUserDto[];
    createdAt: string;
  }>;
  updatedAt: string;
  postType?: string;
  fileAttachments?: Array<{ id: string; fileName: string; mimeType: string | null; sizeBytes: number; url: string }>;
  linkAttachments?: Array<{ id: string; name: string; url: string; platformLabel: string; platformIcon: string; platformBadgeClass: string }>;
  taskId?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(value: string): boolean {
  return UUID_PATTERN.test(value.trim()) || /^(Task|User)\s+[0-9a-f-]{36}/i.test(value.trim());
}

function safeDisplayValue(value: string | null | undefined, fallback = '—'): string {
  if (!value?.trim()) return fallback;
  return isUuidLike(value.trim()) ? fallback : value.trim();
}

/** Project name for chatter sidebars (never falls back to project number). */
export function resolveSidebarProjectName(dto: {
  projectName?: string | null;
  projectId?: string | null;
}): string | null {
  const name = dto.projectName?.trim();
  if (name && !isUuidLike(name)) return name;
  if (dto.projectId) return 'Unnamed Project';
  return null;
}

export function normalizePriority(
  p: string | number | null | undefined,
): 'low' | 'medium' | 'high' | null {
  if (p == null || String(p).trim() === '') return null;
  const s = String(p).trim().toLowerCase();
  if (s === 'high' || s === 'urgent' || s === '3' || s === 'critical') return 'high';
  if (s === 'low' || s === '1' || s === 'minor') return 'low';
  if (s === 'medium' || s === '2' || s === 'normal') return 'medium';
  const n = Number(p);
  if (n === 1) return 'low';
  if (n === 3) return 'high';
  if (n === 2) return 'medium';
  return null;
}

export function formatChatterTime(value: Date | string | null | undefined): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function normalizePostType(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return 'Posts';
  const lower = t.toLowerCase();
  if (lower.includes('task') && lower.includes('update')) return 'Task Updates';
  if (lower.includes('private')) return 'Private';
  if (lower === 'client_reject' || lower === 'client-reject' || lower === 'client rejected') {
    return 'CLIENT_REJECT';
  }
  if (lower === 'rework') return 'REWORK';
  return t;
}

function isGenericTaskReference(value: string): boolean {
  return !value || /^TSK(?:[\s-]|$)/i.test(value);
}

function resolveDisplayTitle(dto: ChatterPostDto): string {
  const listing = dto.listingLabel?.trim();
  if (listing) return listing;
  const title = dto.title?.trim() ?? '';
  const isGenericTitle =
    !title ||
    title.toLowerCase() === 'chatter post' ||
    isGenericTaskReference(title);
  // Prefer the author's title so Create Post does not get overwritten by OP/task name.
  if (title && !isGenericTitle) return title;
  const taskOp = dto.taskOpNo?.trim() || dto.taskName?.trim() || '';
  if (dto.taskId && taskOp && !isGenericTaskReference(taskOp)) return taskOp;
  const projectNo = dto.projectNo?.trim();
  if (projectNo) return projectNo;
  return title || taskOp || '(No title)';
}

/** Title for embedded project/task chatter lists (OP number or project number only). */
export function resolveEmbeddedChatterTitle(
  entry: {
    title?: string | null;
    taskName?: string | null;
    taskOpNo?: string | null;
    projectNo?: string | null;
    listingLabel?: string | null;
    taskId?: string | null;
    projectId?: string | null;
  },
  fallbackOpNo?: string | null,
  fallbackProjectNo?: string | null,
): string {
  const listing = entry.listingLabel?.trim();
  if (listing) return listing;
  const taskOp = entry.taskOpNo?.trim() || entry.taskName?.trim() || String(fallbackOpNo ?? '').trim();
  if (entry.taskId && taskOp && taskOp !== '-' && !isGenericTaskReference(taskOp)) return taskOp;
  const projectNo = entry.projectNo?.trim() || String(fallbackProjectNo ?? '').trim();
  if (projectNo && projectNo !== '-') return projectNo;
  if (taskOp && taskOp !== '-' && !isGenericTaskReference(taskOp)) return taskOp;
  return 'Discussion';
}

export function formatMentionSummary(
  users?: ChatterMentionedUserDto[],
  fallbackName?: string | null,
  message?: string | null,
): string {
  const directory = users ?? [];
  const idsInMessage = new Set(parseMentionUserIdsFromMessage(message ?? '', directory));
  const namesNotInBody = directory
    .filter((u) => u?.id && u.fullName?.trim() && !idsInMessage.has(u.id))
    .map((u) => u.fullName!.trim());
  if (namesNotInBody.length > 0) return namesNotInBody.map((n) => `@${n}`).join(', ');
  const single = fallbackName?.trim();
  if (single && !isUuidLike(single)) {
    const fallbackInMessage =
      parseMentionUserIdsFromMessage(message ?? '', [{ id: '__fallback__', fullName: single }])
        .length > 0;
    if (!fallbackInMessage) return `@${single}`;
  }
  return '—';
}

export function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mapCommentDtoToFeedComment(
  dto: ChatterCommentDto,
  currentUserId?: string | null,
): {
  id: string;
  message: string;
  author: string;
  authorId: string | null;
  mentionUserId?: string | null;
  mentionedUsers?: ChatterMentionedUserDto[];
  createdAt: string;
} {
  const full = dto.authorName?.trim();
  const role = dto.authorRole?.trim();
  const pretty = full ? `${full}${role ? ` (${role})` : ''}` : null;
  const authorLabel =
    dto.authorId && currentUserId && isSameUserId(dto.authorId, currentUserId)
      ? 'You'
      : pretty ?? 'Unknown';
  return {
    id: normalizeUserId(dto.id) ?? dto.id,
    message: dto.message || '',
    author: authorLabel,
    authorId: dto.authorId,
    mentionUserId: normalizeUserId(dto.mentionUserId),
    mentionedUsers: (dto.mentionedUsers ?? []).map((user) => ({
      ...user,
      id: normalizeUserId(user.id) ?? user.id,
    })),
    createdAt: dto.createdAt,
  };
}

export function mapChatterPostDtoToFeedPost(
  dto: ChatterPostDto,
  currentUserId?: string | null,
): ChatterFeedPost {
  const created = dto.createdAt ? new Date(dto.createdAt) : null;
  const rawFull = dto.authorName?.trim();
  const full = rawFull && !isUuidLike(rawFull) ? rawFull : null;
  const role = dto.authorRole?.trim();
  const pretty = full ? `${full}${role ? ` (${role})` : ''}` : null;
  const authorLabel =
    dto.authorId && currentUserId && isSameUserId(dto.authorId, currentUserId)
      ? 'You'
      : pretty ?? 'Unknown';
  const mentionedUsers = dto.mentionedUsers ?? [];
  const mention = formatMentionSummary(mentionedUsers, dto.mentionUserName, dto.message);

  const rawType = (dto.postType ?? '').trim();
  const lower = rawType.toLowerCase();
  const isGenericPosts = !rawType || lower === 'posts' || lower === 'post';

  const fileAttachments = (dto.attachments ?? []).map((a) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    url: a.url,
  }));

  const linkAttachments = (dto.linkAttachments ?? []).map((link) => ({
    id: link.id,
    name: link.displayName?.trim() || link.url,
    url: link.url,
    platformLabel: link.platform?.trim() || 'Link',
    platformIcon: '🔗',
    platformBadgeClass: 'border-slate-200 bg-white text-slate-600',
  }));

  const base: ChatterFeedPost = {
    id: normalizeUserId(dto.id) ?? dto.id,
    title: resolveDisplayTitle(dto),
    author: authorLabel,
    authorId: dto.authorId,
    time: formatChatterTime(created),
    mention,
    mentionUserId: normalizeUserId(dto.mentionUserId),
    mentionedUsers: (dto.mentionedUsers ?? []).map((user) => ({
      ...user,
      id: normalizeUserId(user.id) ?? user.id,
    })),
    message: dto.message || '',
    projectName: resolveSidebarProjectName(dto) ?? '—',
    projectNo: dto.projectNo?.trim() || null,
    projectId: dto.projectId ?? null,
    taskName: dto.taskOpNo?.trim() || dto.taskName?.trim() || null,
    taskOpNo: dto.taskOpNo?.trim() || null,
    listingLabel: dto.listingLabel?.trim() || null,
    designerName: safeDisplayValue(dto.assigneeName),
    responsibleUser: authorLabel,
    priority: normalizePriority(dto.priority),
    seenBy: (dto.seenByUsers?.length ?? 0) > 0 ? dto.seenByUsers!.length : (dto.seenByCount ?? 0),
    seenByUsers: (dto.seenByUsers ?? []).map((user) => ({
      ...user,
      id: normalizeUserId(user.id) ?? user.id,
    })),
    likeCount: dto.likeCount ?? 0,
    comments: (dto.comments ?? []).map((c) => mapCommentDtoToFeedComment(c, currentUserId)),
    updatedAt: dto.updatedAt || dto.createdAt || new Date(0).toISOString(),
    taskId: dto.taskId,
    fileAttachments: fileAttachments.length > 0 ? fileAttachments : undefined,
    linkAttachments: linkAttachments.length > 0 ? linkAttachments : undefined,
  };

  if (!isGenericPosts) {
    base.postType = normalizePostType(dto.postType);
  }

  return base;
}

export type ChatterMentionUser = {
  id: string;
  fullName: string;
};

export function listChatterMentionUsers(params?: { taskId?: string | null; projectId?: string | null }) {
  const qs = new URLSearchParams();
  if (params?.taskId?.trim()) qs.set('taskId', params.taskId.trim());
  if (params?.projectId?.trim()) qs.set('projectId', params.projectId.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient.get<ChatterMentionUser[]>(`/chatter-posts/mention-users${suffix}`);
}

export type ChatterPostsPagedResponse = {
  data: ChatterPostDto[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
};

/** Coerce API/query cursor values to an ISO string (dateReviver may return Date). */
export function normalizePaginationCursor(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function optionalQueryString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const asString = String(value).trim();
  return asString || null;
}

function normalizeChatterPostsPagedResponse(
  res: ChatterPostsPagedResponse | null | undefined,
): ChatterPostsPagedResponse {
  const data = Array.isArray(res?.data) ? res.data : [];
  return {
    data,
    pageInfo: {
      hasMore: Boolean(res?.pageInfo?.hasMore),
      nextCursor: normalizePaginationCursor(res?.pageInfo?.nextCursor),
    },
  };
}

export function listChatterPosts(params?: {
  limit?: number;
  taskId?: string;
  projectId?: string;
  mentionUserId?: string;
  commentedByUserId?: string;
  postType?: string;
  weekStart?: string;
  cursor?: unknown;
}) {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const taskId = optionalQueryString(params?.taskId);
  if (taskId) qs.set('taskId', taskId);
  const projectId = optionalQueryString(params?.projectId);
  if (projectId) qs.set('projectId', projectId);
  const mentionUserId = optionalQueryString(params?.mentionUserId);
  if (mentionUserId) qs.set('mentionUserId', mentionUserId);
  const commentedByUserId = optionalQueryString(params?.commentedByUserId);
  if (commentedByUserId) qs.set('commentedByUserId', commentedByUserId);
  const postType = optionalQueryString(params?.postType);
  if (postType) qs.set('postType', postType);
  const weekStart = optionalQueryString(params?.weekStart);
  if (weekStart) qs.set('weekStart', weekStart);
  const cursor = normalizePaginationCursor(params?.cursor);
  if (cursor) qs.set('cursor', cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient
    .get<ChatterPostsPagedResponse>(`/chatter-posts${suffix}`)
    .then(normalizeChatterPostsPagedResponse);
}

export function getChatterPost(postId: string) {
  return apiClient.get<ChatterPostDto>(`/chatter-posts/${encodeURIComponent(postId)}`);
}

function postMatchesTaskOpNo(
  post: ChatterPostDto,
  taskOpNo?: string | null,
): boolean {
  const needle = taskOpNo?.trim().toLowerCase();
  if (!needle) return false;
  const hay = [post.listingLabel, post.taskOpNo, post.taskName, post.title]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  return hay.includes(needle) || needle.includes(hay);
}

/** Task chatter: task-scoped posts plus legacy project-scoped posts for the same OP. */
export async function listChatterPostsForTask(params: {
  taskId: string;
  projectId?: string | null;
  taskOpNo?: string | null;
  limit?: number;
}): Promise<ChatterPostDto[]> {
  const limit = params.limit ?? 200;
  const taskRes = await listChatterPosts({ taskId: params.taskId, limit });
  const byId = new Map<string, ChatterPostDto>();
  for (const post of taskRes.data ?? []) {
    byId.set(post.id, post);
  }

  if (params.projectId) {
    const projectRes = await listChatterPosts({ projectId: params.projectId, limit });
    for (const post of projectRes.data ?? []) {
      if (byId.has(post.id)) continue;
      if (post.taskId === params.taskId) {
        byId.set(post.id, post);
        continue;
      }
      if (!post.taskId && postMatchesTaskOpNo(post, params.taskOpNo)) {
        byId.set(post.id, post);
      }
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function listChatterComments(postId: string) {
  return apiClient.get<ChatterCommentDto[]>(`/chatter-posts/${encodeURIComponent(postId)}/comments`);
}

export function createChatterComment(
  postId: string,
  message: string,
  mentionUserIds?: string[] | null,
) {
  const ids = (mentionUserIds ?? []).filter(Boolean);
  return apiClient.post<ChatterCommentDto>(`/chatter-posts/${encodeURIComponent(postId)}/comments`, {
    message,
    ...(ids.length === 1 ? { mentionUserId: ids[0] } : {}),
    ...(ids.length > 0 ? { mentionUserIds: ids } : {}),
  });
}

export function createChatterPost(
  data: Partial<ChatterPostDto>,
  files?: File[],
  linkAttachments?: Array<{ url: string; name?: string; platformLabel?: string }>,
) {
  const payload: Record<string, unknown> = { ...data };
  if (payload.priority == null || String(payload.priority).trim() === '') {
    delete payload.priority;
  }
  if (Array.isArray(payload.mentionUserIds)) {
    const ids = payload.mentionUserIds.filter((id) => typeof id === 'string' && id.trim());
    if (ids.length === 0) {
      delete payload.mentionUserIds;
    } else if (ids.length === 1 && !payload.mentionUserId) {
      payload.mentionUserId = ids[0];
    }
  }
  const fileCount = files?.length ?? 0;
  if (fileCount > 0 && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.info('[Chatter] Uploading post with files:', files!.map((f) => `${f.name} (${f.type}, ${f.size}b)`));
  }
  if (linkAttachments?.length) {
    payload.linkAttachmentsJson = JSON.stringify(
      linkAttachments.map((link) => ({
        url: link.url,
        displayName: link.name,
        platform: link.platformLabel,
      })),
    );
  }

  if (files && files.length > 0) {
    const invalid = files.filter((f) => !f?.size);
    if (invalid.length > 0) {
      return Promise.reject(
        new Error(`Cannot upload empty file(s): ${invalid.map((f) => f.name).join(', ')}`),
      );
    }

    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (key === 'mentionUserIds' && Array.isArray(value)) {
        formData.append(key, JSON.stringify(value));
        return;
      }
      formData.append(key, String(value));
    });
    files.forEach((file) => {
      // Preserve filename and binary Blob; never stringify File objects.
      formData.append('files', file, file.name);
    });
    console.info('[Chatter] FormData created:', [...formData.keys()].join(', '));
    console.info('[Chatter] Request sent: POST /chatter-posts');
    return apiClient.post<ChatterPostDto>('/chatter-posts', formData);
  }
  return apiClient.post<ChatterPostDto>('/chatter-posts', payload);
}

export function updateChatterPost(id: string, data: { message?: string; title?: string }) {
  return apiClient.patch<ChatterPostDto>(`/chatter-posts/${encodeURIComponent(id)}`, data);
}

export function deleteChatterPost(id: string) {
  return apiClient.delete<void>(`/chatter-posts/${encodeURIComponent(id)}`);
}

export function updateChatterComment(postId: string, commentId: string, message: string) {
  return apiClient.patch<ChatterCommentDto>(
    `/chatter-posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    { message },
  );
}

export function deleteChatterComment(postId: string, commentId: string) {
  return apiClient.delete<void>(
    `/chatter-posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
  );
}

export function likeChatterPost(id: string) {
  return apiClient.post<{ likeCount: number; liked: boolean }>(
    `/chatter-posts/${encodeURIComponent(id)}/like`,
    {},
  );
}

export type ChatterPostSeenUpdate = {
  postId: string;
  seenByCount: number;
  seenByUsers: ChatterMentionedUserDto[];
};

export function markChatterPostsSeen(postIds: string[]) {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (!ids.length) {
    return Promise.resolve({ updates: [] as ChatterPostSeenUpdate[] });
  }
  return apiClient.post<{ updates: ChatterPostSeenUpdate[] }>('/chatter-posts/seen', { postIds: ids });
}
