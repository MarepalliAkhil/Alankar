import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, CreditCard, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import { getPayment, payAppointment } from '../../api/booking';
import { checkMyGiftCard } from '../../api/wallet';
import { PageHeader } from '../../components/layout/PageContainer';
import {
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

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const payment = useQuery({
    queryKey: ['payment', id, link, coupon],
    queryFn: () => (coupon ? getPayment(id, link, coupon) : getPayment(id, link)),
    retry: false,
    placeholderData: (previous) => previous,
  });
  const couponOk = Boolean(coupon) && !payment.data?.coupon_error;

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
        ...(couponOk ? [coupon] : []),
      ),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Payment received',
        description: 'Your booking is confirmed.',
      });
    },
    onError: (error) => {
      toast.show({
        tone: 'danger',
        title: 'Payment did not go through',
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
          <div className="rounded-nested bg-primary-soft p-md">
            <p className="text-xs text-text-muted">Amount due (incl. GST)</p>
            <p className="text-2xl font-semibold text-text">{formatINR(amount)}</p>
            {quote && Number(quote.discount) > 0 && (
              <dl className="mt-xs flex flex-col gap-1 text-xs text-text-muted">
                <div className="flex justify-between">
                  <dt>Price</dt>
                  <dd>{formatINRExact(quote.items_total)}</dd>
                </div>
                {Number(quote.coupon_amount) > 0 && (
                  <div className="flex justify-between">
                    <dt>Coupon {quote.coupon_code}</dt>
                    <dd>- {formatINRExact(quote.coupon_amount)}</dd>
                  </div>
                )}
                {Number(quote.member_amount) > 0 && (
                  <div className="flex justify-between">
                    <dt>
                      {quote.member_plan} membership ({Number(quote.member_percent)}%)
                    </dt>
                    <dd>- {formatINRExact(quote.member_amount)}</dd>
                  </div>
                )}
              </dl>
            )}
            {expires && (
              <p className="mt-1 text-xs text-text-muted">Pay by {formatDateTime(expires)}.</p>
            )}
          </div>
          <div className="flex flex-col gap-xs rounded-nested border border-border p-md">
            <div className="flex flex-wrap items-end gap-sm">
              <div className="min-w-0 flex-1">
                <Input
                  label="Coupon code (optional)"
                  autoComplete="off"
                  value={couponInput}
                  error={coupon ? payment.data.coupon_error || undefined : undefined}
                  onChange={(e) => setCouponInput(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={couponInput.trim() === ''}
                loading={payment.isFetching && coupon !== ''}
                onClick={() => setCoupon(couponInput.trim().toUpperCase())}
              >
                Apply
              </Button>
            </div>
            {couponOk && (
              <p role="status" className="text-sm text-text">
                Coupon {coupon} applied.
              </p>
            )}
          </div>
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
