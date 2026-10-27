import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorDetail } from '../../api/client';
import {
  checkout,
  getQuote,
  getVisitContext,
  type BillInput,
  type InvoiceDetail,
  type PayMethod,
} from '../../api/pos';
import { formatDateTime, formatINRExact } from '../../lib/format';
import {
  Button,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  Modal,
  Select,
  useToast,
} from '../ui';

const methods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
];

interface PayRow {
  method: PayMethod;
  amount: string;
}

/** The checkout screen: products, discount, loyalty points, tip and (split) payment. */
export function CheckoutModal({
  appointmentId,
  onClose,
  onBilled,
}: {
  appointmentId: string;
  onClose: () => void;
  onBilled: (invoice: InvoiceDetail) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pick, setPick] = useState('');
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');
  const [couponDraft, setCouponDraft] = useState('');
  const [coupon, setCoupon] = useState('');
  const [points, setPoints] = useState('');
  const [tip, setTip] = useState('');
  const [payments, setPayments] = useState<PayRow[]>([{ method: 'cash', amount: '' }]);
  const [problem, setProblem] = useState('');

  const context = useQuery({
    queryKey: ['pos-visit', appointmentId],
    queryFn: () => getVisitContext(appointmentId),
  });

  const bill: BillInput = useMemo(
    () => ({
      appointment: appointmentId,
      products: Object.entries(cart).map(([product, quantity]) => ({ product, quantity })),
      discount_percent: discount || '0',
      discount_reason: reason,
      redeem_points: Number(points) || 0,
      coupon,
      tip: tip || '0',
    }),
    [appointmentId, cart, discount, reason, points, coupon, tip],
  );

  const quote = useQuery({
    queryKey: ['pos-quote', bill],
    queryFn: () => getQuote(bill),
    enabled: context.isSuccess,
    retry: false,
    placeholderData: (previous) => previous,
  });

  const save = useMutation({
    mutationFn: () =>
      checkout({
        ...bill,
        payments: payments
          .filter((row) => Number(row.amount) > 0)
          .map((row) => ({ method: row.method, amount: row.amount })),
      }),
    onSuccess: (invoice) => {
      toast.show({ tone: 'success', title: `Invoice ${invoice.number} issued` });
      void queryClient.invalidateQueries({ queryKey: ['pos-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['pos-inventory'] });
      onBilled(invoice);
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not complete the bill.'),
  });

  const products = context.data?.products ?? [];
  const quoteError = quote.isError
    ? (errorDetail(quote.error) ?? 'Could not work out the bill.')
    : '';
  const toCollect = quote.data ? Number(quote.data.to_collect) : 0;
  const entered = payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const balanced = quote.data !== undefined && !quoteError && Math.abs(entered - toCollect) < 0.005;

  const addProduct = () => {
    if (!pick) return;
    setCart((current) => ({ ...current, [pick]: (current[pick] ?? 0) + 1 }));
    setPick('');
  };
  const setQuantity = (id: string, value: number) =>
    setCart((current) => {
      const next = { ...current };
      if (value < 1) delete next[id];
      else next[id] = value;
      return next;
    });
  const updatePayment = (index: number, patch: Partial<PayRow>) =>
    setPayments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const fillRemaining = (index: number) => {
    const others = payments.reduce(
      (sum, row, i) => sum + (i === index ? 0 : Number(row.amount) || 0),
      0,
    );
    updatePayment(index, { amount: Math.max(0, toCollect - others).toFixed(2) });
  };

  const visit = context.data?.visit;
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={visit ? `Bill ${visit.customer_name}` : 'Checkout'}
      description={
        visit
          ? `${visit.service_name}${visit.variant_label ? ` · ${visit.variant_label}` : ''}${visit.stylist_name ? ` · with ${visit.stylist_name}` : ''}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!balanced}>
            Complete bill
          </Button>
        </>
      }
    >
      {context.isPending ? (
        <LoadingState label="Loading the visit…" />
      ) : context.isError || !context.data ? (
        <ErrorState
          description="This visit is not ready to bill (it may already be billed)."
          onRetry={() => void context.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-lg">
          {visit?.completion && (
            <section
              aria-label="Service completed by the stylist"
              className="flex flex-col gap-xs rounded-input bg-surface p-md text-sm"
            >
              <p className="font-semibold text-text">Completed by the stylist</p>
              <p className="text-text-muted">Done: {visit.completion.done.join(', ')}</p>
              {visit.completion.removed.length > 0 && (
                <p className="text-warning-text">
                  Not done (not billed):{' '}
                  {visit.completion.removed
                    .map((r) => `${r.label} (${formatINRExact(r.price)})`)
                    .join(', ')}
                </p>
              )}
              {visit.completion.note && (
                <p className="text-text-muted">Stylist note: {visit.completion.note}</p>
              )}
            </section>
          )}
          {visit?.allergies && (
            <p className="rounded-input bg-warning-soft p-md text-sm text-warning-text">
              Allergies on file: {visit.allergies}
            </p>
          )}

          <section aria-label="Products" className="flex flex-col gap-sm">
            <h3 className="text-sm font-semibold text-text">Products</h3>
            <div className="flex items-end gap-sm">
              <div className="flex-1">
                <Select
                  label="Add a product"
                  value={pick}
                  onChange={(event) => setPick(event.target.value)}
                  placeholder="Choose a product"
                  options={products
                    .map((p) => ({
                      value: p.id,
                      label: `${p.name} · ${formatINRExact(p.unit_price)} · ${p.stock} in stock`,
                    }))
                    .filter((option) => products.find((p) => p.id === option.value)!.stock > 0)}
                />
              </div>
              <Button
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={addProduct}
              >
                Add
              </Button>
            </div>
            {Object.keys(cart).length > 0 && (
              <ul className="flex flex-col gap-xs">
                {Object.entries(cart).map(([id, quantity]) => {
                  const product = products.find((p) => p.id === id);
                  if (!product) return null;
                  return (
                    <li key={id} className="flex items-center justify-between gap-sm text-sm">
                      <span>
                        {product.name}{' '}
                        <span className="text-text-muted">({product.stock} in stock)</span>
                      </span>
                      <span className="flex items-center gap-sm">
                        <Input
                          label={`Quantity of ${product.name}`}
                          type="number"
                          min={0}
                          max={product.stock}
                          value={quantity}
                          onChange={(event) => setQuantity(id, Number(event.target.value))}
                          className="w-20"
                        />
                        <IconButton
                          label={`Remove ${product.name}`}
                          onClick={() => setQuantity(id, 0)}
                          icon={<Trash2 className="h-4 w-4" />}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Discount, points and tip" className="grid gap-md sm:grid-cols-2">
            <Input
              label="Discount %"
              type="number"
              min={0}
              max={Number(context.data.max_discount_percent)}
              hint={`Up to ${Number(context.data.max_discount_percent)}% for you.`}
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
            <Input
              label="Discount reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              hint="Needed for any discount."
            />
            <div className="flex items-end gap-sm">
              <Input
                label="Coupon code"
                value={couponDraft}
                onChange={(event) => setCouponDraft(event.target.value)}
                disabled={coupon !== ''}
                hint="One coupon per bill."
              />
              {coupon === '' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={couponDraft.trim() === ''}
                  onClick={() => setCoupon(couponDraft.trim())}
                >
                  Apply coupon
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCoupon('');
                    setCouponDraft('');
                  }}
                >
                  Remove coupon
                </Button>
              )}
            </div>
            <Input
              label="Loyalty points to use"
              type="number"
              min={0}
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              hint={`${context.data.points_balance} points available${quote.data ? ` (up to ${quote.data.max_redeemable} on this bill)` : ''}.`}
            />
            <Input
              label="Tip for the stylist (₹)"
              type="number"
              min={0}
              value={tip}
              onChange={(event) => setTip(event.target.value)}
              hint="Goes fully to the stylist."
            />
          </section>

          <section aria-label="Bill" className="rounded-card bg-primary-soft p-md text-sm">
            {quoteError ? (
              <p role="alert" className="text-danger-text">
                {quoteError}
              </p>
            ) : quote.data ? (
              <dl className="grid grid-cols-[1fr_auto] gap-x-md gap-y-1">
                <dt>Items</dt>
                <dd>{formatINRExact(quote.data.gross)}</dd>
                {Number(quote.data.discount_amount) - Number(quote.data.coupon_amount ?? 0) > 0 && (
                  <>
                    <dt>Discount</dt>
                    <dd>
                      −{' '}
                      {formatINRExact(
                        (
                          Number(quote.data.discount_amount) - Number(quote.data.coupon_amount ?? 0)
                        ).toFixed(2),
                      )}
                    </dd>
                  </>
                )}
                {Number(quote.data.coupon_amount ?? 0) > 0 && (
                  <>
                    <dt>Coupon {quote.data.coupon_code}</dt>
                    <dd>− {formatINRExact(quote.data.coupon_amount ?? '0')}</dd>
                  </>
                )}
                <dt className="text-text-muted">of which GST (included)</dt>
                <dd className="text-text-muted">{formatINRExact(quote.data.gst_amount)}</dd>
                <dt className="font-semibold">Bill total</dt>
                <dd className="font-semibold">{formatINRExact(quote.data.total)}</dd>
                {Number(quote.data.prepaid) > 0 && (
                  <>
                    <dt>Paid online already</dt>
                    <dd>− {formatINRExact(quote.data.prepaid)}</dd>
                  </>
                )}
                {quote.data.loyalty_redeemed > 0 && (
                  <>
                    <dt>Loyalty points ({quote.data.loyalty_redeemed})</dt>
                    <dd>− {formatINRExact(quote.data.loyalty_value)}</dd>
                  </>
                )}
                {Number(quote.data.tip) > 0 && (
                  <>
                    <dt>Tip</dt>
                    <dd>{formatINRExact(quote.data.tip)}</dd>
                  </>
                )}
                <dt className="font-semibold">To collect now</dt>
                <dd className="font-semibold">{formatINRExact(quote.data.to_collect)}</dd>
                {Number(quote.data.excess_prepaid) > 0 && (
                  <p className="col-span-2 text-text-muted">
                    The online payment is more than the bill.{' '}
                    {formatINRExact(quote.data.excess_prepaid)} will go to the admin as a refund to
                    approve.
                  </p>
                )}
                <p className="col-span-2 text-text-muted">
                  The customer earns {quote.data.loyalty_earned} loyalty point
                  {quote.data.loyalty_earned === 1 ? '' : 's'}.
                </p>
              </dl>
            ) : (
              <LoadingState label="Working out the bill…" />
            )}
          </section>

          <section aria-label="Payment" className="flex flex-col gap-sm">
            <h3 className="text-sm font-semibold text-text">Payment</h3>
            {payments.map((row, index) => (
              <div key={index} className="flex flex-wrap items-end gap-sm">
                <Select
                  label={`Method ${index + 1}`}
                  value={row.method}
                  onChange={(event) =>
                    updatePayment(index, { method: event.target.value as PayMethod })
                  }
                  options={methods}
                />
                <Input
                  label={`Amount ${index + 1}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.amount}
                  onChange={(event) => updatePayment(index, { amount: event.target.value })}
                />
                <Button variant="secondary" onClick={() => fillRemaining(index)}>
                  Fill remaining
                </Button>
                {payments.length > 1 && (
                  <IconButton
                    label={`Remove payment ${index + 1}`}
                    onClick={() => setPayments((rows) => rows.filter((_, i) => i !== index))}
                    icon={<Trash2 className="h-4 w-4" />}
                  />
                )}
              </div>
            ))}
            <div className="flex items-center justify-between text-sm">
              <Button
                variant="ghost"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setPayments((rows) => [...rows, { method: 'card', amount: '' }])}
              >
                Split payment
              </Button>
              <span className={balanced ? 'text-success-text' : 'text-text-muted'}>
                Entered {formatINRExact(entered)} of {formatINRExact(toCollect)}
              </span>
            </div>
          </section>

          {problem && (
            <p role="alert" className="text-sm text-danger-text">
              {problem}
            </p>
          )}
          {visit?.start && (
            <p className="text-xs text-text-muted">Booked for {formatDateTime(visit.start)}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
