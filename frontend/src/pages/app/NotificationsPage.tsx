import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listNotifications, markNotificationsRead } from '../../api/notifications';
import { PageHeader } from '../../components/layout/PageContainer';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';

/** Every notification for the signed-in person (the bell shows only the latest few). */
export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['notifications'], queryFn: listNotifications });
  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = list.data?.unread ?? 0;
  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader
        title="Notifications"
        description="Messages about your visits, payments and account."
        actions={
          unread > 0 ? (
            <Button
              variant="secondary"
              onClick={() => markRead.mutate()}
              disabled={markRead.isPending}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      {list.isPending ? (
        <LoadingState label="Loading notifications…" />
      ) : list.isError ? (
        <ErrorState
          title="We couldn’t load your notifications"
          onRetry={() => void list.refetch()}
        />
      ) : list.data.results.length === 0 ? (
        <EmptyState
          title="Nothing new"
          description="When something needs your attention it will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-sm">
          {list.data.results.map((item) => {
            const body = (
              <>
                <span className={cn('block text-base text-text', !item.read_at && 'font-semibold')}>
                  {item.title}
                </span>
                {item.body && <span className="block text-sm text-text-muted">{item.body}</span>}
                <span className="block text-xs text-text-muted">
                  {formatDateTime(item.created_at)}
                </span>
              </>
            );
            return (
              <li key={item.id}>
                <Card variant="dense" className="p-0">
                  {item.link.startsWith('/') ? (
                    <Link
                      to={item.link}
                      className="block rounded-card p-md hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="p-md">{body}</div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
