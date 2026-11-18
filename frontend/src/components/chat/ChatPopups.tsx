import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { openInbox, type ChatNote } from '../../api/inbox';
import { useToast } from '../ui/toast-context';
import { chatPathFor } from './chat-path';

/**
 * Zen Chat pop-ups on every signed-in page (customers and stylists only): when a message for me
 * arrives, a toast shows who sent it and a short preview, with "Open chat". Nothing is shown
 * while I am already looking at that conversation. Renders nothing itself.
 */
export function ChatPopups({ role }: { role: 'customer' | 'stylist' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  // Refs, so moving between pages never reopens the connection.
  const here = useRef(pathname);
  const latest = useRef({ toast, navigate, queryClient });
  useEffect(() => {
    here.current = pathname;
    latest.current = { toast, navigate, queryClient };
  });

  useEffect(
    () =>
      openInbox((note: ChatNote) => {
        const { toast: t, navigate: go, queryClient: qc } = latest.current;
        void qc.invalidateQueries({ queryKey: ['chat'] });
        const target = chatPathFor(role, note.thread);
        if (here.current === target) return;
        t.show({
          title: `New message from ${note.sender}`,
          description: note.preview || undefined,
          tone: 'info',
          durationMs: 8000,
          action: { label: 'Open chat', onClick: () => go(target) },
        });
      }),
    [role],
  );

  return null;
}
