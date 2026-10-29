import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  actOnAppointment,
  listMyAppointments,
  type CustomerAppointment,
  type MyActionPath,
} from '../../api/booking';
import { RatingPrompt } from '../../components/booking/RatingPrompt';
import { VisitProducts } from '../../components/customer/VisitProducts';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatDuration, formatINR, shopLocalToIso } from '../../lib/format';

type Dialog =
  | { kind: 'cancel'; appt: CustomerAppointment; late: boolean }
  | { kind: 'reschedule'; appt: CustomerAppointment }
  | null;

const ACTIVE = ['requested', 'awaiting_payment', 'scheduled', 'checked_in', 'in_progress'];

/** My Appointments: one card per request or visit, with the actions allowed right now. */
export default function AppointmentsPage() {
  useDocumentTitle('My appointments');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [formError, setFormError] = useState('');

  const list = useQuery({ queryKey: ['my-appointments'], queryFn: listMyAppointments });

  const act = useMutation({
    mutationFn: (args: { id: string; action: MyActionPath; body?: Record<string, string> }) =>
      actOnAppointment(args.id, args.action, args.body),
    onSuccess: (_, args) => {
      void queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      setDialog(null);
      setText('');
      setWhen('');
      const messages: Record<MyActionPath, string> = {
        cancel: 'Booking cancelled.',
        'request-cancel': 'Cancellation requested. The salon will contact you.',
        arrived: "Thanks, we'll let the desk know you're here.",
        reschedule: 'Reschedule request sent. The salon will contact you.',
        'resend-link': 'A new payment link is on its way to your email.',
      };
      toast.show({ tone: 'success', title: messages[args.action] });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      const message = genericErrorMessage(error, 'Please try again.');
      setFormError(message);
      toast.show({ tone: 'danger', title: 'That did not work', description: message });
    },
  });

  const close = () => {
    setDialog(null);
    setText('');
    setWhen('');
    setFormError('');
  };

  const submitDialog = () => {
    if (!dialog) return;
    setFormError('');
    if (dialog.kind === 'cancel') {
      act.mutate({
        id: dialog.appt.id,
        action: dialog.late ? 'request-cancel' : 'cancel',
        body: { reason: text },
      });
      return;
    }
    if (!when) {
      setFormError('Choose the date and time you would prefer.');
      return;
    }
    act.mutate({
      id: dialog.appt.id,
      action: 'reschedule',
      body: { preferred: shopLocalToIso(when), note: text },
    });
  };

  const appointments = list.data ?? [];
  const current = appointments.filter((a) => ACTIVE.includes(a.status));
  const past = appointments.filter((a) => !ACTIVE.includes(a.status));

  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader
        title="My appointments"
        description="Your booking requests and visits. Pay, reschedule, cancel or tell us you've arrived."
        actions={
          <Link
            to="/customer/book"
            className="text-sm font-semibold text-primary-hover hover:underline"
          >
            Book a new appointment
          </Link>
        }
      />
      <RatingPrompt />
      {list.isPending ? (
        <LoadingState label="Loading your appointments…" />
      ) : list.isError ? (
        <ErrorState
          description="We couldn't load your appointments."
          onRetry={() => void list.refetch()}
        />
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="No appointments yet"
          description="Pick a service and send a booking request. It will show up here."
          action={
            <Link to="/customer/book" className="font-semibold text-primary-hover hover:underline">
              Book an appointment
            </Link>
          }
        />
      ) : (
        <>
          <AppointmentList
            title="Upcoming and open requests"
            items={current}
            busy={act.isPending}
            onAct={(appt, action) => act.mutate({ id: appt.id, action })}
            onDialog={setDialog}
          />
          {past.length > 0 && (
            <AppointmentList
              title="Past"
              items={past}
              busy={act.isPending}
              onAct={(appt, action) => act.mutate({ id: appt.id, action })}
              onDialog={setDialog}
            />
          )}
        </>
      )}

      <Modal
        open={dialog !== null}
        onClose={close}
        title={
          dialog?.kind === 'reschedule'
            ? 'Ask to reschedule'
            : dialog?.late
              ? 'Request cancellation'
              : 'Cancel this booking?'
        }
        description={
          dialog?.kind === 'cancel' && dialog.late
            ? 'This is inside the free-cancellation window, so the salon reviews your request.'
            : dialog?.kind === 'cancel' && dialog.appt.status === 'scheduled'
              ? 'You are within the free-cancellation window. Any payment is refunded.'
              : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Keep booking
            </Button>
            <Button
              variant={dialog?.kind === 'cancel' ? 'danger' : 'primary'}
              loading={act.isPending}
              onClick={submitDialog}
            >
              {dialog?.kind === 'reschedule'
                ? 'Send request'
                : dialog?.late
                  ? 'Request cancellation'
                  : 'Cancel booking'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          {dialog?.kind === 'reschedule' && (
            <Input
              label="Preferred new date and time"
              type="datetime-local"
              required
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
          )}
          <Textarea
            label={dialog?.kind === 'reschedule' ? 'Note (optional)' : 'Reason (optional)'}
            value={text}
            maxLength={300}
            onChange={(event) => setText(event.target.value)}
          />
          {formError && <p className="text-sm font-medium text-danger-text">{formError}</p>}
        </div>
      </Modal>
    </section>
  );
}

function AppointmentList({
  title,
  items,
  busy,
  onAct,
  onDialog,
}: {
  title: string;
  items: CustomerAppointment[];
  busy: boolean;
  onAct: (appt: CustomerAppointment, action: MyActionPath) => void;
  onDialog: (dialog: Dialog) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-md">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      <ul className="grid gap-md md:grid-cols-2">
        {items.map((appt) => (
          <li key={appt.id}>
            <AppointmentCard appt={appt} busy={busy} onAct={onAct} onDialog={onDialog} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppointmentCard({
  appt,
  busy,
  onAct,
  onDialog,
}: {
  appt: CustomerAppointment;
  busy: boolean;
  onAct: (appt: CustomerAppointment, action: MyActionPath) => void;
  onDialog: (dialog: Dialog) => void;
}) {
  const has = (action: CustomerAppointment['actions'][number]) => appt.actions.includes(action);
  const confirmed = appt.start !== null;
  return (
    <Card variant="plain" padding="lg" as="article" className="flex h-full flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h3 className="text-base font-semibold text-text">{appt.service_name}</h3>
          {(appt.variant_label || appt.addon_labels.length > 0) && (
            <p className="text-xs text-text-muted">
              {[appt.variant_label, ...appt.addon_labels].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <StatusBadge status={appt.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-md gap-y-sm text-sm">
        <div>
          <dt className="text-xs text-text-muted">{confirmed ? 'When' : 'Preferred time'}</dt>
          <dd className="font-medium text-text">
            {formatDateTime(appt.start ?? appt.preferred_start)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Stylist</dt>
          <dd className="font-medium text-text">
            {appt.stylist_name ?? appt.preferred_stylist_name ?? 'To be assigned'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Duration</dt>
          <dd className="font-medium text-text">{formatDuration(appt.duration_minutes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Total (incl. GST)</dt>
          <dd className="font-medium text-text">{formatINR(appt.price_total)}</dd>
        </div>
      </dl>

      <VisitProducts appt={appt} />

      {appt.chat_thread_id && (
        <Link
          to={`/customer/chat/${appt.chat_thread_id}`}
          className="w-fit text-sm font-semibold text-primary-hover underline"
        >
          Message {appt.stylist_name ?? 'your stylist'}
        </Link>
      )}

      {appt.status === 'requested' && (
        <p className="rounded-nested bg-primary-soft px-md py-sm text-sm text-text">
          Waiting for the salon to confirm. You will get an email with a payment link.
        </p>
      )}
      {appt.status === 'awaiting_payment' && appt.awaiting_payment_until && (
        <p className="rounded-nested bg-warning-soft px-md py-sm text-sm text-text">
          Pay {formatINR(appt.amount_payable)} by {formatDateTime(appt.awaiting_payment_until)} to
          keep this slot.
        </p>
      )}
      {appt.status === 'payment_expired' && (
        <p className="rounded-nested bg-surface-muted px-md py-sm text-sm text-text">
          The payment time ran out and the slot was released. The salon can confirm it again.
        </p>
      )}
      {appt.status === 'rejected' && (
        <p className="rounded-nested bg-danger-soft px-md py-sm text-sm text-text">
          We could not confirm this request{appt.reject_reason ? `: ${appt.reject_reason}` : '.'}
        </p>
      )}
      {appt.reschedule_requested && (
        <p className="text-xs text-text-muted">
          Reschedule requested
          {appt.reschedule_preferred ? ` for ${formatDateTime(appt.reschedule_preferred)}` : ''}.
          The salon will contact you.
        </p>
      )}
      {appt.cancel_requested && (
        <p className="text-xs text-text-muted">
          Cancellation requested. The salon will contact you.
        </p>
      )}
      {appt.arrived_at && (
        <p className="text-xs text-success-text">You told us you have arrived.</p>
      )}
      {appt.status === 'scheduled' && appt.free_cancel_until && (
        <p className="text-xs text-text-muted">
          Free cancellation until {formatDateTime(appt.free_cancel_until)}.
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-sm">
        {has('pay') && (
          <Link
            to={`/customer/pay/${appt.id}`}
            className="inline-flex h-10 items-center rounded-full bg-primary px-lg text-sm font-semibold text-on-primary hover:bg-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
          >
            Pay now
          </Link>
        )}
        {has('resend_link') && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAct(appt, 'resend-link')}
          >
            Resend link
          </Button>
        )}
        {has('arrived') && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAct(appt, 'arrived')}
          >
            I&apos;m here
          </Button>
        )}
        {has('reschedule') && (
          <Button size="sm" variant="ghost" onClick={() => onDialog({ kind: 'reschedule', appt })}>
            Reschedule
          </Button>
        )}
        {has('cancel') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDialog({ kind: 'cancel', appt, late: false })}
          >
            Cancel
          </Button>
        )}
        {has('request_cancel') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDialog({ kind: 'cancel', appt, late: true })}
          >
            Request cancellation
          </Button>
        )}
      </div>
    </Card>
  );
}
