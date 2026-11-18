import { ticketSocketPath, wsOrigin } from './wsTicket';

/** A short note about a new Zen Chat message for me (backend chat/inbox.py). */
export interface ChatNote {
  type: 'chat';
  thread: string;
  message: string;
  sender: string;
  preview: string;
  kind: 'text' | 'image';
}

const PATH = '/api/ws/inbox/';
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];
const CLOSE_FORBIDDEN = 4403;

function sameOriginUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
  const path = `${base.replace(/\/$/, '')}/ws/inbox/`;
  if (/^https?:/.test(path)) return path.replace(/^http/, 'ws');
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

/**
 * Keeps my personal pop-up connection open (/api/ws/inbox/) and calls `onNote` for every new
 * message addressed to me. Reconnects with backoff; on the free deployment every (re)connect uses
 * a fresh single-use ticket (src/api/wsTicket.ts). Returns a function that closes it for good.
 */
export function openInbox(onNote: (note: ChatNote) => void): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  const retry = () => {
    if (closed) return;
    const wait = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
    attempts += 1;
    timer = setTimeout(connect, wait);
  };

  const open = (url: string) => {
    const ws = new WebSocket(url);
    socket = ws;
    ws.onmessage = (event) => {
      let frame: Partial<Omit<ChatNote, 'type'>> & { type?: string };
      try {
        frame = JSON.parse(String(event.data)) as typeof frame;
      } catch {
        return;
      }
      if (frame.type === 'ready') attempts = 0;
      else if (frame.type === 'chat' && frame.thread) onNote(frame as ChatNote);
    };
    ws.onclose = (event) => {
      socket = null;
      if (closed || event.code === CLOSE_FORBIDDEN || event.code === 1008) return;
      retry();
    };
  };

  const connect = () => {
    if (closed) return;
    const origin = wsOrigin();
    if (!origin) {
      open(sameOriginUrl());
      return;
    }
    ticketSocketPath(PATH, origin).then(
      (url) => {
        if (!closed) open(url);
      },
      () => retry(),
    );
  };

  connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}
