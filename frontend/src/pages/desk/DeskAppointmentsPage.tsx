import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { conflictSlots } from '../../api/booking';
import { classifyError } from '../../api/client';
import {
  confirmRequest,
  getConfirmOptions,
  listDeskAppointments,
  rejectRequest,
  resendPaymentLink,
  type DeskAppointment,
  type DeskFilter,
} from '../../api/desk';
import { SlotPicker } from '../../components/booking/SlotPicker';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  useToast,
  type TabItem,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  formatDateTime,
  formatDay,
  formatDuration,
  formatINR,
  SHOP_TIME_ZONE,
} from '../../lib/format';

const tabLabels: Record<DeskFilter, string> = {
  requested: 'New requests',
  awaiting_payment: 'Awaiting payment',
  payment_expired: 'Payment expired',
  scheduled: 'Scheduled',
  closed: 'Closed',
};
const filters = Object.keys(tabLabels) as DeskFilter[];

const shopDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date(iso));

/**
 * Receptionist and admin: booking requests as cards, with confirm (stylist, time, room) and
 * reject. The full request cards and schedule board arrive in Task 3.
 */
export default function DeskAppointmentsPage() {
  useDocumentTitle('Appointments');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DeskFilter>('requested');
  const [confirming, setConfirming] = useState<DeskAppointment | null>(null);
  const [rejecting, setRejecting] = useState<DeskAppointment | null>(null);

  const list = useQuery({
    queryKey: ['desk-appointments', filter],
    queryFn: () => listDeskAppointments(filter),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['desk-appointments'] });

  const resend = useMutation({
    mutationFn: (id: string) => resendPaymentLink(id),
    onSuccess: (appt) => {
      refresh();
      toast.show({ tone: 'success', title: `Payment link sent to ${appt.customer_email}` });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Link not sent',
        description: genericErrorMessage(error, 'Please try again.'),
      }),
  });

  const tabs: TabItem<DeskFilter>[] = filters.map((id) => ({
    id,
    label: list.data ? `${tabLabels[id]} (${list.data.counts[id]})` : tabLabels[id],
  }));

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="Appointments"
        description="Confirm booking requests with a stylist, time and room. The customer then gets a payment link."
      />
      <Tabs
        items={tabs}
        value={filter}
        onChange={setFilter}
        label="Appointment status"
        idPrefix="desk"
      />

      <div role="tabpanel" id={`desk-panel-${filter}`} aria-labelledby={`desk-tab-${filter}`}>
        {list.isPending ? (
          <LoadingState label="Loading appointments…" />
        ) : list.isError ? (
          <ErrorState
            description="We couldn't load the appointments."
            onRetry={() => void list.refetch()}
          />
        ) : list.data.results.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title={`Nothing in “${tabLabels[filter]}”`}
            description="New booking requests from customers appear here."
          />
        ) : (
          <ul className="grid gap-md lg:grid-cols-2">
            {list.data.results.map((appt) => (
              <li key={appt.id}>
                <RequestCard
                  appt={appt}
                  busy={resend.isPending}
                  onConfirm={() => setConfirming(appt)}
                  onReject={() => setRejecting(appt)}
                  onResend={() => resend.mutate(appt.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirming && (
        <ConfirmDrawer
          appt={confirming}
          onClose={() => setConfirming(null)}
          onDone={() => {
            setConfirming(null);
            refresh();
          }}
        />
      )}
      {rejecting && (
        <RejectModal
          appt={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function RequestCard({
  appt,
  busy,
  onConfirm,
  onReject,
  onResend,
}: {
  appt: DeskAppointment;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onResend: () => void;
}) {
  const can = (action: DeskAppointment['actions'][number]) => appt.actions.includes(action);
  return (
    <Card variant="plain" padding="lg" as="article" className="flex h-full flex-col gap-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="text-base font-semibold text-text">{appt.service_name}</h2>
          <p className="text-xs text-text-muted">
            {[appt.variant_label, ...appt.addon_labels].filter(Boolean).join(' · ') ||
              formatDuration(appt.duration_minutes)}
          </p>
        </div>
        <StatusBadge status={appt.status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-md gap-y-sm text-sm">
        <div>
          <dt className="text-xs text-text-muted">Customer</dt>
          <dd className="font-medium text-text">{appt.customer_name}</dd>
          <dd className="text-xs text-text-muted">{appt.customer_phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">
            {appt.start ? 'Booked for' : 'Preferred time'}
          </dt>
          <dd className="font-medium text-text">
            {formatDateTime(appt.start ?? appt.preferred_start)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Stylist</dt>
          <dd className="font-medium text-text">
            {appt.stylist_name ?? appt.preferred_stylist_name ?? 'Any available'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Total (incl. GST)</dt>
          <dd className="font-medium text-text">{formatINR(appt.price_total)}</dd>
        </div>
        {appt.room_name && (
          <div>
            <dt className="text-xs text-text-muted">Room</dt>
            <dd className="font-medium text-text">{appt.room_name}</dd>
          </div>
        )}
      </dl>
      {appt.allergies && (
        <p className="rounded-nested bg-warning-soft px-md py-sm text-sm text-text">
          <span className="font-semibold">Allergies:</span> {appt.allergies}
        </p>
      )}
      {appt.notes && (
        <p className="text-sm text-text-muted">
          <span className="font-medium text-text">Notes:</span> {appt.notes}
        </p>
      )}
      {appt.status === 'awaiting_payment' && appt.awaiting_payment_until && (
        <p className="text-xs text-text-muted">
          Slot held until {formatDateTime(appt.awaiting_payment_until)}.
        </p>
      )}
      {appt.reject_reason && (
        <p className="text-xs text-text-muted">Rejected: {appt.reject_reason}</p>
      )}
      {(appt.reschedule_requested || appt.cancel_requested || appt.arrived_at) && (
        <ul className="flex flex-col gap-1 text-xs text-text-muted">
          {appt.reschedule_requested && (
            <li>
              Customer asked to reschedule
              {appt.reschedule_preferred ? ` to ${formatDateTime(appt.reschedule_preferred)}` : ''}
              {appt.reschedule_note ? `: ${appt.reschedule_note}` : ''}
            </li>
          )}
          {appt.cancel_requested && <li>Customer asked to cancel.</li>}
          {appt.arrived_at && <li>Customer says they have arrived.</li>}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-sm">
        {can('confirm') && (
          <Button size="sm" onClick={onConfirm}>
            {appt.status === 'payment_expired' ? 'Confirm again' : 'Confirm'}
          </Button>
        )}
        {can('reject') && (
          <Button size="sm" variant="ghost" onClick={onReject}>
            Reject
          </Button>
        )}
        {can('resend_link') && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onResend}>
            Resend payment link
          </Button>
        )}
      </div>
    </Card>
  );
}

function ConfirmDrawer({
  appt,
  onClose,
  onDone,
}: {
  appt: DeskAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(shopDay(appt.preferred_start));
  const [stylist, setStylist] = useState(appt.preferred_stylist_id ?? '');
  const [room, setRoom] = useState('');
  const [start, setStart] = useState('');
  const [problem, setProblem] = useState('');
  const [nearest, setNearest] = useState<string[]>([]);

  const options = useQuery({
    queryKey: ['desk-options', appt.id, date, stylist, room],
    queryFn: () => getConfirmOptions(appt.id, { date, stylist, room }),
  });

  const confirm = useMutation({
    mutationFn: () => confirmRequest(appt.id, { stylist, start, room: room || null }),
    onSuccess: (done) => {
      toast.show({
        tone: 'success',
        title: 'Confirmed',
        description: `Payment link emailed to ${done.customer_email}.`,
      });
      onDone();
    },
    onError: (error) => {
      const slots = conflictSlots(error);
      if (slots.length || classifyError(error) === 'conflict') {
        setNearest(slots);
        setStart('');
        void options.refetch();
      }
      setProblem(genericErrorMessage(error, 'Could not confirm. Please try again.'));
    },
  });

  const submit = () => {
    setProblem('');
    if (!stylist) return setProblem('Choose a stylist.');
    if (!start) return setProblem('Choose a start time.');
    confirm.mutate();
  };

  const data = options.data;
  return (
    <Drawer
      open
      onClose={onClose}
      title="Confirm booking"
      description={`${appt.service_name} for ${appt.customer_name} · ${formatDuration(appt.duration_minutes)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={confirm.isPending} onClick={submit}>
            Confirm and send payment link
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-sm text-text-muted">
          Customer asked for {formatDateTime(appt.preferred_start)}
          {appt.preferred_stylist_name ? ` with ${appt.preferred_stylist_name}` : ''}.
        </p>
        <Select
          label="Stylist"
          required
          placeholder="Choose a stylist"
          value={stylist}
          onChange={(event) => {
            setStylist(event.target.value);
            setStart('');
          }}
          options={(data?.stylists ?? []).map((s) => ({
            value: s.id,
            label: `${s.display_name}${s.preferred ? ' (requested)' : ''}${s.free_at_preferred ? '' : ' · busy at requested time'}`,
          }))}
        />
        <Select
          label="Room (optional)"
          placeholder="No room"
          value={room}
          onChange={(event) => {
            setRoom(event.target.value);
            setStart('');
          }}
          options={(data?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-date" className="text-sm font-medium text-text">
            Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="confirm-date"
            type="date"
            required
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setStart('');
            }}
            className="h-11 w-full rounded-input border border-border bg-surface px-4 text-sm text-text focus-visible:shadow-focus focus-visible:outline-none"
          />
          <p className="text-xs text-text-muted">{date ? formatDay(date) : ''}</p>
        </div>
        {nearest.length > 0 && (
          <div className="rounded-nested bg-warning-soft p-md">
            <SlotPicker
              label="Nearest free times"
              slots={nearest}
              value={start}
              onChange={(iso) => {
                setStart(iso);
                setDate(shopDay(iso));
              }}
              format={formatDateTime}
            />
          </div>
        )}
        {options.isPending ? (
          <LoadingState label="Finding free times…" lines={2} />
        ) : options.isError ? (
          <ErrorState
            description="We couldn't load the free times."
            onRetry={() => void options.refetch()}
          />
        ) : data && data.slots.length === 0 ? (
          <p className="rounded-nested bg-surface-muted p-md text-sm text-text-muted">
            No free times on this day{stylist ? ' for this stylist' : ''}. Try another day or
            stylist.
          </p>
        ) : (
          data && (
            <SlotPicker label="Start time" slots={data.slots} value={start} onChange={setStart} />
          )
        )}
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Drawer>
  );
}

function RejectModal({
  appt,
  onClose,
  onDone,
}: {
  appt: DeskAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const reject = useMutation({
    mutationFn: () => rejectRequest(appt.id, reason.trim()),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: 'Request rejected',
        description: 'The customer was emailed the reason.',
      });
      onDone();
    },
    onError: (error) =>
      setProblem(genericErrorMessage(error, 'Could not reject. Please try again.')),
  });
  const submit = () => {
    if (reason.trim().length < 3) {
      setProblem('Give a short reason. The customer will see it.');
      return;
    }
    setProblem('');
    reject.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Reject this request?"
      description={`${appt.service_name} for ${appt.customer_name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep request
          </Button>
          <Button variant="danger" loading={reject.isPending} onClick={submit}>
            Reject request
          </Button>
        </>
      }
    >
      <Textarea
        label="Reason (sent to the customer)"
        required
        maxLength={300}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={problem}
      />
    </Modal>
  );
}
