import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorDetail } from '../../api/client';
import { completeVisit, getAppointment, startVisit } from '../../api/stylist';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  LoadingState,
  Modal,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';
import { StylistError } from './common';

/** One visit: what to know about the guest, Start, and Complete (with the services really done). */
export default function AppointmentDetailPage() {
  useDocumentTitle('Visit');
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const visit = useQuery({ queryKey: ['stylist', 'visit', id], queryFn: () => getAppointment(id) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stylist'] });
  const fail = (title: string) => (error: unknown) =>
    toast.show({
      title,
      description: errorDetail(error) ?? 'Please try again.',
      tone: 'danger',
    });
  const start = useMutation({
    mutationFn: () => startVisit(id),
    onSuccess: () => {
      void refresh();
      toast.show({ title: 'Service started', tone: 'success' });
    },
    onError: fail('Could not start'),
  });
  const complete = useMutation({
    mutationFn: () => completeVisit(id, done, note.trim()),
    onSuccess: () => {
      setCompleting(false);
      void refresh();
      toast.show({
        title: 'Service completed',
        description: 'The front desk will bill the services you marked as done.',
        tone: 'success',
      });
    },
    onError: fail('Could not complete'),
  });

  const data = visit.data;
  const openComplete = () => {
    setDone(data ? data.booked_services.map((s) => s.key) : []);
    setNote('');
    setCompleting(true);
  };
  const toggle = (key: string) =>
    setDone((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        eyebrow="Visit"
        title={data ? `${data.customer_first_name} · ${data.service_name}` : 'Visit'}
        description={data?.start ? formatDateTime(data.start) : undefined}
        actions={
          data && (
            <>
              {data.actions.includes('start') && (
                <Button loading={start.isPending} onClick={() => start.mutate()}>
                  Start service
                </Button>
              )}
              {data.actions.includes('complete') && (
                <Button onClick={openComplete}>Complete service</Button>
              )}
            </>
          )
        }
      />
      <Link className="text-sm font-semibold text-primary-hover underline" to="/my-appointments">
        Back to My Appointments
      </Link>
      {visit.isPending ? (
        <LoadingState label="Loading the visit…" />
      ) : visit.isError || !data ? (
        <StylistError error={visit.error} onRetry={() => void visit.refetch()} />
      ) : (
        <div className="grid gap-md lg:grid-cols-2">
          <Card className="flex flex-col gap-sm">
            <div className="flex items-center justify-between gap-sm">
              <h2 className="text-lg font-semibold text-text">Service</h2>
              <Badge>{data.status_label}</Badge>
            </div>
            <ul className="list-disc pl-lg text-sm text-text">
              {data.booked_services.map((s) => (
                <li key={s.key}>{s.label}</li>
              ))}
            </ul>
            <p className="text-sm text-text-muted">
              {data.duration_minutes} min{data.room_name ? ` · ${data.room_name}` : ''}
            </p>
            {data.completion && (
              <div className="rounded-input bg-surface p-md text-sm">
                <p className="font-semibold text-text">Completed</p>
                <p className="text-text-muted">Done: {data.completion.done.join(', ')}</p>
                {data.completion.removed.length > 0 && (
                  <p className="text-warning-text">
                    Not done: {data.completion.removed.join(', ')}
                  </p>
                )}
                {data.completion.note && (
                  <p className="text-text-muted">Your note: {data.completion.note}</p>
                )}
              </div>
            )}
          </Card>
          <Card className="flex flex-col gap-sm">
            <h2 className="text-lg font-semibold text-text">About the guest</h2>
            {data.allergies ? (
              <p className="rounded-input bg-danger-soft p-md text-sm text-danger-text">
                Allergies: {data.allergies}
              </p>
            ) : (
              <p className="text-sm text-text-muted">No allergies on file.</p>
            )}
            <p className="text-sm text-text">
              Preferences and notes: {data.preferences || 'None on file.'}
            </p>
            <h3 className="pt-sm text-sm font-semibold text-text">Your past visits together</h3>
            {data.history.length === 0 ? (
              <p className="text-sm text-text-muted">This is your first visit with this guest.</p>
            ) : (
              <ul className="text-sm text-text-muted">
                {data.history.map((h, index) => (
                  <li key={index}>
                    {h.date && formatDateTime(h.date)} · {h.service_name}
                    {h.variant_label ? ` · ${h.variant_label}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      <Modal
        busy={complete.isPending}
        open={completing}
        onClose={() => setCompleting(false)}
        title="Complete the service"
        description="Tick only what you really did. Services you leave out are not billed and the front desk will see that."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCompleting(false)}>
              Cancel
            </Button>
            <Button
              loading={complete.isPending}
              disabled={done.length === 0}
              onClick={() => complete.mutate()}
            >
              Complete
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          {data?.booked_services.map((s) => (
            <Checkbox
              key={s.key}
              label={s.label}
              checked={done.includes(s.key)}
              onChange={() => toggle(s.key)}
            />
          ))}
          <Textarea
            label="Note for the front desk (optional)"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </Modal>
    </section>
  );
}
