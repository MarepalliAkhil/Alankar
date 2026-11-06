import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { classifyError, errorDetail } from '../../api/client';
import {
  confirmRequest,
  getConfirmOptions,
  reassignRequest,
  type ChangeReason,
  type DeskAppointment,
} from '../../api/desk';
import { formatDateTime, formatDuration, SHOP_TIME_ZONE } from '../../lib/format';
import { Button, Drawer, ErrorState, LoadingState, Select, useToast } from '../ui';
import { ReasonSelect } from './ReasonSelect';

const shopDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date(iso));

interface AcceptDrawerProps {
  appt: DeskAppointment;
  /** `accept` is the front desk's yes; `reassign` hands the request to another stylist. */
  mode: 'accept' | 'reassign';
  onClose: () => void;
  onDone: () => void;
}

/**
 * The front desk's side of a booking request. The time stays the one the customer asked for.
 * Accepting does not book anything on its own: the stylist has to accept too. For an "any
 * available" request the desk picks the stylist here, and the request then goes to that stylist.
 */
export function AcceptDrawer({ appt, mode, onClose, onDone }: AcceptDrawerProps) {
  const toast = useToast();
  const reassigning = mode === 'reassign';
  const needsStylist = reassigning || !appt.asked_stylist_id;
  const [stylist, setStylist] = useState('');
  const [room, setRoom] = useState('');
  const [reason, setReason] = useState<ChangeReason | ''>(reassigning ? 'stylist_unavailable' : '');
  const [problem, setProblem] = useState('');

  const options = useQuery({
    queryKey: ['desk-options', appt.id, shopDay(appt.preferred_start), 'accept'],
    queryFn: () => getConfirmOptions(appt.id, { date: shopDay(appt.preferred_start) }),
  });

  const save = useMutation({
    mutationFn: () =>
      reassigning
        ? reassignRequest(appt.id, { stylist, reason: reason as ChangeReason })
        : confirmRequest(appt.id, { stylist: stylist || null, room: room || null }),
    onSuccess: (done) => {
      const booked = done.status === 'awaiting_payment' || done.status === 'scheduled';
      toast.show(
        reassigning
          ? {
              tone: 'success',
              title: 'Request sent to the new stylist',
              description: 'They need to accept it. The customer was told.',
            }
          : booked
            ? {
                tone: 'success',
                title: 'Both sides accepted',
                description: `Payment link emailed to ${done.customer_email}.`,
              }
            : {
                tone: 'success',
                title: 'You accepted',
                description: 'The booking is made once the stylist accepts too.',
              },
      );
      onDone();
    },
    onError: (error) =>
      setProblem(
        classifyError(error) === 'conflict'
          ? (errorDetail(error) ?? 'That time is no longer free.')
          : (errorDetail(error) ?? genericErrorMessage(error, 'Could not save. Please try again.')),
      ),
  });

  const submit = () => {
    setProblem('');
    if (needsStylist && !stylist) return setProblem('Choose a stylist.');
    if (reassigning && !reason) return setProblem('Choose a reason first.');
    save.mutate();
  };

  const data = options.data;
  const choices = (data?.stylists ?? []).filter((s) => s.id !== appt.asked_stylist_id);
  return (
    <Drawer
      open
      onClose={onClose}
      title={reassigning ? 'Give to another stylist' : 'Accept this request'}
      description={`${appt.service_name} for ${appt.customer_name} · ${formatDuration(appt.duration_minutes)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {reassigning ? 'Send to stylist' : 'Accept request'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-sm text-text-muted">
          Customer asked for {formatDateTime(appt.preferred_start)}
          {appt.preferred_stylist_name ? ` with ${appt.preferred_stylist_name}` : ' (any stylist)'}.
          {reassigning
            ? ' The new stylist has to accept for themself. The time does not change.'
            : needsStylist
              ? ' Choose a stylist: the request goes to them next.'
              : ' The stylist has to accept too before the customer gets a payment link.'}
        </p>
        {options.isPending ? (
          <LoadingState label="Loading stylists…" lines={2} />
        ) : options.isError ? (
          <ErrorState
            description="We couldn't load the stylists."
            onRetry={() => void options.refetch()}
          />
        ) : (
          <>
            {needsStylist && (
              <Select
                label="Stylist"
                required
                placeholder="Choose a stylist"
                value={stylist}
                onChange={(event) => setStylist(event.target.value)}
                options={choices.map((s) => ({
                  value: s.id,
                  label: `${s.display_name}${s.free_at_preferred ? '' : ' · busy at that time'}`,
                }))}
              />
            )}
            {!reassigning && (
              <Select
                label="Room (optional)"
                placeholder="No room"
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                options={(data?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))}
              />
            )}
          </>
        )}
        {reassigning && <ReasonSelect value={reason} onChange={setReason} />}
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Drawer>
  );
}
