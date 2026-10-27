import { api } from './client';

export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  thread: string;
  mine: boolean;
  text: string;
  created_at: string;
  status: MessageStatus;
  service: string;
  /** Set on a message the screen has not heard back from the server about yet. */
  pending?: boolean;
  failed?: boolean;
  client_id?: string;
}

export interface ThreadCard {
  id: string;
  other: { name: string; photo_url: string; title: string };
  appointment: { service_name: string; start: string | null; status: string } | null;
  last_message: { preview: string; created_at: string; mine: boolean } | null;
  unread: number;
  open: boolean;
  closes_at: string | null;
}

export interface ThreadHistory {
  thread: ThreadCard;
  open: boolean;
  closes_at: string | null;
  max_length: number;
  messages: ChatMessage[];
}

export async function listThreads(): Promise<ThreadCard[]> {
  const { data } = await api.get<{ results: ThreadCard[] }>('/chat/threads/');
  return data.results;
}

export async function getHistory(id: string): Promise<ThreadHistory> {
  const { data } = await api.get<ThreadHistory>(`/chat/threads/${id}/messages/`);
  return data;
}

export async function sendViaRest(id: string, text: string): Promise<ChatMessage> {
  const { data } = await api.post<ChatMessage>(`/chat/threads/${id}/messages/`, { text });
  return data;
}

export async function markRead(id: string): Promise<void> {
  await api.post(`/chat/threads/${id}/read/`);
}

/** The live connection lives under /api/ so the httpOnly sign-in cookie is sent with it. */
export function socketUrl(id: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
  const path = `${base.replace(/\/$/, '')}/ws/chat/${id}/`;
  if (/^https?:/.test(path)) return path.replace(/^http/, 'ws');
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}
