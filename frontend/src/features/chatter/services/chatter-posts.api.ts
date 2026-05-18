import { apiClient } from '@/lib/api-client';

export type ChatterCommentDto = {
  id: string;
  postId: string | null;
  authorId: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  message: string;
  createdAt: string;
};

export type ChatterPostDto = {
  id: string;
  taskId: string | null;
  authorId: string | null;
  authorName?: string | null;
  authorRole?: string | null;
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
  comments?: ChatterCommentDto[];
};

/** Shape expected by `ChatterScreen` / `ChatterCard` for the main feed */
export type ChatterFeedPost = {
  id: string;
  title: string;
  author: string;
  time: string;
  mention: string;
  message: string;
  projectName: string;
  responsibleUser: string;
  priority: 'low' | 'medium' | 'high';
  seenBy: number;
  comments: Array<{ id: string; message: string; author: string; createdAt: string }>;
  updatedAt: string;
  postType?: string;
  attachment?: File | null;
  taskId?: string | null;
};

function shortId(value: string | null | undefined, max = 12): string {
  if (value == null || !String(value).trim()) return '—';
  const t = String(value).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function normalizePriority(p: string | number | null | undefined): 'low' | 'medium' | 'high' {
  if (p == null) return 'medium';
  const s = String(p).trim().toLowerCase();
  if (s === 'high' || s === 'urgent' || s === '3' || s === 'critical') return 'high';
  if (s === 'low' || s === '1' || s === 'minor') return 'low';
  if (s === 'medium' || s === '2' || s === 'normal') return 'medium';
  const n = Number(p);
  if (n === 1) return 'low';
  if (n === 3) return 'high';
  return 'medium';
}

function formatChatterTime(value: Date | string | null | undefined): string {
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
  return t;
}

export function mapCommentDtoToFeedComment(
  dto: ChatterCommentDto,
  currentUserId?: string | null,
): { id: string; message: string; author: string; authorId: string | null; createdAt: string } {
  const full = dto.authorName?.trim();
  const role = dto.authorRole?.trim();
  const pretty = full ? `${full}${role ? ` (${role})` : ''}` : null;
  const authorLabel =
    dto.authorId && currentUserId && dto.authorId === currentUserId
      ? 'You'
      : pretty ?? (dto.authorId ? `User ${shortId(dto.authorId, 14)}` : 'Unknown');
  return {
    id: dto.id,
    message: dto.message || '',
    author: authorLabel,
    authorId: dto.authorId,
    createdAt: dto.createdAt,
  };
}

export function mapChatterPostDtoToFeedPost(
  dto: ChatterPostDto,
  currentUserId?: string | null,
): ChatterFeedPost {
  const created = dto.createdAt ? new Date(dto.createdAt) : null;
  const full = dto.authorName?.trim();
  const role = dto.authorRole?.trim();
  const authorLabel = full ? `${full}${role ? ` (${role})` : ''}` : (dto.authorId ? `User ${shortId(dto.authorId, 14)}` : 'Unknown');
  const mention =
    dto.mentionUserId != null && String(dto.mentionUserId).trim()
      ? `@${shortId(dto.mentionUserId, 18)}`
      : '—';

  const rawType = (dto.postType ?? '').trim();
  const lower = rawType.toLowerCase();
  const isGenericPosts = !rawType || lower === 'posts' || lower === 'post';

  const base: ChatterFeedPost = {
    id: dto.id,
    title: dto.title || '(No title)',
    author: authorLabel,
    time: formatChatterTime(created),
    mention,
    message: dto.message || '',
    projectName: dto.taskId ? `Task ${shortId(dto.taskId, 40)}` : dto.title || '—',
    responsibleUser: authorLabel,
    priority: normalizePriority(dto.priority),
    seenBy: dto.seenByCount,
    comments: (dto.comments ?? []).map((c) => mapCommentDtoToFeedComment(c, currentUserId)),
    updatedAt: dto.updatedAt || dto.createdAt || new Date(0).toISOString(),
    taskId: dto.taskId,
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

export function listChatterMentionUsers() {
  return apiClient.get<ChatterMentionUser[]>('/chatter-posts/mention-users');
}

export function listChatterPosts(params?: { limit?: number; taskId?: string; projectId?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.taskId?.trim()) qs.set('taskId', params.taskId.trim());
  if (params?.projectId?.trim()) qs.set('projectId', params.projectId.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient.get<ChatterPostDto[]>(`/chatter-posts${suffix}`);
}

export function listChatterComments(postId: string) {
  return apiClient.get<ChatterCommentDto[]>(`/chatter-posts/${encodeURIComponent(postId)}/comments`);
}

export function createChatterComment(postId: string, message: string) {
  return apiClient.post<ChatterCommentDto>(`/chatter-posts/${encodeURIComponent(postId)}/comments`, {
    message,
  });
}

export function createChatterPost(data: Partial<ChatterPostDto>, files?: File[]) {
  if (files && files.length > 0) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    files.forEach(file => {
      formData.append('files', file);
    });
    return apiClient.post<ChatterPostDto>('/chatter-posts', formData);
  }
  return apiClient.post<ChatterPostDto>('/chatter-posts', data);
}
