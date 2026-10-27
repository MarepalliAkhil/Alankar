import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, CreditCard, TriangleAlert } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import { getPayment, payAppointment } from '../../api/booking';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINR } from '../../lib/format';

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
  });

  const pay = useMutation({
    mutationFn: (outcome: 'success' | 'fail') => payAppointment(id, outcome, link),
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
          action={
            <Link
              to="/customer/appointments"
              className="font-semibold text-primary-hover hover:underline"
            >
              Go to My Appointments
            </Link>
          }
        />
      );
    }
    const { state, amount, expires_at: expires, appointment } = payment.data;
    const back = (
      <Link
        to="/customer/appointments"
        className="font-semibold text-primary-hover hover:underline"
      >
        Go to My Appointments
      </Link>
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
      <Card variant="plain" padding="lg" className="mx-auto flex max-w-lg flex-col gap-md">
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
          {expires && (
            <p className="mt-1 text-xs text-text-muted">Pay by {formatDateTime(expires)}.</p>
          )}
        </div>
        <p className="text-xs text-text-muted">
          Test payment: no real money moves and no card details are asked for.
        </p>
        <div className="flex flex-wrap gap-sm">
          <Button loading={pay.isPending} onClick={() => pay.mutate('success')}>
            Pay {formatINR(amount)}
          </Button>
          <Button variant="secondary" disabled={pay.isPending} onClick={() => pay.mutate('fail')}>
            Simulate failed payment
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader title="Pay for your booking" />
      {body()}
    </section>
  );
}
