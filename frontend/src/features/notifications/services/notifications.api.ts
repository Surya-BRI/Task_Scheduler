import { apiClient } from '@/lib/api-client';

export type NotificationDto = {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
};

export type NotificationsListResponse = {
  data: NotificationDto[];
  unreadCount: number;
};

function normalizeNotificationsList(res: unknown): NotificationsListResponse {
  if (Array.isArray(res)) {
    const data = res as NotificationDto[];
    return {
      data,
      unreadCount: data.filter((n) => !n.isRead).length,
    };
  }
  const obj = (res ?? {}) as { data?: NotificationDto[]; unreadCount?: number };
  const data = Array.isArray(obj.data) ? obj.data : [];
  const unreadCount =
    typeof obj.unreadCount === 'number'
      ? obj.unreadCount
      : data.filter((n) => !n.isRead).length;
  return { data, unreadCount };
}

/** Single call: recent notifications + total unread badge count. */
export async function listNotifications(limit = 30): Promise<NotificationsListResponse> {
  const res = await apiClient.get<NotificationsListResponse | NotificationDto[]>(
    `/notifications?limit=${limit}`,
  );
  return normalizeNotificationsList(res);
}

/** @deprecated Prefer listNotifications().unreadCount — kept for rare callers. */
export function getUnreadNotificationCount() {
  return apiClient.get<number>('/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return apiClient.patch(`/notifications/${encodeURIComponent(id)}/read`, {});
}

export function markNotificationUnread(id: string) {
  return apiClient.patch(`/notifications/${encodeURIComponent(id)}/unread`, {});
}

export function markAllNotificationsRead() {
  return apiClient.post('/notifications/read-all', {});
}
