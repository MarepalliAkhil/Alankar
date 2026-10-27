import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { conflictSlots } from '../../api/booking';
import { classifyError, errorDetail } from '../../api/client';
import {
  confirmRequest,
  getConfirmOptions,
  moveAppointment,
  type DeskAppointment,
} from '../../api/desk';
import { Button, Drawer, ErrorState, LoadingState, Select, useToast } from '../ui';
import { formatDateTime, formatDay, formatDuration, SHOP_TIME_ZONE } from '../../lib/format';
import { SlotPicker } from '../booking/SlotPicker';

const shopDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date(iso));

interface PlacementDrawerProps {
  appt: DeskAppointment;
  /** `confirm` places a new request (and emails the payment link); `move` changes a booking. */
  mode: 'confirm' | 'move';
  onClose: () => void;
  onDone: () => void;
}

/**
 * Stylist, room and start time for one appointment. Used to confirm a request and to move a
 * held or scheduled booking: both go through the same server-side conflict check, and a clash
 * offers the nearest free times.
 */
export function PlacementDrawer({ appt, mode, onClose, onDone }: PlacementDrawerProps) {
  const toast = useToast();
  const moving = mode === 'move';
  const firstDay = moving
    ? shopDay(appt.reschedule_preferred ?? appt.start ?? appt.preferred_start)
    : shopDay(appt.preferred_start);
  const [date, setDate] = useState(firstDay);
  const [stylist, setStylist] = useState(
    (moving ? appt.stylist_id : appt.preferred_stylist_id) ?? '',
  );
  const [room, setRoom] = useState(moving ? (appt.room_id ?? '') : '');
  const [start, setStart] = useState('');
  const [problem, setProblem] = useState('');
  const [nearest, setNearest] = useState<string[]>([]);

  const options = useQuery({
    queryKey: ['desk-options', appt.id, date, stylist, room],
    queryFn: () => getConfirmOptions(appt.id, { date, stylist, room }),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = { stylist, start, room: room || null };
      return moving ? moveAppointment(appt.id, payload) : confirmRequest(appt.id, payload);
    },
    onSuccess: (done) => {
      toast.show(
        moving
          ? { tone: 'success', title: 'Booking moved', description: 'The customer was emailed.' }
          : {
              tone: 'success',
              title: 'Confirmed',
              description: `Payment link emailed to ${done.customer_email}.`,
            },
      );
      onDone();
    },
    onError: (error) => {
      const slots = conflictSlots(error);
      if (slots.length || classifyError(error) === 'conflict') {
        setNearest(slots);
        setStart('');
        void options.refetch();
      }
      setProblem(
        classifyError(error) === 'conflict'
          ? (errorDetail(error) ?? 'That time is no longer free.')
          : genericErrorMessage(error, 'Could not save. Please try again.'),
      );
    },
  });

  const submit = () => {
    setProblem('');
    if (!stylist) return setProblem('Choose a stylist.');
    if (!start) return setProblem('Choose a start time.');
    save.mutate();
  };

  const data = options.data;
  return (
    <Drawer
      open
      onClose={onClose}
      title={moving ? 'Move booking' : 'Confirm booking'}
      description={`${appt.service_name} for ${appt.customer_name} · ${formatDuration(appt.duration_minutes)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {moving ? 'Move booking' : 'Confirm and send payment link'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-sm text-text-muted">
          {moving ? (
            <>
              Now {appt.start ? formatDateTime(appt.start) : 'not placed'}
              {appt.stylist_name ? ` with ${appt.stylist_name}` : ''}.
              {appt.reschedule_requested && appt.reschedule_preferred
                ? ` Customer asked for ${formatDateTime(appt.reschedule_preferred)}.`
                : ''}
            </>
          ) : (
            <>
              Customer asked for {formatDateTime(appt.preferred_start)}
              {appt.preferred_stylist_name ? ` with ${appt.preferred_stylist_name}` : ''}.
            </>
          )}
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
            label: `${s.display_name}${s.preferred ? ' (requested)' : ''}${
              !moving && !s.free_at_preferred ? ' · busy at requested time' : ''
            }`,
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
          <label htmlFor="placement-date" className="text-sm font-medium text-text">
            Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="placement-date"
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
