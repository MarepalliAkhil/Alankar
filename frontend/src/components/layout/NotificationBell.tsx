import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listNotifications,
  markNotificationsRead,
  type AppNotification,
} from '../../api/notifications';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../lib/cn';

export interface NotificationBellProps {
  className?: string;
  /** Where "See all notifications" leads (a different page for customers and staff). */
  listPath: string;
}

/**
 * In-app notifications: ONE icon button that floats in the top-right corner of the page (the only
 * control outside the sidebar menu). Icon only, with an unread count badge; its name carries the
 * count. A small panel opens under it with the latest items, "Mark all as read" and a link to the
 * full list.
 */
export function NotificationBell({ className, listPath }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: listNotifications,
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = list.data?.unread ?? 0;
  const items = (list.data?.results ?? []).slice(0, 8);
  // Icon only: no visible text, so the name is free to say "Notifications" and the count.
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        data-tour="notifications"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="glass-button relative inline-flex h-10 w-10 items-center justify-center rounded-full text-text focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unread > 0 && (
          <span
            data-testid="bell-count"
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-hover px-1 text-xs font-semibold text-on-primary"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          className="glass-photo absolute right-0 top-12 z-overlay w-80 max-w-[calc(100vw-2rem)] rounded-card p-sm shadow-raised"
        >
          <div className="flex items-center justify-between px-sm py-1">
            <h2 className="text-sm font-semibold text-text">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                className="rounded text-xs font-medium text-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
                onClick={() => markRead.mutate()}
              >
                Mark all as read
              </button>
            )}
          </div>
          {list.isError ? (
            <p className="px-sm py-md text-sm text-text-muted">We couldn&apos;t load these.</p>
          ) : items.length === 0 ? (
            <p className="px-sm py-md text-sm text-text-muted">Nothing new.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Item item={item} onNavigate={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
          <Link
            to={listPath}
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-nested px-sm py-2 text-center text-sm font-medium text-primary-hover hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
          >
            See all notifications
          </Link>
        </section>
      )}
    </div>
  );
}

function Item({ item, onNavigate }: { item: AppNotification; onNavigate: () => void }) {
  const body = (
    <>
      <span className={cn('block text-sm text-text', !item.read_at && 'font-semibold')}>
        {item.title}
      </span>
      {item.body && <span className="block text-xs text-text-muted">{item.body}</span>}
      <span className="block text-xs text-text-muted">{formatDateTime(item.created_at)}</span>
    </>
  );
  const cls =
    'block rounded-nested px-sm py-sm hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none';
  return item.link.startsWith('/') ? (
    <Link to={item.link} className={cls} onClick={onNavigate}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
