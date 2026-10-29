import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorDetail } from '../../api/client';
import {
  approvePackageCancelRequest,
  listPackageCancelRequests,
  rejectPackageCancelRequest,
  type PackageCancelRequestRow,
} from '../../api/wallet';
import { ReasonModal } from '../../components/admin/wallet/ReasonModal';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

function stateOf(req: PackageCancelRequestRow): {
  label: string;
  tone: 'success' | 'neutral' | 'warning';
} {
  if (req.status === 'approved') return { label: 'Approved', tone: 'success' };
  if (req.status === 'rejected') return { label: 'Rejected', tone: 'neutral' };
  return { label: 'Pending', tone: 'warning' };
}

/** Admin: customers' requests to cancel a package for a pro-rata refund. Approve it as estimated,
 * at a different amount, or reject it with a reason. */
export default function PackageRequestsPage() {
  useDocumentTitle('Package Requests');
  const toast = useToast();
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ['w-package-cancel-requests'],
    queryFn: listPackageCancelRequests,
  });
  const [approving, setApproving] = useState<PackageCancelRequestRow | null>(null);
  const [rejecting, setRejecting] = useState<PackageCancelRequestRow | null>(null);
  const [problem, setProblem] = useState('');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['w-package-cancel-requests'] });
  };
  const approve = useMutation({
    mutationFn: (v: {
      id: string;
      method: 'cash' | 'card' | 'upi';
      amount?: string;
      reason: string;
    }) =>
      approvePackageCancelRequest(v.id, { method: v.method, amount: v.amount, reason: v.reason }),
    onSuccess: () => {
      setApproving(null);
      refresh();
      toast.show({ tone: 'success', title: 'Cancellation approved' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not approve this request.'),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) => rejectPackageCancelRequest(v.id, v.reason),
    onSuccess: () => {
      setRejecting(null);
      refresh();
      toast.show({ tone: 'success', title: 'Cancellation rejected' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not reject this request.'),
  });
  const pending = requests.data?.filter((r) => r.status === 'pending') ?? [];
  const decided = requests.data?.filter((r) => r.status !== 'pending') ?? [];
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Package Requests"
        description="Customers asking to cancel a package for a refund. Approve at the estimated amount, at a different one, or reject with a reason."
      />
      <Card variant="dense" as="section" aria-label="Pending requests">
        <h2 className="text-lg font-semibold text-text">Pending</h2>
        {requests.isPending ? (
          <LoadingState label="Loading requests…" />
        ) : requests.isError ? (
          <ErrorState
            description="We couldn't load the requests."
            onRetry={() => void requests.refetch()}
          />
        ) : pending.length === 0 ? (
          <EmptyState
            title="Nothing pending"
            description="Customer cancellation requests appear here."
          />
        ) : (
          <ul className="mt-sm flex flex-col gap-sm">
            {pending.map((r) => (
              <li key={r.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-semibold text-text">{r.package_name}</p>
                  <span className="text-sm text-text-muted">{r.customer_name}</span>
                  <Badge tone="warning">Pending</Badge>
                </div>
                <p className="text-sm text-text-muted">
                  {r.remaining_sessions} of {r.total_sessions} sessions left · paid{' '}
                  {formatINRExact(r.amount_paid)} · est. refund {formatINRExact(r.estimated_refund)}
                </p>
                <p className="text-xs text-text-muted">
                  “{r.reason}” · requested {formatDateTime(r.created_at)}
                </p>
                <div className="mt-sm flex flex-wrap gap-sm">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setProblem('');
                      setApproving(r);
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setProblem('');
                      setRejecting(r);
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {decided.length > 0 && (
        <Card variant="dense" as="section" aria-label="Decided requests">
          <h2 className="text-lg font-semibold text-text">Decided</h2>
          <ul className="mt-sm flex flex-col gap-sm">
            {decided.map((r) => {
              const state = stateOf(r);
              return (
                <li key={r.id} className="rounded-nested border border-border p-md">
                  <div className="flex flex-wrap items-center gap-xs">
                    <p className="font-semibold text-text">{r.package_name}</p>
                    <span className="text-sm text-text-muted">{r.customer_name}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </div>
                  <p className="text-sm text-text-muted">
                    {r.status === 'approved'
                      ? `Refunded ${formatINRExact(r.decided_amount ?? '0')}`
                      : 'Not approved'}
                    {r.decision_reason ? ` — ${r.decision_reason}` : ''}
                  </p>
                  <p className="text-xs text-text-muted">
                    Decided {r.decided_at ? formatDateTime(r.decided_at) : ''} by{' '}
                    {r.decided_by ?? 'admin'}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {approving && (
        <ApproveModal
          request={approving}
          busy={approve.isPending}
          problem={problem}
          onClose={() => setApproving(null)}
          onConfirm={(method, amount, reason) =>
            approve.mutate({ id: approving.id, method, amount, reason })
          }
        />
      )}
      {rejecting && (
        <ReasonModal
          title={`Reject ${rejecting.package_name}'s cancellation`}
          confirmLabel="Reject"
          busy={reject.isPending}
          problem={problem}
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => reject.mutate({ id: rejecting.id, reason })}
        />
      )}
    </div>
  );
}

function ApproveModal({
  request,
  busy,
  problem,
  onClose,
  onConfirm,
}: {
  request: PackageCancelRequestRow;
  busy: boolean;
  problem: string;
  onClose: () => void;
  onConfirm: (method: 'cash' | 'card' | 'upi', amount: string | undefined, reason: string) => void;
}) {
  const [method, setMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [useEstimate, setUseEstimate] = useState(true);
  const [amount, setAmount] = useState(request.estimated_refund);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!useEstimate && Number(amount) < 0) return setError('Enter a valid amount.');
    setError('');
    onConfirm(method, useEstimate ? undefined : amount, reason.trim());
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Approve ${request.package_name}'s cancellation`}
      description={`Estimated refund: ${formatINRExact(request.estimated_refund)}`}
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <Select
          label="Money goes back by"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'cash' | 'card' | 'upi')}
          options={[
            { value: 'cash', label: 'Cash' },
            { value: 'card', label: 'Card' },
            { value: 'upi', label: 'UPI' },
          ]}
        />
        <Checkbox
          label={`Use the estimated amount (${formatINRExact(request.estimated_refund)})`}
          checked={useEstimate}
          onChange={(e) => setUseEstimate(e.target.checked)}
        />
        {!useEstimate && (
          <Input
            label="Refund amount (₹)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        )}
        <Textarea
          label="Note (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {(error || problem) && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {error || problem}
          </p>
        )}
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Approve
          </Button>
        </div>
      </form>
    </Modal>
  );
}
