import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  checkInAppointment,
  declineRequest,
  listDeskAppointments,
  markNoShow,
  rejectRequest,
  resendPaymentLink,
  type DeskAction,
  type DeskAppointment,
  type DeskFilter,
} from '../../api/desk';
import { CancelModal } from '../../components/desk/CancelModal';
import { PlacementDrawer } from '../../components/desk/PlacementDrawer';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  StatusBadge,
  Tabs,
  Textarea,
  useToast,
  type TabItem,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatDuration, formatINR } from '../../lib/format';

const tabLabels: Record<DeskFilter, string> = {
  requested: 'New requests',
  awaiting_payment: 'Awaiting payment',
  payment_expired: 'Payment expired',
  scheduled: 'Scheduled',
  flags: 'Customer requests',
  closed: 'Closed',
};
const filters = Object.keys(tabLabels) as DeskFilter[];

/**
 * Receptionist and admin: booking requests and appointments as cards. Confirm or reject new
 * requests, move or cancel held and scheduled visits, mark no-shows, and answer customers who
 * asked to reschedule or cancel.
 */
export default function DeskAppointmentsPage() {
  useDocumentTitle('Appointments');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DeskFilter>('requested');
  const [placing, setPlacing] = useState<{
    appt: DeskAppointment;
    mode: 'confirm' | 'move';
  } | null>(null);
  const [rejecting, setRejecting] = useState<DeskAppointment | null>(null);
  const [cancelling, setCancelling] = useState<DeskAppointment | null>(null);

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

  const checkIn = useMutation({
    mutationFn: (id: string) => checkInAppointment(id),
    onSuccess: (appt) => {
      refresh();
      toast.show({ tone: 'success', title: `${appt.customer_name} checked in` });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Not checked in',
        description: genericErrorMessage(error, 'Please try again.'),
      }),
  });

  const noShow = useMutation({
    mutationFn: (id: string) => markNoShow(id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Marked as no-show' });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Not changed',
        description: genericErrorMessage(error, 'Please try again.'),
      }),
  });

  const decline = useMutation({
    mutationFn: (input: { id: string; flag: 'reschedule' | 'cancel' }) =>
      declineRequest(input.id, input.flag),
    onSuccess: () => {
      refresh();
      toast.show({
        tone: 'success',
        title: 'Request declined',
        description: 'The booking stays as it is. The customer was emailed.',
      });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Not changed',
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
                  busy={
                    resend.isPending || noShow.isPending || decline.isPending || checkIn.isPending
                  }
                  onAct={(action) => {
                    if (action === 'confirm') setPlacing({ appt, mode: 'confirm' });
                    else if (action === 'move') setPlacing({ appt, mode: 'move' });
                    else if (action === 'reject') setRejecting(appt);
                    else if (action === 'cancel') setCancelling(appt);
                    else if (action === 'resend_link') resend.mutate(appt.id);
                    else if (action === 'no_show') noShow.mutate(appt.id);
                    else if (action === 'check_in') checkIn.mutate(appt.id);
                    else if (action === 'decline_reschedule')
                      decline.mutate({ id: appt.id, flag: 'reschedule' });
                    else if (action === 'decline_cancel')
                      decline.mutate({ id: appt.id, flag: 'cancel' });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {placing && (
        <PlacementDrawer
          appt={placing.appt}
          mode={placing.mode}
          onClose={() => setPlacing(null)}
          onDone={() => {
            setPlacing(null);
            refresh();
          }}
        />
      )}
      {cancelling && (
        <CancelModal
          appt={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
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
  onAct,
}: {
  appt: DeskAppointment;
  busy: boolean;
  onAct: (action: DeskAction) => void;
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
      {(appt.reschedule_requested ||
        appt.cancel_requested ||
        (appt.arrived_at && appt.status === 'scheduled')) && (
        <ul className="flex flex-col gap-1 text-xs text-text-muted">
          {appt.reschedule_requested && (
            <li>
              Customer asked to reschedule
              {appt.reschedule_preferred ? ` to ${formatDateTime(appt.reschedule_preferred)}` : ''}
              {appt.reschedule_note ? `: ${appt.reschedule_note}` : ''}
            </li>
          )}
          {appt.cancel_requested && <li>Customer asked to cancel.</li>}
          {appt.arrived_at && appt.status === 'scheduled' && (
            <li>Customer says they have arrived.</li>
          )}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-sm">
        {can('check_in') && (
          <Button size="sm" disabled={busy} onClick={() => onAct('check_in')}>
            Check in
          </Button>
        )}
        {can('confirm') && (
          <Button size="sm" onClick={() => onAct('confirm')}>
            {appt.status === 'payment_expired' ? 'Confirm again' : 'Confirm'}
          </Button>
        )}
        {can('reject') && (
          <Button size="sm" variant="ghost" onClick={() => onAct('reject')}>
            Reject
          </Button>
        )}
        {can('resend_link') && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAct('resend_link')}
          >
            Resend payment link
          </Button>
        )}
        {can('move') && (
          <Button size="sm" variant="secondary" onClick={() => onAct('move')}>
            Move to…
          </Button>
        )}
        {can('decline_reschedule') && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAct('decline_reschedule')}
          >
            Decline reschedule
          </Button>
        )}
        {can('decline_cancel') && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct('decline_cancel')}>
            Decline cancel request
          </Button>
        )}
        {can('no_show') && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct('no_show')}>
            Mark no-show
          </Button>
        )}
        {can('cancel') && (
          <Button size="sm" variant="ghost" onClick={() => onAct('cancel')}>
            Cancel booking
          </Button>
        )}
      </div>
    </Card>
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
      busy={reject.isPending}
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
