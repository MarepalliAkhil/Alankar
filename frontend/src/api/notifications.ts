import { api } from './client';

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  created_at: string;
  read_at: string | null;
}

export interface NotificationList {
  unread: number;
  results: AppNotification[];
}

export async function listNotifications(): Promise<NotificationList> {
  const { data } = await api.get<NotificationList>('/notifications/');
  return data;
}

export async function markNotificationsRead(ids?: string[]): Promise<{ unread: number }> {
  const { data } = await api.post<{ unread: number }>('/notifications/read/', ids ? { ids } : {});
  return data;
}
