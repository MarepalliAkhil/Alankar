import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import { advanceOrder, cancelOrder, getOrder, type Order } from '../../api/shop';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  OrderAddress,
  OrderLines,
  OrderStatusBadge,
  OrderTimeline,
} from '../../components/shop/OrderBits';
import {
  Button,
  ButtonLink,
  Card,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';

const NEXT: Record<string, { to: 'packed' | 'shipped' | 'delivered'; label: string }> = {
  mark_packed: { to: 'packed', label: 'Mark packed' },
  mark_shipped: { to: 'shipped', label: 'Hand to delivery' },
  mark_delivered: { to: 'delivered', label: 'Mark delivered' },
};

/** Receptionist and admin: one order with its address and timeline; move it to the next step.
 * Only the admin sees "Cancel with refund". */
export default function OrderDetailPage() {
  const { id = '' } = useParams();
  useDocumentTitle('Order');
  const toast = useToast();
  const queryClient = useQueryClient();
  const order = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });
  const [note, setNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const done = (o: Order) => {
    queryClient.setQueryData(['order', id], o);
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const advance = useMutation({
    mutationFn: (to: 'packed' | 'shipped' | 'delivered') => advanceOrder(id, to, note.trim()),
    onSuccess: (o) => {
      setNote('');
      done(o);
      toast.show({ tone: 'success', title: `Order ${o.status_label.toLowerCase()}` });
    },
    onError: (error: unknown) => {
      void order.refetch();
      toast.show({
        tone: 'danger',
        title: "Couldn't update the order",
        description: genericErrorMessage(error, 'Refresh and try again.'),
      });
    },
  });

  if (order.isPending) return <LoadingState label="Loading the order…" />;
  if (order.isError) {
    return (
      <ErrorState description="We couldn't find that order." onRetry={() => void order.refetch()} />
    );
  }
  const o = order.data;
  const next = o.actions.map((a) => NEXT[a]).find(Boolean);
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Online order"
        title={o.number}
        description={`${o.customer?.name ?? ''} · ordered ${formatDateTime(o.created_at)}`}
        actions={
          <ButtonLink to="/orders" variant="ghost">
            <ArrowLeft className="size-4" aria-hidden /> All orders
          </ButtonLink>
        }
      />
      <div className="flex flex-wrap items-center gap-sm">
        <OrderStatusBadge order={o} />
        {o.tracking_note && <span className="text-sm text-text">{o.tracking_note}</span>}
        {o.cancel_reason && (
          <span className="text-sm text-text-muted">Cancelled: {o.cancel_reason}</span>
        )}
      </div>
      <Card aria-label="Tracking">
        <OrderTimeline order={o} />
      </Card>
      {(next || o.actions.includes('cancel')) && (
        <Card className="flex flex-col gap-sm" aria-label="Next step">
          {next?.to === 'shipped' && (
            <Input
              label="Delivery note (optional)"
              hint="Courier and tracking number, shown to the customer."
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
          <div className="flex flex-wrap gap-sm">
            {next && (
              <Button
                type="button"
                loading={advance.isPending}
                onClick={() => advance.mutate(next.to)}
              >
                {next.label}
              </Button>
            )}
            {o.actions.includes('cancel') && (
              <Button type="button" variant="danger" onClick={() => setCancelling(true)}>
                Cancel with refund
              </Button>
            )}
          </div>
        </Card>
      )}
      <div className="grid gap-lg md:grid-cols-2">
        <Card className="flex flex-col gap-sm">
          <h2 className="text-lg font-semibold text-text">Items</h2>
          <OrderLines order={o} />
        </Card>
        <Card className="flex flex-col gap-sm">
          <h2 className="text-lg font-semibold text-text">Deliver to</h2>
          <OrderAddress order={o} />
          {o.customer && <p className="text-xs text-text-muted">Account: {o.customer.email}</p>}
        </Card>
      </div>
      <Card className="flex flex-col gap-xs">
        <h2 className="text-lg font-semibold text-text">History</h2>
        <ul className="flex flex-col gap-xs text-sm">
          {o.events.map((e, i) => (
            <li key={`${e.status}-${i}`} className="flex flex-wrap justify-between gap-xs">
              <span className="text-text">
                {e.label}
                {e.note ? ` — ${e.note}` : ''}
              </span>
              <span className="text-text-muted">
                {e.by} · {formatDateTime(e.at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {cancelling && (
        <CancelModal
          order={o}
          onClose={() => setCancelling(false)}
          onDone={(next) => {
            setCancelling(false);
            done(next);
          }}
        />
      )}
    </section>
  );
}

function CancelModal({
  order,
  onClose,
  onDone,
}: {
  order: Order;
  onClose: () => void;
  onDone: (order: Order) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const cancel = useMutation({
    mutationFn: () => cancelOrder(order.id, reason.trim()),
    onSuccess: (o) => {
      toast.show({ tone: 'success', title: 'Order cancelled and refunded' });
      onDone(o);
    },
    onError: (error: unknown) =>
      setProblem(genericErrorMessage(error, 'We could not cancel this order.')),
  });
  return (
    <Modal open onClose={onClose} title={`Cancel ${order.number}?`} size="md">
      <div className="flex flex-col gap-md">
        <p className="text-sm text-text">
          The stock goes back on the shelf and everything the customer paid is refunded. The
          customer is emailed with your reason.
        </p>
        <Textarea
          label="Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={problem && reason.trim().length < 3 ? problem : undefined}
        />
        {problem && reason.trim().length >= 3 && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onClose}>
            Keep the order
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={cancel.isPending}
            onClick={() => {
              if (reason.trim().length < 3)
                return setProblem('Give a reason (at least 3 characters).');
              setProblem('');
              cancel.mutate();
            }}
          >
            Cancel and refund
          </Button>
        </div>
      </div>
    </Modal>
  );
}
