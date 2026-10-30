import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorDetail } from '../../api/client';
import { adminCancelWaitlist, listAdminWaitlist, type WaitlistRow } from '../../api/wallet';
import { ReasonModal } from '../../components/admin/wallet/ReasonModal';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  SkeletonRows,
  useToast,
  type BadgeTone,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';

const TONE: Record<WaitlistRow['status'], BadgeTone> = {
  waiting: 'info',
  offered: 'warning',
  booked: 'success',
  cancelled: 'neutral',
  expired: 'neutral',
};
const FILTERS = [
  { value: '', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'offered', label: 'Offered' },
  { value: 'booked', label: 'Booked' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

/** Admin: everyone waiting for a slot, in the order they joined. */
export default function AdminWaitlistPage() {
  useDocumentTitle('Waitlist');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const rows = useQuery({
    queryKey: ['w-waitlist', status],
    queryFn: () => listAdminWaitlist(status || undefined),
  });
  const [removing, setRemoving] = useState<WaitlistRow | null>(null);
  const [problem, setProblem] = useState('');
  const remove = useMutation({
    mutationFn: (v: { id: string; reason: string }) => adminCancelWaitlist(v.id, v.reason),
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['w-waitlist'] });
      toast.show({ tone: 'success', title: 'Removed from the waitlist' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not remove.'),
  });
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Waitlist"
        description="When a booking is cancelled or moved, the first matching person is offered the slot for a short time. Change the hold time in Settings."
      />
      <FilterChips
        label="Filter by state"
        options={FILTERS}
        value={status}
        onChange={(v) => setStatus(v)}
      />
      <Card variant="dense" as="section" aria-label="Waitlist">
        {rows.isPending ? (
          <SkeletonRows count={3} label="Loading the waitlist…" />
        ) : rows.isError ? (
          <ErrorState
            description="We couldn't load the waitlist."
            onRetry={() => void rows.refetch()}
          />
        ) : rows.data.length === 0 ? (
          <EmptyState
            title="Nobody here"
            description="Customers who join a waitlist appear here."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {rows.data.map((r) => (
              <li key={r.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-semibold text-text">{r.customer_name}</p>
                  <Badge tone={TONE[r.status]}>{r.status_label}</Badge>
                  <span className="text-sm text-text-muted">
                    {r.service_name} · {r.stylist_name}
                  </span>
                </div>
                <p className="mt-xs text-xs text-text-muted">
                  {formatDateTime(r.window_start)} to {formatDateTime(r.window_end)}
                  {r.note ? ` · ${r.note}` : ''}
                </p>
                {r.offer && (
                  <p className="mt-xs text-sm text-warning-text">
                    Offered {formatDateTime(r.offer.start)} with {r.offer.stylist_name}; answer by{' '}
                    {formatDateTime(r.offer.expires_at)}.
                  </p>
                )}
                {(r.status === 'waiting' || r.status === 'offered') && (
                  <div className="mt-sm">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setProblem('');
                        setRemoving(r);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {removing && (
        <ReasonModal
          title={`Remove ${removing.customer_name}`}
          description="They are taken off the waitlist and any open offer is withdrawn."
          confirmLabel="Remove"
          busy={remove.isPending}
          problem={problem}
          onClose={() => setRemoving(null)}
          onConfirm={(reason) => remove.mutate({ id: removing.id, reason })}
        />
      )}
    </div>
  );
}
