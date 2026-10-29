import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  estimatePackageCancelRefund,
  listMyPackages,
  requestPackageCancellation,
  revealMyPackageCode,
  type PackageCancelEstimate,
  type PurchaseRow,
} from '../../api/wallet';
import { PageHeader } from '../../components/layout/PageContainer';
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
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

/** Customer: a standalone page for every package bought -- sessions left, the code (show/hide),
 * usage history, and asking to cancel for a pro-rata refund. */
export default function MyPackagesPage() {
  useDocumentTitle('My Packages');
  const packages = useQuery({ queryKey: ['my-packages'], queryFn: listMyPackages });
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        title="My Packages"
        description="Bundles of sessions you've bought. Buy more from My Wallet."
      />
      {packages.isPending ? (
        <LoadingState label="Loading your packages…" />
      ) : packages.isError ? (
        <ErrorState
          description="We couldn't load your packages."
          onRetry={() => void packages.refetch()}
        />
      ) : packages.data.length === 0 ? (
        <EmptyState
          title="No packages yet"
          description="Buy a package from My Wallet to see it here."
        />
      ) : (
        <ul className="flex flex-col gap-md">
          {packages.data.map((p) => (
            <PackageCard key={p.id} purchase={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function packageState(p: PurchaseRow): { label: string; tone: 'success' | 'neutral' | 'warning' } {
  if (p.cancel_status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (p.cancel_status === 'pending') return { label: 'Cancellation pending', tone: 'warning' };
  if (new Date(p.expires_at) <= new Date()) return { label: 'Expired', tone: 'neutral' };
  if (p.remaining <= 0) return { label: 'Used up', tone: 'neutral' };
  return { label: 'Active', tone: 'success' };
}

function PackageCard({ purchase: p }: { purchase: PurchaseRow }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const state = packageState(p);
  const reveal = useMutation({
    mutationFn: () => revealMyPackageCode(p.id),
    onSuccess: (r) => setCode(r.code),
    onError: (error: unknown) =>
      toast.show({
        tone: 'danger',
        title: "Can't show the code",
        description: genericErrorMessage(
          error,
          'This package’s code was only shown once, when it was bought.',
        ),
      }),
  });
  const canCancel =
    p.cancel_status === 'none' &&
    p.remaining > 0 &&
    !p.pending_cancel_request &&
    new Date(p.expires_at) > new Date();
  return (
    <Card variant="dense" as="li" aria-label={p.name}>
      <div className="flex flex-wrap items-center gap-xs">
        <p className="font-semibold text-text">{p.name}</p>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <p className="text-sm text-text-muted">
        {p.credits.map((c) => `${c.remaining} of ${c.quantity} ${c.service_name}`).join(', ')}
      </p>
      <p className="text-xs text-text-muted">
        Bought {formatDateTime(p.purchased_at)} for {formatINRExact(p.price_paid)} · use by{' '}
        {formatDateTime(p.expires_at)}
      </p>
      <div className="mt-xs flex flex-wrap items-center gap-xs">
        <span
          className="font-mono text-sm font-medium text-text"
          data-testid="package-code-display"
        >
          {code ?? p.masked}
        </span>
        {p.code_available ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => (code ? setCode(null) : reveal.mutate())}
            disabled={reveal.isPending}
          >
            {code ? (
              <>
                <EyeOff className="size-4" aria-hidden /> Hide code
              </>
            ) : (
              <>
                <Eye className="size-4" aria-hidden /> Show code
              </>
            )}
          </Button>
        ) : (
          <span className="text-xs text-text-muted">Code was shown once, at purchase</span>
        )}
        {code && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void navigator.clipboard?.writeText(code ?? '')}
          >
            <Copy className="size-4" aria-hidden /> Copy
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowLedger((v) => !v)}>
          {showLedger ? (
            <>
              <ChevronUp className="size-4" aria-hidden /> Hide history
            </>
          ) : (
            <>
              <ChevronDown className="size-4" aria-hidden /> History
            </>
          )}
        </Button>
        {p.pending_cancel_request ? (
          <Badge tone="warning">
            Refund request pending (est. {formatINRExact(p.pending_cancel_request.estimated_refund)}
            )
          </Badge>
        ) : (
          canCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(true)}>
              Cancel for a refund
            </Button>
          )
        )}
      </div>
      {showLedger && (
        <ul className="mt-sm flex flex-col gap-xs border-t border-border pt-sm">
          {(p.ledger ?? []).length === 0 ? (
            <li className="text-xs text-text-muted">No activity yet.</li>
          ) : (
            p.ledger!.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-xs text-xs">
                <span className="text-text">
                  {e.reason_label}
                  {e.note ? ` — ${e.note}` : ''}
                </span>
                <span className="text-text-muted">
                  {e.delta >= 0 ? '+' : ''}
                  {e.delta} · {formatDateTime(e.created_at)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
      {cancelling && (
        <CancelRequestModal
          purchase={p}
          onClose={() => setCancelling(false)}
          onRequested={() => {
            setCancelling(false);
            void queryClient.invalidateQueries({ queryKey: ['my-packages'] });
          }}
        />
      )}
    </Card>
  );
}

function CancelRequestModal({
  purchase,
  onClose,
  onRequested,
}: {
  purchase: PurchaseRow;
  onClose: () => void;
  onRequested: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const estimate = useQuery<PackageCancelEstimate>({
    queryKey: ['my-package-cancel-estimate', purchase.id],
    queryFn: () => estimatePackageCancelRefund(purchase.id),
  });
  const submit = useMutation({
    mutationFn: () => requestPackageCancellation(purchase.id, reason.trim()),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Cancellation requested' });
      onRequested();
    },
    onError: (error: unknown) =>
      setProblem(genericErrorMessage(error, 'We could not send the request.')),
  });
  return (
    <Modal open onClose={onClose} title={`Cancel ${purchase.name}`} size="md">
      <div className="flex flex-col gap-md">
        {estimate.isPending ? (
          <LoadingState label="Estimating your refund…" />
        ) : estimate.isError ? (
          <ErrorState description="We couldn't estimate the refund." />
        ) : (
          <>
            <p className="text-sm text-text">
              Based on {purchase.remaining} unused session{purchase.remaining === 1 ? '' : 's'}, you
              would be refunded about{' '}
              <span className="font-semibold">
                {formatINRExact(estimate.data.estimated_refund)}
              </span>
              {Number(estimate.data.cancellation_fee_percent) > 0
                ? ` (after a ${estimate.data.cancellation_fee_percent}% cancellation fee)`
                : ''}
              . The admin reviews every request and may adjust the amount.
            </p>
            <Textarea
              label="Why are you cancelling?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {problem && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {problem}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-sm">
              <Button type="button" variant="ghost" onClick={onClose}>
                Never mind
              </Button>
              <Button
                type="button"
                loading={submit.isPending}
                onClick={() => {
                  if (reason.trim().length < 3) return setProblem('Say a little more.');
                  setProblem('');
                  submit.mutate();
                }}
              >
                Request cancellation
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
