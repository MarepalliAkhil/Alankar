import { api } from './client';

/**
 * The free deployment (docs/DEPLOY_FREE.md): the site is on Vercel and the backend on Render.
 * WebSockets cannot go through Vercel's rewrite, so the browser connects to Render directly
 * (VITE_WS_ORIGIN, e.g. wss://alankar-api.onrender.com). The session cookie belongs to the Vercel
 * address and is not sent there, so the page first asks for a single-use ticket (valid 30 seconds)
 * through the normal /api rewrite, and puts it in the socket address. Every reconnect fetches a new
 * ticket. Without VITE_WS_ORIGIN (local, Docker, Azure) nothing changes: same-origin socket with the
 * cookie.
 */
export function wsOrigin(): string {
  return (import.meta.env.VITE_WS_ORIGIN ?? '').trim().replace(/\/+$/, '');
}

/** A socket address on the Render host for any /api/ws/... path, with a fresh ticket. */
export async function ticketSocketPath(path: string, origin: string): Promise<string> {
  const { data } = await api.get<{ ticket: string }>('/ws-ticket/');
  return `${origin}${path}?ticket=${encodeURIComponent(data.ticket)}`;
}

export function ticketSocketUrl(threadId: string, origin: string): Promise<string> {
  return ticketSocketPath(`/api/ws/chat/${threadId}/`, origin);
}
