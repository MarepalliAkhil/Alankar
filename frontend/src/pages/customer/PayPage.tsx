import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, CreditCard, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  applyCoupon,
  getPayment,
  payAppointment,
  removeCoupon,
  type PaymentState,
} from '../../api/booking';
import { checkMyGiftCard } from '../../api/wallet';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  StatusBadge,
  useToast,
  PendingArea,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINR, formatINRExact } from '../../lib/format';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { cn } from '../../lib/cn';

/**
 * Mock payment gateway (v1). No card details are ever asked for: the two buttons simulate a
 * successful or a failed payment so the whole booking flow can be tested.
 */
export default function PayPage() {
  useDocumentTitle('Pay for your booking');
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const link = params.get('link');
  const toast = useToast();
  const queryClient = useQueryClient();

  const payment = useQuery({
    queryKey: ['payment', id, link],
    queryFn: () => getPayment(id, link),
    retry: false,
    placeholderData: (previous) => previous,
  });

  const [giftCode, setGiftCode] = useState('');
  const [giftAmount, setGiftAmount] = useState('');
  const [giftNote, setGiftNote] = useState<{ text: string; bad: boolean } | null>(null);
  const checkGift = useMutation({
    mutationFn: () => checkMyGiftCard(giftCode),
    onSuccess: (card) =>
      setGiftNote({
        text: `${card.masked} has ${formatINRExact(card.balance)} to spend.`,
        bad: false,
      }),
    onError: (error) =>
      setGiftNote({
        text: genericErrorMessage(error, 'That gift card code is not valid.'),
        bad: true,
      }),
  });

  const pay = useMutation({
    mutationFn: (outcome: 'success' | 'fail') =>
      payAppointment(
        id,
        outcome,
        link,
        giftCode.trim() ? { code: giftCode.trim(), amount: giftAmount.trim() } : null,
      ),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Payment received',
        description: 'Your booking is confirmed.',
      });
    },
    onError: (error) => {
      const changed =
        (error as { response?: { data?: { code?: string } } })?.response?.data?.code ===
        'coupon_changed';
      toast.show({
        tone: changed ? 'warning' : 'danger',
        title: changed ? 'Please check the new total' : 'Payment did not go through',
        description: genericErrorMessage(error, 'No money was taken. You can try again.'),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment', id] });
      void queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
    },
  });

  const body = () => {
    if (payment.isPending) return <LoadingState label="Loading your payment…" />;
    if (payment.isError) {
      return (
        <ErrorState
          title="We couldn't find this payment"
          description="Open it from My Appointments, or check that you are signed in with the account that made the booking."
          action={<ButtonLink to="/customer/appointments">Go to My Appointments</ButtonLink>}
        />
      );
    }
    const { state, amount: listed, expires_at: expires, appointment, quote } = payment.data;
    const amount = quote?.total ?? listed;
    const back = (
      <ButtonLink to="/customer/appointments" variant="secondary" size="sm" className="w-fit">
        Go to My Appointments
      </ButtonLink>
    );
    if (state === 'paid') {
      return (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6 text-success-text" />}
          title="Payment received"
          description={`Your ${appointment.service_name} is booked${appointment.start ? ` for ${formatDateTime(appointment.start)}` : ''}. We emailed you a receipt.`}
          action={back}
        />
      );
    }
    if (state === 'expired') {
      return (
        <EmptyState
          icon={<Clock className="h-6 w-6" />}
          title="This payment link has expired"
          description="The slot was released. Contact the salon or send a new request."
          action={back}
        />
      );
    }
    if (state === 'replaced') {
      return (
        <EmptyState
          icon={<TriangleAlert className="h-6 w-6" />}
          title="This link was replaced by a newer one"
          description="Use the latest email we sent you, or pay from My Appointments."
          action={back}
        />
      );
    }
    if (state === 'none') {
      return (
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="Nothing to pay right now"
          description="This booking has no payment waiting."
          action={back}
        />
      );
    }
    return (
      <PendingArea
        pending={pay.isPending}
        message="Taking your payment. Please wait, this can take a few seconds."
        className="mx-auto w-full max-w-lg"
      >
        <Card variant="plain" padding="lg" className="flex flex-col gap-md">
          <div className="flex items-start justify-between gap-md">
            <div>
              <h2 className="text-base font-semibold text-text">{appointment.service_name}</h2>
              <p className="text-sm text-text-muted">
                {appointment.start ? formatDateTime(appointment.start) : ''}
                {appointment.stylist_name ? ` · ${appointment.stylist_name}` : ''}
              </p>
            </div>
            <StatusBadge status={appointment.status} />
          </div>
          <Breakdown data={payment.data} amount={amount} expires={expires} />
          <CouponPanel id={id} link={link} data={payment.data} />
          <div className="flex flex-col gap-xs rounded-nested border border-border p-md">
            <Input
              label="Gift card code (optional)"
              hint="It pays all or part of the amount. The rest is paid below."
              autoComplete="off"
              value={giftCode}
              onChange={(e) => {
                setGiftCode(e.target.value);
                setGiftNote(null);
              }}
            />
            <Input
              label="Amount to take from the gift card (₹, optional)"
              inputMode="decimal"
              value={giftAmount}
              onChange={(e) => setGiftAmount(e.target.value)}
            />
            <div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={giftCode.trim() === ''}
                loading={checkGift.isPending}
                onClick={() => checkGift.mutate()}
              >
                Check balance
              </Button>
            </div>
            {giftNote && (
              <p
                role={giftNote.bad ? 'alert' : 'status'}
                className={
                  giftNote.bad ? 'text-sm font-medium text-danger-text' : 'text-sm text-text'
                }
              >
                {giftNote.text}
              </p>
            )}
          </div>
          <p className="text-xs text-text-muted">
            Test payment: no real money moves and no card details are asked for.
          </p>
          <div className="flex flex-wrap gap-sm">
            <Button
              loading={pay.isPending && pay.variables === 'success'}
              loadingText="Paying…"
              disabled={pay.isPending}
              onClick={() => pay.mutate('success')}
            >
              Pay {formatINR(amount)}
            </Button>
            <Button
              loading={pay.isPending && pay.variables === 'fail'}
              variant="secondary"
              disabled={pay.isPending}
              onClick={() => pay.mutate('fail')}
            >
              Simulate failed payment
            </Button>
          </div>
        </Card>
      </PendingArea>
    );
  };

  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader title="Pay for your booking" />
      {body()}
    </section>
  );
}

/** Each service and product, Subtotal, Coupon, GST and Total. A live region reads out the new
 * total whenever a coupon is applied or removed. */
function Breakdown({
  data,
  amount,
  expires,
}: {
  data: PaymentState;
  amount: string;
  expires: string | null;
}) {
  const quote = data.quote;
  return (
    <div className="rounded-nested bg-primary-soft p-md">
      <dl className="flex flex-col gap-1 text-sm text-text" aria-label="Price breakdown">
        {(quote?.lines ?? []).map((line, i) => (
          <div key={`${line.description}-${i}`} className="flex justify-between gap-sm">
            <dt className="min-w-0">{line.description}</dt>
            <dd className="tabular">{formatINRExact(line.amount)}</dd>
          </div>
        ))}
        {quote && (
          <div className="flex justify-between gap-sm border-t border-border pt-1">
            <dt>Subtotal</dt>
            <dd className="tabular">{formatINRExact(quote.items_total)}</dd>
          </div>
        )}
        {quote && (
          // Always present (with a dash when empty) so applying a coupon never moves the page.
          <div
            className={`flex justify-between gap-sm ${Number(quote.coupon_amount) > 0 ? 'text-success-text' : 'text-text-muted'}`}
          >
            <dt>{Number(quote.coupon_amount) > 0 ? `Coupon ${quote.coupon_code}` : 'Coupon'}</dt>
            <dd className="tabular">
              {Number(quote.coupon_amount) > 0 ? `- ${formatINRExact(quote.coupon_amount)}` : '–'}
            </dd>
          </div>
        )}
        {quote && Number(quote.member_amount) > 0 && (
          <div className="flex justify-between gap-sm">
            <dt>
              {quote.member_plan} membership ({Number(quote.member_percent)}%)
            </dt>
            <dd className="tabular">- {formatINRExact(quote.member_amount)}</dd>
          </div>
        )}
        {quote?.gst_included !== undefined && (
          <div className="flex justify-between gap-sm text-text-muted">
            <dt>GST (included)</dt>
            <dd className="tabular">{formatINRExact(quote.gst_included)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-sm border-t border-border pt-1">
          <dt className="font-semibold">Total</dt>
          <dd className="text-2xl font-semibold tabular" data-testid="pay-total">
            {formatINR(amount)}
          </dd>
        </div>
      </dl>
      <p aria-live="polite" className="sr-only">
        Total to pay: {formatINRExact(amount)}
      </p>
      {expires && <p className="mt-1 text-xs text-text-muted">Pay by {formatDateTime(expires)}.</p>}
    </div>
  );
}

function CouponPanel({ id, link, data }: { id: string; link: string | null; data: PaymentState }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const applied = data.applied_coupon ?? '';
  const update = (result: Awaited<ReturnType<typeof applyCoupon>>) =>
    queryClient.setQueryData<PaymentState>(['payment', id, link], (old) =>
      old
        ? {
            ...old,
            quote: result.quote,
            applied_coupon: result.applied_coupon,
            coupons: result.coupons,
          }
        : old,
    );
  const apply = useMutation({
    // Only the code goes to the server; it re-checks every rule and works out the discount.
    mutationFn: (code: string) => applyCoupon(id, code, link),
    onSuccess: (result) => {
      update(result);
      setTyped('');
      setMessage({
        text: `${result.applied_coupon} applied, you save ${formatINRExact(result.quote.coupon_amount)}.`,
        bad: false,
      });
    },
    onError: (error) =>
      setMessage({ text: genericErrorMessage(error, 'That coupon code is not valid.'), bad: true }),
  });
  const remove = useMutation({
    mutationFn: () => removeCoupon(id, link),
    onSuccess: (result) => {
      update(result);
      setMessage({ text: 'Coupon removed. The full price is back.', bad: false });
    },
    onError: (error) =>
      setMessage({ text: genericErrorMessage(error, 'Could not remove the coupon.'), bad: true }),
  });
  const list = data.coupons ?? [];
  const saving = data.quote?.coupon_amount ?? '0';
  return (
    <section
      aria-labelledby="coupons-title"
      className="glass flex flex-col gap-sm rounded-nested border border-border p-md"
    >
      <h3 id="coupons-title" className="text-sm font-semibold text-text">
        Coupons
      </h3>
      {list.length > 0 && (
        <ul
          aria-label="Coupons for this payment"
          className="grid grid-cols-1 gap-xs sm:grid-cols-2"
        >
          {list.map((c) => {
            const isApplied = c.code === applied;
            const name = isApplied
              ? `${c.code}, applied, you save ${formatINRExact(saving)}`
              : c.eligible
                ? `Apply ${c.code}: ${c.title}, save ${formatINRExact(c.saves)}${c.best ? ', best for you' : ''}`
                : `${c.code}: ${c.title}, not available. ${c.reason}`;
            return (
              <li
                key={c.code}
                data-coupon={c.code}
                data-state={isApplied ? 'applied' : c.eligible ? 'eligible' : 'unavailable'}
                className={cn(
                  'flex min-w-0 flex-col gap-xs rounded-nested border p-sm transition-colors duration-base ease-brand',
                  isApplied
                    ? 'border-primary bg-primary-soft'
                    : c.eligible
                      ? 'border-border bg-surface'
                      : 'border-border bg-surface opacity-60',
                )}
              >
                <button
                  type="button"
                  aria-pressed={isApplied}
                  aria-label={name}
                  disabled={!c.eligible || apply.isPending || isApplied}
                  onClick={() => apply.mutate(c.code)}
                  className="touch-target flex min-h-11 w-full flex-col items-start gap-1 rounded-input text-left focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-default"
                >
                  <span className="flex w-full flex-wrap items-center justify-between gap-xs">
                    <span className="font-mono text-sm font-semibold text-text">{c.code}</span>
                    {c.best && !isApplied && <Badge tone="success">Best for you</Badge>}
                  </span>
                  <span className="text-sm font-medium text-text">{c.title}</span>
                  <span className="text-xs text-text-muted">{c.terms}</span>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      isApplied
                        ? 'text-success-text'
                        : c.eligible
                          ? 'text-primary-hover'
                          : 'text-text-muted',
                    )}
                  >
                    {isApplied
                      ? `Applied, you save ${formatINRExact(saving)}`
                      : c.eligible
                        ? `Tap to apply · save ${formatINRExact(c.saves)}`
                        : c.reason}
                  </span>
                </button>
                {isApplied && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={remove.isPending}
                    aria-label={`Remove coupon ${c.code}`}
                    onClick={() => remove.mutate()}
                    className="self-start"
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {applied && !list.some((c) => c.code === applied) && (
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <p className="text-sm font-medium text-text">
            {applied} applied, you save {formatINRExact(saving)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={remove.isPending}
            aria-label={`Remove coupon ${applied}`}
            onClick={() => remove.mutate()}
          >
            Remove
          </Button>
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) apply.mutate(typed.trim().toUpperCase());
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            label="Have a private code?"
            autoComplete="off"
            autoCapitalize="characters"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          aria-label="Apply typed coupon code"
          disabled={typed.trim() === '' || apply.isPending}
          loading={apply.isPending && apply.variables === typed.trim().toUpperCase()}
        >
          Apply
        </Button>
      </form>
      {/* Space is kept for the message so applying or removing never moves the page. */}
      <p
        role={message?.bad ? 'alert' : 'status'}
        className={`min-h-[1.25rem] text-sm ${message?.bad ? 'font-medium text-danger-text' : 'text-text'}`}
      >
        {message?.text ?? ''}
      </p>
    </section>
  );
}
