import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import { getBookingOptions } from '../../api/booking';
import { getServices } from '../../api/public';
import {
  acceptOffer,
  declineOffer,
  joinWaitlist,
  leaveWaitlist,
  listMyWaitlist,
  type WaitlistRow,
} from '../../api/wallet';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Textarea,
  useToast,
  type BadgeTone,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, shopLocalToIso } from '../../lib/format';

const TONE: Record<WaitlistRow['status'], BadgeTone> = {
  waiting: 'info',
  offered: 'warning',
  booked: 'success',
  cancelled: 'neutral',
  expired: 'neutral',
};

function minutesLeft(iso: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60000));
}

/** Customer: ask to be offered a slot when one frees up, and answer offers in time. */
export default function WaitlistPage() {
  useDocumentTitle('Waitlist');
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entries = useQuery({
    queryKey: ['my-waitlist'],
    queryFn: listMyWaitlist,
    refetchInterval: 30000,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['my-waitlist'] });
  const fail = (title: string) => (error: unknown) => {
    refresh();
    toast.show({
      tone: 'danger',
      title,
      description: genericErrorMessage(error, 'Please try again.'),
    });
  };
  const accept = useMutation({
    mutationFn: (id: string) => acceptOffer(id),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      toast.show({
        tone: 'success',
        title: 'Slot booked',
        description: 'Pay from My Appointments to keep it.',
      });
      void navigate('/customer/appointments');
    },
    onError: fail('That slot is no longer available'),
  });
  const decline = useMutation({
    mutationFn: (id: string) => declineOffer(id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Offer declined' });
    },
    onError: fail('Could not decline'),
  });
  const leave = useMutation({
    mutationFn: (id: string) => leaveWaitlist(id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Removed from the waitlist' });
    },
    onError: fail('Could not remove you'),
  });
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        title="Waitlist"
        description="No time that suits you? Tell us when you are free. If a slot opens up we offer it to you first-come first-served and hold it for a short time."
      />
      <JoinForm onJoined={refresh} />
      <Card variant="dense" as="section" aria-label="My waitlist">
        <h2 className="text-lg font-semibold text-text">My requests</h2>
        <div className="mt-sm">
          {entries.isPending ? (
            <LoadingState label="Loading your waitlist…" />
          ) : entries.isError ? (
            <ErrorState
              description="We couldn't load your waitlist."
              onRetry={() => void entries.refetch()}
            />
          ) : entries.data.length === 0 ? (
            <EmptyState title="You are not on a waitlist" description="Add a request above." />
          ) : (
            <ul className="flex flex-col gap-sm">
              {entries.data.map((e) => (
                <li key={e.id} className="rounded-nested border border-border p-md">
                  <div className="flex flex-wrap items-center gap-xs">
                    <p className="font-semibold text-text">{e.service_name}</p>
                    <Badge tone={TONE[e.status]}>{e.status_label}</Badge>
                    <span className="text-sm text-text-muted">{e.stylist_name}</span>
                  </div>
                  <p className="mt-xs text-xs text-text-muted">
                    Free {formatDateTime(e.window_start)} to {formatDateTime(e.window_end)}
                  </p>
                  {e.offer && e.status === 'offered' && (
                    <div className="mt-sm rounded-nested bg-warning-soft p-md">
                      <p className="font-medium text-warning-text">
                        A slot opened: {formatDateTime(e.offer.start)} with {e.offer.stylist_name}
                      </p>
                      <p className="text-sm text-warning-text">
                        Held for you for {minutesLeft(e.offer.expires_at, now)} more minute(s).
                      </p>
                      <div className="mt-sm flex flex-wrap gap-sm">
                        <Button
                          type="button"
                          size="sm"
                          loading={accept.isPending}
                          onClick={() => e.offer && accept.mutate(e.offer.id)}
                        >
                          Take this slot
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={accept.isPending}
                          onClick={() => e.offer && decline.mutate(e.offer.id)}
                        >
                          No thanks
                        </Button>
                      </div>
                    </div>
                  )}
                  {(e.status === 'waiting' || e.status === 'offered') && (
                    <div className="mt-sm">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={leave.isPending}
                        onClick={() => leave.mutate(e.id)}
                      >
                        Leave the waitlist
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}

function JoinForm({ onJoined }: { onJoined: () => void }) {
  const toast = useToast();
  const services = useQuery({ queryKey: ['wl-services'], queryFn: () => getServices({}) });
  const [form, setForm] = useState({
    service: '',
    variant: '',
    stylist: '',
    start: '',
    end: '',
    note: '',
  });
  const options = useQuery({
    queryKey: ['wl-options', form.service],
    queryFn: () => getBookingOptions(form.service),
    enabled: form.service !== '',
  });
  const [problem, setProblem] = useState('');
  const join = useMutation({
    mutationFn: () =>
      joinWaitlist({
        service: form.service,
        variant: form.variant || null,
        stylist: form.stylist || null,
        window_start: shopLocalToIso(form.start),
        window_end: shopLocalToIso(form.end),
        note: form.note.trim(),
      }),
    onSuccess: () => {
      setForm({ service: '', variant: '', stylist: '', start: '', end: '', note: '' });
      onJoined();
      toast.show({ tone: 'success', title: 'You are on the waitlist' });
    },
    onError: (error) =>
      setProblem(genericErrorMessage(error, 'Could not add you to the waitlist.')),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.service) return setProblem('Choose a service.');
    if (!form.start || !form.end) return setProblem('Choose when you are free.');
    if (form.end <= form.start) return setProblem('The end must be after the start.');
    setProblem('');
    join.mutate();
  };
  const service = services.data?.find((s) => s.id === form.service);
  return (
    <Card variant="dense" as="section" aria-label="Join the waitlist">
      <h2 className="text-lg font-semibold text-text">Add a request</h2>
      <form noValidate onSubmit={submit} className="mt-sm flex flex-col gap-md">
        <div className="grid gap-md sm:grid-cols-2">
          <Select
            label="Service"
            value={form.service}
            placeholder="Choose a service"
            options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(e) =>
              setForm((f) => ({ ...f, service: e.target.value, variant: '', stylist: '' }))
            }
          />
          {service && service.variants.length > 0 && (
            <Select
              label="Option"
              value={form.variant}
              placeholder="Any option"
              options={service.variants.map((v) => ({ value: v.id, label: v.label }))}
              onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value }))}
            />
          )}
          <Select
            label="Stylist"
            value={form.stylist}
            placeholder="Any stylist"
            options={(options.data?.stylists ?? []).map((s) => ({
              value: s.id,
              label: s.display_name,
            }))}
            onChange={(e) => setForm((f) => ({ ...f, stylist: e.target.value }))}
          />
          <Input
            label="Free from"
            type="datetime-local"
            value={form.start}
            onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
          />
          <Input
            label="Free until"
            type="datetime-local"
            value={form.end}
            onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
          />
        </div>
        <Textarea
          label="Note (optional)"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div>
          <Button type="submit" loading={join.isPending}>
            Join the waitlist
          </Button>
        </div>
      </form>
    </Card>
  );
}
