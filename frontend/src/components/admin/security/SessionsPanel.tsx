import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorDetail } from '../../../api/client';
import { listSessions, revokeSession, type StaffSession } from '../../../api/security';
import { formatDateTime } from '../../../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  useToast,
  type Column,
} from '../../ui';

/** Signed-in staff. "Sign out this session" ends one person's session from here. */
export function SessionsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['staff-sessions'], queryFn: listSessions });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-sessions'] });
      toast.show({ tone: 'success', title: 'Session signed out' });
    },
    onError: (error) =>
      toast.show({ tone: 'danger', title: 'Could not sign out', description: errorDetail(error) }),
  });

  if (sessions.isPending) return <LoadingState label="Loading staff sessions…" />;
  if (sessions.isError)
    return (
      <ErrorState
        description="We couldn't load staff sessions."
        onRetry={() => void sessions.refetch()}
      />
    );
  if (sessions.data.length === 0)
    return <EmptyState title="No staff are signed in" description="Sessions show up here." />;

  const columns: Column<StaffSession>[] = [
    {
      key: 'who',
      header: 'Staff member',
      render: (s) => (
        <span>
          <span className="font-medium text-text">{s.name || s.email}</span>
          <span className="block text-text-muted">{s.email}</span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', render: (s) => <span className="capitalize">{s.role}</span> },
    {
      key: 'since',
      header: 'Signed in',
      render: (s) => (s.signed_in_at ? formatDateTime(s.signed_in_at) : '—'),
    },
    {
      key: 'action',
      header: '',
      render: (s) =>
        s.current ? (
          <Badge tone="primary">This is you</Badge>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={revoke.isPending && revoke.variables === s.id}
            onClick={() => revoke.mutate(s.id)}
          >
            Sign out this session
            <span className="sr-only"> for {s.email}</span>
          </Button>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-sm">
      <Card variant="dense">
        <p className="text-sm text-text-muted">
          A receptionist is signed out at once. Other staff lose access within 15 minutes, when
          their short-lived access expires, and cannot renew it.
        </p>
      </Card>
      <Table
        caption="Signed-in staff sessions"
        columns={columns}
        rows={sessions.data}
        rowKey={(s) => s.id}
      />
    </div>
  );
}
