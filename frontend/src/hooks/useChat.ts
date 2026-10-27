import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getHistory,
  markRead,
  sendViaRest,
  socketUrl,
  type ChatMessage,
  type ThreadHistory,
} from '../api/chat';

export type Connection = 'connecting' | 'live' | 'offline';

type Frame =
  | { type: 'ready' }
  | { type: 'message'; message: ChatMessage & { client_id?: string } }
  | { type: 'status'; ids: string[]; status: ChatMessage['status'] }
  | { type: 'typing'; on: boolean }
  | { type: 'error'; code: string; detail: string; client_id?: string };

const RANK = { sent: 0, delivered: 1, read: 2 } as const;
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000];

/** Keeps one conversation live: history over REST, new messages over the WebSocket, automatic
 *  reconnect with backoff (missed messages are re-fetched), REST fallback while offline. */
export function useChat(threadId: string) {
  const [history, setHistory] = useState<ThreadHistory | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [typing, setTyping] = useState(false);
  const [problem, setProblem] = useState('');
  const [loadError, setLoadError] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const attempts = useRef(0);
  const closed = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((now) => {
      const byId = new Map(now.filter((m) => !m.pending).map((m) => [m.id, m]));
      for (const m of incoming) {
        const old = byId.get(m.id);
        byId.set(m.id, old && RANK[old.status] > RANK[m.status] ? { ...m, status: old.status } : m);
      }
      const pending = now.filter(
        (m) => m.pending && !incoming.some((i) => i.client_id === m.client_id && m.client_id),
      );
      return [...byId.values(), ...pending].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await getHistory(threadId);
      setHistory(data);
      merge(data.messages);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [threadId, merge]);

  useEffect(() => {
    closed.current = false;
    void load();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed.current) return;
      setConnection('connecting');
      const ws = new WebSocket(socketUrl(threadId));
      socket.current = ws;
      ws.onmessage = (event) => {
        let frame: Frame;
        try {
          frame = JSON.parse(String(event.data)) as Frame;
        } catch {
          return;
        }
        if (frame.type === 'ready') {
          attempts.current = 0;
          setConnection('live');
          void load(); // anything missed while we were away
        } else if (frame.type === 'message') {
          const m = frame.message;
          setMessages((now) => now.filter((x) => !(x.pending && x.client_id === m.client_id)));
          merge([m]);
          if (!m.mine) setTyping(false);
        } else if (frame.type === 'status') {
          setMessages((now) =>
            now.map((m) =>
              frame.ids.includes(m.id) && RANK[frame.status] > RANK[m.status]
                ? { ...m, status: frame.status }
                : m,
            ),
          );
        } else if (frame.type === 'typing') {
          setTyping(frame.on);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          if (frame.on) typingTimer.current = setTimeout(() => setTyping(false), 4000);
        } else if (frame.type === 'error') {
          setProblem(frame.detail);
          setMessages((now) =>
            now.map((m) =>
              m.pending && m.client_id === frame.client_id
                ? { ...m, pending: false, failed: true }
                : m,
            ),
          );
        }
      };
      ws.onclose = (event) => {
        socket.current = null;
        setTyping(false);
        if (closed.current) return;
        setConnection('offline');
        if (event.code === 4403 || event.code === 1008) return; // not allowed: do not hammer
        const wait = BACKOFF_MS[Math.min(attempts.current, BACKOFF_MS.length - 1)];
        attempts.current += 1;
        retryTimer = setTimeout(connect, wait);
      };
    };
    connect();

    return () => {
      closed.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      socket.current?.close();
    };
  }, [threadId, load, merge]);

  const send = useCallback(
    async (text: string) => {
      setProblem('');
      const client_id = `c${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      const draft: ChatMessage = {
        id: client_id,
        client_id,
        thread: threadId,
        mine: true,
        text,
        created_at: new Date().toISOString(),
        status: 'sent',
        service: '',
        pending: true,
      };
      setMessages((now) => [...now, draft]);
      const ws = socket.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', text, client_id }));
        return;
      }
      try {
        const saved = await sendViaRest(threadId, text);
        setMessages((now) => now.filter((m) => m.client_id !== client_id));
        merge([saved]);
      } catch {
        setMessages((now) =>
          now.map((m) => (m.client_id === client_id ? { ...m, pending: false, failed: true } : m)),
        );
        setProblem('We could not send that message. Check your connection and try again.');
      }
    },
    [threadId, merge],
  );

  const signalTyping = useCallback((on: boolean) => {
    const ws = socket.current;
    const now = Date.now();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (on && now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    ws.send(JSON.stringify({ type: 'typing', on }));
  }, []);

  const read = useCallback(() => {
    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'read' }));
    else void markRead(threadId).catch(() => undefined);
    setMessages((now) => now.map((m) => (m.mine ? m : { ...m, status: 'read' })));
  }, [threadId]);

  return {
    history,
    messages,
    connection,
    typing,
    problem,
    loadError,
    send,
    signalTyping,
    read,
    reload: load,
  };
}
