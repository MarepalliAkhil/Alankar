import { api } from './client';

export type MessageStatus = 'sent' | 'delivered' | 'read';

export type PhotoTag = 'style_reference' | 'current_hair' | 'other';

/** What the screen needs to draw a photo message. Ids and sizes only: the picture itself is
 *  fetched through the signed-in endpoints below (never a public URL). */
export interface ChatPhoto {
  id: string;
  tag: PhotoTag;
  tag_label: string;
  width: number;
  height: number;
  deleted: boolean;
  alt: string;
}

export interface PhotoReference {
  image_id: string;
  message_id: string;
  created_at: string;
  alt: string;
  width: number;
  height: number;
}

export interface PhotoRules {
  max_bytes: number;
  max_side: number;
  max_caption: number;
  per_minute: number;
  per_day: number;
  tags: { key: PhotoTag; label: string }[];
}

export interface ChatMessage {
  id: string;
  thread: string;
  mine: boolean;
  kind?: 'text' | 'image';
  text: string;
  image?: ChatPhoto | null;
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
  photo?: PhotoRules;
  /** The latest "Style reference" photos for the visit. */
  references?: PhotoReference[];
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

export interface SendPhotoInput {
  file: File;
  tag: PhotoTag;
  caption: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export async function sendPhoto(id: string, input: SendPhotoInput): Promise<ChatMessage> {
  const form = new FormData();
  form.append('image', input.file);
  form.append('tag', input.tag);
  if (input.caption.trim()) form.append('caption', input.caption.trim());
  const { data } = await api.post<ChatMessage>(`/chat/threads/${id}/images/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90000,
    signal: input.signal,
    onUploadProgress: (event) => {
      if (event.total) input.onProgress?.(Math.round((event.loaded / event.total) * 100));
    },
  });
  return data;
}

export async function deletePhoto(id: string, imageId: string): Promise<void> {
  await api.delete(`/chat/threads/${id}/images/${imageId}/`);
}

/** Where a photo is fetched from: a signed-in, membership-checked endpoint (cookies go along). */
export function photoUrl(threadId: string, imageId: string, part: 'full' | 'thumb'): string {
  const base = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api').replace(
    /\/$/,
    '',
  );
  return `${base}/chat/threads/${threadId}/images/${imageId}/${part === 'thumb' ? 'thumbnail/' : ''}`;
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
