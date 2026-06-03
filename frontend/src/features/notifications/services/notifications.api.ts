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

export function listNotifications(limit = 30) {
  return apiClient.get<NotificationDto[]>(`/notifications?limit=${limit}`);
}

export function getUnreadNotificationCount() {
  return apiClient.get<number>('/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return apiClient.patch(`/notifications/${encodeURIComponent(id)}/read`, {});
}

export function markAllNotificationsRead() {
  return apiClient.post('/notifications/read-all', {});
}
