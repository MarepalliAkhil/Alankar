import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Truck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import { cancelMyOrder, getMyOrder, payOrder, type Order } from '../../api/shop';
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
  PendingArea,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

/** Customer: one order -- pay (simulated gateway), cancel before packing, and track it. */
export default function OrderDetailPage() {
  const { id = '' } = useParams();
  useDocumentTitle('Order');
  const toast = useToast();
  const queryClient = useQueryClient();
  const order = useQuery({ queryKey: ['my-order', id], queryFn: () => getMyOrder(id) });
  const [cancelling, setCancelling] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  const [giftAmount, setGiftAmount] = useState('');

  const refresh = (o: Order) => {
    queryClient.setQueryData(['my-order', id], o);
    void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
  };

  const pay = useMutation({
    mutationFn: (outcome: 'success' | 'fail') =>
      giftCode.trim()
        ? payOrder(id, outcome, { code: giftCode.trim(), amount: giftAmount.trim() })
        : payOrder(id, outcome),
    onSuccess: (o) => {
      refresh(o);
      toast.show({
        tone: 'success',
        title: 'Payment received',
        description: 'Your order is confirmed.',
      });
    },
    onError: (error: unknown) => {
      const data = (error as { response?: { status?: number; data?: Order } })?.response;
      if (data?.status === 402 && data.data) refresh(data.data);
      else void order.refetch();
      toast.show({
        tone: 'danger',
        title: 'Payment did not go through',
        description: genericErrorMessage(error, 'Nothing was taken. You can try again.'),
      });
    },
  });

  if (order.isPending) return <LoadingState label="Loading your order…" />;
  if (order.isError) {
    return (
      <ErrorState description="We couldn't find that order." onRetry={() => void order.refetch()} />
    );
  }
  const o = order.data;
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Order"
        title={o.number}
        description={`Ordered ${formatDateTime(o.created_at)}`}
        actions={
          <ButtonLink to="/customer/orders" variant="ghost">
            <ArrowLeft className="size-4" aria-hidden /> All orders
          </ButtonLink>
        }
      />
      <div className="flex flex-wrap items-center gap-sm">
        <OrderStatusBadge order={o} />
        {o.tracking_note && (
          <span className="inline-flex items-center gap-xs text-sm text-text">
            <Truck className="size-4" aria-hidden /> {o.tracking_note}
          </span>
        )}
      </div>
      {o.status === 'pending_payment' && (
        <PendingArea
          pending={pay.isPending}
          message="Taking your payment. Please wait, this can take a few seconds."
        >
          <Card as="section" className="flex flex-col gap-sm" aria-label="Payment">
            <p className="text-sm text-text">
              Pay <span className="font-semibold">{formatINRExact(o.total)}</span>
              {o.pay_until && ` by ${formatDateTime(o.pay_until)}`} to confirm your order. Your
              items are held until then.
            </p>
            <div className="grid gap-sm sm:grid-cols-2">
              <Input
                label="Gift card code (optional)"
                hint="Used first; the rest is paid below."
                autoComplete="off"
                value={giftCode}
                onChange={(e) => setGiftCode(e.target.value)}
              />
              <Input
                label="Amount from the gift card (₹, optional)"
                inputMode="decimal"
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value)}
              />
            </div>
            <p className="text-xs text-text-muted">
              This is a test payment page: no card details are asked for.
            </p>
            <div className="flex flex-wrap gap-sm">
              <Button
                type="button"
                loading={pay.isPending && pay.variables === 'success'}
                loadingText="Paying…"
                disabled={pay.isPending}
                onClick={() => pay.mutate('success')}
                leftIcon={<CreditCard className="size-4" aria-hidden />}
              >
                Pay {formatINRExact(o.total)}
              </Button>
              <Button
                loading={pay.isPending && pay.variables === 'fail'}
                type="button"
                variant="secondary"
                disabled={pay.isPending}
                onClick={() => pay.mutate('fail')}
              >
                Simulate a failed payment
              </Button>
            </div>
          </Card>
        </PendingArea>
      )}
      {o.status === 'cancelled' && (
        <Card variant="dense">
          <p className="text-sm text-text">
            This order was cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : '.'}
            {Number(o.refunded) > 0 && ` ${formatINRExact(o.refunded)} was refunded.`}
          </p>
        </Card>
      )}
      {o.status === 'payment_expired' && (
        <Card variant="dense">
          <p className="text-sm text-text">
            The time to pay ran out, so the items were put back. You can order them again from the
            shop.
          </p>
        </Card>
      )}
      <Card as="section" aria-label="Tracking">
        <OrderTimeline order={o} />
      </Card>
      <div className="grid gap-lg md:grid-cols-2">
        <Card className="flex flex-col gap-sm">
          <h2 className="text-lg font-semibold text-text">Items</h2>
          <OrderLines order={o} />
        </Card>
        <Card className="flex flex-col gap-sm">
          <h2 className="text-lg font-semibold text-text">Delivering to</h2>
          <OrderAddress order={o} />
        </Card>
      </div>
      {o.actions.includes('cancel') && (
        <div>
          <Button type="button" variant="ghost" onClick={() => setCancelling(true)}>
            Cancel this order
          </Button>
        </div>
      )}
      {cancelling && (
        <CancelModal
          order={o}
          onClose={() => setCancelling(false)}
          onDone={(next) => {
            setCancelling(false);
            refresh(next);
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
    mutationFn: () => cancelMyOrder(order.id, reason.trim()),
    onSuccess: (o) => {
      toast.show({ tone: 'success', title: 'Order cancelled' });
      onDone(o);
    },
    onError: (error: unknown) =>
      setProblem(genericErrorMessage(error, 'We could not cancel this order.')),
  });
  const paid = Number(order.paid) > 0;
  return (
    <Modal
      busy={cancel.isPending}
      open
      onClose={onClose}
      title={`Cancel ${order.number}?`}
      size="md"
    >
      <div className="flex flex-col gap-md">
        <p className="text-sm text-text">
          {paid
            ? `The ${formatINRExact(order.paid)} you paid is refunded to your original payment method.`
            : 'Nothing has been paid yet, so there is nothing to refund.'}
        </p>
        <Textarea
          label="Reason (optional)"
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
            Keep the order
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel order
          </Button>
        </div>
      </div>
    </Modal>
  );
}
