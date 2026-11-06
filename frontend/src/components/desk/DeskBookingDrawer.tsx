import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { conflictSlots } from '../../api/booking';
import { classifyError, errorDetail } from '../../api/client';
import { createDeskBooking, getDeskSlots } from '../../api/customers';
import { getServices } from '../../api/public';
import {
  formatDateTime,
  formatDay,
  formatDuration,
  formatINR,
  SHOP_TIME_ZONE,
} from '../../lib/format';
import { SlotPicker } from '../booking/SlotPicker';
import {
  Button,
  Checkbox,
  Drawer,
  ErrorState,
  LoadingState,
  Select,
  Textarea,
  useToast,
} from '../ui';

const shopDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(new Date(iso));

/**
 * A walk-in or phone booking for an existing customer. The visit goes straight to scheduled
 * (or checked in for a guest who is here now); payment is taken at checkout. The server runs
 * the same overlap check as a confirmed request and offers the nearest free times on a clash.
 */
export function DeskBookingDrawer({
  customer,
  onClose,
  onDone,
}: {
  customer: { id: string; full_name: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const today = shopDay(new Date().toISOString());
  const [serviceSlug, setServiceSlug] = useState('');
  const [variant, setVariant] = useState('');
  const [addons, setAddons] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('');
  const [stylist, setStylist] = useState('');
  const [room, setRoom] = useState('');
  const [source, setSource] = useState<'walk_in' | 'phone'>('walk_in');
  const [notes, setNotes] = useState('');
  const [checkInNow, setCheckInNow] = useState(false);
  const [problem, setProblem] = useState('');
  const [nearest, setNearest] = useState<string[]>([]);

  const services = useQuery({ queryKey: ['services-all'], queryFn: () => getServices({}) });
  const service = services.data?.find((s) => s.slug === serviceSlug);

  const slots = useQuery({
    queryKey: ['desk-slots', serviceSlug, variant, addons, date],
    queryFn: () => getDeskSlots({ service: serviceSlug, variant, addons, date }),
    enabled: !!service && (service.variants.length === 0 || !!variant),
  });

  const chosen = useMemo(
    () => slots.data?.slots.find((slot) => slot.start === start),
    [slots.data, start],
  );
  const freeStylists = (slots.data?.stylists ?? []).filter((s) => chosen?.stylists.includes(s.id));

  const book = useMutation({
    mutationFn: () =>
      createDeskBooking({
        customer: customer.id,
        service: serviceSlug,
        variant: variant || null,
        addons,
        start,
        stylist,
        room: room || null,
        source,
        notes: notes.trim(),
        check_in_now: checkInNow,
      }),
    onSuccess: (appt) => {
      toast.show({
        tone: 'success',
        title: checkInNow ? 'Booked and checked in' : 'Visit booked',
        description: `${appt.service_name} for ${customer.full_name} at ${formatDateTime(appt.start ?? start)}.`,
      });
      onDone();
    },
    onError: (error) => {
      const near = conflictSlots(error);
      if (near.length || classifyError(error) === 'conflict') {
        setNearest(near);
        setStart('');
        setStylist('');
        void slots.refetch();
        setProblem(errorDetail(error) ?? 'That time is no longer free.');
      } else {
        setProblem(genericErrorMessage(error, 'Could not book. Please try again.'));
      }
    },
  });

  const submit = () => {
    setProblem('');
    if (!service) return setProblem('Choose a service.');
    if (service.variants.length > 0 && !variant) return setProblem('Choose an option.');
    if (!start) return setProblem('Choose a start time.');
    if (!stylist) return setProblem('Choose a stylist.');
    book.mutate();
  };

  const toggleAddon = (id: string) => {
    setAddons((current) =>
      current.includes(id) ? current.filter((a) => a !== id) : [...current, id],
    );
    setStart('');
    setStylist('');
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Book a visit"
      description={`For ${customer.full_name}. Payment is taken at checkout.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={book.isPending} onClick={submit}>
            {checkInNow ? 'Book and check in' : 'Book visit'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <Select
          label="How was it booked?"
          value={source}
          onChange={(event) => setSource(event.target.value as 'walk_in' | 'phone')}
          options={[
            { value: 'walk_in', label: 'Walk-in (guest is here)' },
            { value: 'phone', label: 'Phone call' },
          ]}
        />
        {services.isPending ? (
          <LoadingState label="Loading services…" lines={1} />
        ) : services.isError ? (
          <ErrorState
            description="We couldn't load the services."
            onRetry={() => void services.refetch()}
          />
        ) : (
          <Select
            label="Service"
            required
            placeholder="Choose a service"
            value={serviceSlug}
            onChange={(event) => {
              const next = services.data.find((s) => s.slug === event.target.value);
              setServiceSlug(event.target.value);
              setVariant(next?.variants.length === 1 ? next.variants[0].id : '');
              setAddons([]);
              setStart('');
              setStylist('');
            }}
            options={services.data.map((s) => ({ value: s.slug, label: s.name }))}
          />
        )}
        {service && service.variants.length > 0 && (
          <Select
            label="Option"
            required
            placeholder="Choose an option"
            value={variant}
            onChange={(event) => {
              setVariant(event.target.value);
              setStart('');
              setStylist('');
            }}
            options={service.variants.map((v) => ({
              value: v.id,
              label: `${v.label} · ${formatINR(v.price)} · ${formatDuration(v.duration_minutes)}`,
            }))}
          />
        )}
        {service && service.addons.length > 0 && (
          <fieldset className="flex flex-col gap-sm">
            <legend className="mb-1 text-sm font-medium text-text">Add-ons</legend>
            {service.addons.map((addon) => (
              <Checkbox
                key={addon.id}
                label={`${addon.label} · ${formatINR(addon.price)}`}
                checked={addons.includes(addon.id)}
                onChange={() => toggleAddon(addon.id)}
              />
            ))}
          </fieldset>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="desk-booking-date" className="text-sm font-medium text-text">
            Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="desk-booking-date"
            type="date"
            required
            min={today}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setStart('');
              setStylist('');
              setCheckInNow(false);
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
                setStylist('');
              }}
              format={formatDateTime}
            />
          </div>
        )}
        {service && (service.variants.length === 0 || variant) && (
          <>
            {slots.isPending ? (
              <LoadingState label="Finding free times…" lines={2} />
            ) : slots.isError ? (
              <ErrorState
                description="We couldn't load the free times."
                onRetry={() => void slots.refetch()}
              />
            ) : slots.data.slots.length === 0 ? (
              <p className="rounded-nested bg-surface-muted p-md text-sm text-text-muted">
                No free times on this day. Try another day.
              </p>
            ) : (
              <SlotPicker
                label={`Start time (${formatDuration(slots.data.duration_minutes)}, ${formatINR(slots.data.price_total)})`}
                slots={slots.data.slots.map((slot) => slot.start)}
                value={start}
                onChange={(iso) => {
                  setStart(iso);
                  setStylist('');
                }}
              />
            )}
          </>
        )}
        {start && (
          <Select
            label="Stylist"
            required
            placeholder="Choose a stylist"
            value={stylist}
            onChange={(event) => setStylist(event.target.value)}
            options={freeStylists.map((s) => ({ value: s.id, label: s.display_name }))}
          />
        )}
        {start && (
          <Select
            label="Room (optional)"
            placeholder="No room"
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            options={(slots.data?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))}
          />
        )}
        {date === today && (
          <Checkbox
            label="The guest is here now: check them in"
            checked={checkInNow}
            onChange={(event) => setCheckInNow(event.target.checked)}
          />
        )}
        <Textarea
          label="Notes for this visit (optional)"
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Drawer>
  );
}
