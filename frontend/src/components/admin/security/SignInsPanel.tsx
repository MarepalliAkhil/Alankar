import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorDetail } from '../../../api/client';
import { getSecurity, unlockEmail } from '../../../api/security';
import { formatDateTime } from '../../../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, useToast } from '../../ui';

/** Failed sign-ins over the last seven days and the accounts that are locked right now. */
export function SignInsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['security'], queryFn: getSecurity });
  const unlock = useMutation({
    mutationFn: (email: string) => unlockEmail(email),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['security'] });
      toast.show({ tone: 'success', title: 'Unlocked' });
    },
    onError: (error) =>
      toast.show({ tone: 'danger', title: 'Could not unlock', description: errorDetail(error) }),
  });

  if (overview.isPending) return <LoadingState label="Loading sign-in activity…" />;
  if (overview.isError)
    return (
      <ErrorState
        description="We couldn't load sign-in activity."
        onRetry={() => void overview.refetch()}
      />
    );
  const data = overview.data;
  return (
    <div className="flex flex-col gap-lg">
      <div className="grid gap-md sm:grid-cols-3">
        <Card variant="dense">
          <p className="text-sm text-text-muted">Failed sign-ins, last 7 days</p>
          <p className="text-2xl font-semibold text-text">{data.failed_7d}</p>
        </Card>
        <Card variant="dense">
          <p className="text-sm text-text-muted">Accounts locked, last 7 days</p>
          <p className="text-2xl font-semibold text-text">{data.lockouts_7d}</p>
        </Card>
        <Card variant="dense">
          <p className="text-sm text-text-muted">Locked right now</p>
          <p className="text-2xl font-semibold text-text">{data.locks.length}</p>
        </Card>
      </div>

      <Card variant="dense" as="section" aria-label="Locked accounts">
        <h2 className="text-lg font-semibold text-text">Locked accounts</h2>
        {data.locks.length === 0 ? (
          <EmptyState
            title="Nobody is locked out"
            description="Locks lift by themselves after 15 minutes."
          />
        ) : (
          <ul className="mt-sm flex flex-col gap-sm">
            {data.locks.map((lock) => (
              <li key={lock.email} className="flex flex-wrap items-center justify-between gap-sm">
                <span>
                  <span className="font-medium text-text">{lock.email}</span>
                  <span className="ml-sm text-sm text-text-muted">
                    until {formatDateTime(lock.locked_until)}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={unlock.isPending && unlock.variables === lock.email}
                  onClick={() => unlock.mutate(lock.email)}
                >
                  Unlock {lock.email}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card variant="dense" as="section" aria-label="Most failed emails">
        <h2 className="text-lg font-semibold text-text">Most failed attempts</h2>
        {data.top_emails.length === 0 ? (
          <p className="mt-sm text-sm text-text-muted">No failed sign-ins this week.</p>
        ) : (
          <ul className="mt-sm flex flex-col gap-xs">
            {data.top_emails.map((row) => (
              <li key={row.email} className="flex items-center justify-between gap-sm">
                <span className="text-text">{row.email}</span>
                <Badge tone={row.count >= 5 ? 'danger' : 'warning'}>{row.count} failed</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card variant="dense" as="section" aria-label="Recent failures">
        <h2 className="text-lg font-semibold text-text">Recent failed sign-ins</h2>
        {data.recent_failures.length === 0 ? (
          <p className="mt-sm text-sm text-text-muted">Nothing to show.</p>
        ) : (
          <ul className="mt-sm flex flex-col gap-xs text-sm">
            {data.recent_failures.map((f, i) => (
              <li key={`${f.email}-${f.at}-${i}`} className="flex flex-wrap gap-sm">
                <span className="text-text-muted">{formatDateTime(f.at)}</span>
                <span className="text-text">{f.email}</span>
                <span className="text-text-muted">{f.ip_address ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
