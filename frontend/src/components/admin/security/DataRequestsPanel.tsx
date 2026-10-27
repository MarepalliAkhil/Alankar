import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorDetail } from '../../../api/client';
import {
  decideDataRequest,
  listDataRequests,
  type AdminDataRequest,
  type RequestStatus,
} from '../../../api/security';
import { formatDateTime } from '../../../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Textarea,
  useToast,
  type BadgeTone,
} from '../../ui';

const TONE: Record<RequestStatus, BadgeTone> = {
  pending: 'warning',
  completed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
};
const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  completed: 'Done',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

type Pending = { request: AdminDataRequest; decision: 'complete' | 'decline' };

/** Customers ask for their data or for their account to be deleted. The admin decides. */
export function DataRequestsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ['data-requests'], queryFn: listDataRequests });
  const [asking, setAsking] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const decide = useMutation({
    mutationFn: (p: Pending) => decideDataRequest(p.request.id, p.decision, note),
    onSuccess: (_row, p) => {
      void queryClient.invalidateQueries({ queryKey: ['data-requests'] });
      toast.show({
        tone: 'success',
        title: p.decision === 'complete' ? 'Request completed' : 'Request declined',
      });
      setAsking(null);
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Please try again.'),
  });

  const open = (request: AdminDataRequest, decision: 'complete' | 'decline') => {
    setNote('');
    setProblem('');
    setAsking({ request, decision });
  };

  if (requests.isPending) return <LoadingState label="Loading data requests…" />;
  if (requests.isError)
    return (
      <ErrorState
        description="We couldn't load data requests."
        onRetry={() => void requests.refetch()}
      />
    );
  if (requests.data.length === 0)
    return (
      <EmptyState title="No data requests" description="Customers ask from their Profile page." />
    );

  const target = asking?.request;
  return (
    <>
      <ul className="flex flex-col gap-sm">
        {requests.data.map((r) => (
          <li key={r.id}>
            <Card variant="dense">
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div>
                  <p className="font-medium text-text">
                    {r.kind === 'export' ? 'Download my data' : 'Delete my account'} ·{' '}
                    {r.customer_label}
                  </p>
                  <p className="text-sm text-text-muted">
                    {r.customer_email ? `${r.customer_email} · ` : ''}asked{' '}
                    {formatDateTime(r.created_at)}
                  </p>
                  {r.decided_at && (
                    <p className="text-sm text-text-muted">
                      Decided {formatDateTime(r.decided_at)}
                      {r.decided_by_email ? ` by ${r.decided_by_email}` : ''}
                      {r.decision_note ? ` · ${r.decision_note}` : ''}
                    </p>
                  )}
                  {r.blockers.map((b) => (
                    <p key={b} className="text-sm font-medium text-warning-text">
                      {b}
                    </p>
                  ))}
                </div>
                <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </div>
              {r.status === 'pending' && (
                <div className="mt-sm flex flex-wrap gap-sm">
                  <Button type="button" size="sm" onClick={() => open(r, 'complete')}>
                    {r.kind === 'export' ? 'Approve download' : 'Delete the account'}
                    <span className="sr-only"> for {r.customer_label}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => open(r, 'decline')}
                  >
                    Decline<span className="sr-only"> {r.customer_label}</span>
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <Modal
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={
          asking?.decision === 'decline'
            ? 'Decline this request'
            : target?.kind === 'delete'
              ? 'Delete this account?'
              : 'Approve this download'
        }
        description={
          asking?.decision === 'complete' && target?.kind === 'delete'
            ? 'The name, email, phone, allergies, notes and chats are removed for good. Invoices and amounts stay, under the name “Deleted customer”.'
            : asking?.decision === 'complete'
              ? 'The customer can download their data for 7 days.'
              : 'The customer sees your reason.'
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={decide.isPending}
              onClick={() => asking && decide.mutate(asking)}
            >
              {asking?.decision === 'decline' ? 'Decline' : 'Confirm'}
            </Button>
          </>
        }
      >
        <Textarea
          label={asking?.decision === 'decline' ? 'Reason' : 'Note (optional)'}
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />
        {problem && (
          <p role="alert" className="mt-sm text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </Modal>
    </>
  );
}
