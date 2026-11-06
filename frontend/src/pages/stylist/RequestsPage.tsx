import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Inbox } from 'lucide-react';
import { useState } from 'react';
import { genericErrorMessage } from '../../api/auth-messages';
import { errorDetail } from '../../api/client';
import {
  acceptRequest,
  declineReasons,
  declineStylistRequest,
  listRequests,
  type DeclineReason,
  type StylistRequest,
} from '../../api/stylist';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Select,
  SkeletonCards,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../lib/format';
import { StylistError } from './common';

function timeLeft(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `${Math.max(1, minutes)} min left`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min left`;
}

const tone: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  accepted: 'success',
  declined: 'danger',
  pending: 'warning',
  not_asked: 'neutral',
};

/**
 * Stylist "Requests" inbox. A booking only happens when you AND the front desk both accept, so
 * each pending request shows how long is left, the guest's first name, the service and the time.
 * Accept re-checks that you are free; Decline asks for a private reason that only you and the
 * front desk see (the customer just gets a polite message).
 */
export default function RequestsPage() {
  useDocumentTitle('Requests');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState<StylistRequest | null>(null);
  const [reason, setReason] = useState<DeclineReason | ''>('');
  const [problem, setProblem] = useState('');

  const requests = useQuery({
    queryKey: ['stylist', 'requests'],
    queryFn: listRequests,
    refetchInterval: 30_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['stylist'] });

  const accept = useMutation({
    mutationFn: (id: string) => acceptRequest(id),
    onSuccess: (done) => {
      refresh();
      toast.show({
        tone: 'success',
        title: 'You accepted',
        description:
          done.booking_status === 'requested'
            ? 'The booking is made once the front desk accepts too.'
            : 'Both sides accepted, so the booking is made.',
      });
    },
    onError: (error) => {
      refresh();
      toast.show({
        tone: 'danger',
        title: 'Could not accept',
        description:
          errorDetail(error) ?? genericErrorMessage(error, 'Please try again in a moment.'),
      });
    },
  });

  const decline = useMutation({
    mutationFn: (input: { id: string; reason: DeclineReason }) =>
      declineStylistRequest(input.id, input.reason),
    onSuccess: () => {
      setDeclining(null);
      refresh();
      toast.show({
        tone: 'success',
        title: 'Request declined',
        description: 'The customer got a polite message. Your reason stays with the front desk.',
      });
    },
    onError: (error) =>
      setProblem(errorDetail(error) ?? genericErrorMessage(error, 'Could not decline.')),
  });

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="Requests"
        description="Customers who asked for you. A booking is made only when you and the front desk both accept."
      />
      {requests.isPending ? (
        <SkeletonCards count={3} label="Loading requests…" />
      ) : requests.isError ? (
        <StylistError error={requests.error} onRetry={() => void requests.refetch()} />
      ) : (
        <>
          <section aria-labelledby="pending-requests" className="flex flex-col gap-md">
            <h2 id="pending-requests" className="text-xl font-semibold text-text">
              Waiting for you ({requests.data.pending_count})
            </h2>
            {requests.data.pending.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-6 w-6" />}
                title="No requests waiting"
                description="New requests for you appear here, with the time left to answer."
              />
            ) : (
              <ul className="card-grid">
                {requests.data.pending.map((request) => (
                  <li key={request.id}>
                    <Card padding="md" className="flex h-full flex-col gap-sm">
                      <div className="flex items-start justify-between gap-sm">
                        <h3 className="text-lg font-semibold text-text">
                          {request.customer_first_name}
                        </h3>
                        <Badge tone="warning" icon={<Clock className="h-3.5 w-3.5" />}>
                          {timeLeft(request.minutes_left)}
                        </Badge>
                      </div>
                      <p className="text-base font-medium text-text">
                        {request.service_name}
                        {request.variant_label ? ` · ${request.variant_label}` : ''}
                      </p>
                      {request.addon_labels.length > 0 && (
                        <p className="text-sm text-text-muted">
                          + {request.addon_labels.join(', ')}
                        </p>
                      )}
                      <p className="text-sm text-text-muted">
                        {formatDateTime(request.start)} · {request.duration_minutes} min
                      </p>
                      {request.allergy_alert && (
                        <Badge tone="danger">Allergy alert: shown once the visit is booked</Badge>
                      )}
                      <p className="text-xs text-text-muted">
                        Front desk: {request.reception_status_label}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-sm pt-sm">
                        <Button
                          size="sm"
                          loading={accept.isPending && accept.variables === request.id}
                          disabled={accept.isPending}
                          onClick={() => accept.mutate(request.id)}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReason('');
                            setProblem('');
                            setDeclining(request);
                          }}
                        >
                          Decline
                        </Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {requests.data.answered.length > 0 && (
            <section aria-labelledby="answered-requests" className="flex flex-col gap-md">
              <h2 id="answered-requests" className="text-xl font-semibold text-text">
                Answered recently
              </h2>
              <ul className="card-grid">
                {requests.data.answered.map((request) => (
                  <li key={request.id}>
                    <Card variant="plain" padding="md" className="flex h-full flex-col gap-sm">
                      <div className="flex items-start justify-between gap-sm">
                        <h3 className="text-base font-semibold text-text">
                          {request.customer_first_name}
                        </h3>
                        <Badge tone={tone[request.my_status]}>You: {request.my_status_label}</Badge>
                      </div>
                      <p className="text-sm text-text">{request.service_name}</p>
                      <p className="text-sm text-text-muted">{formatDateTime(request.start)}</p>
                      <p className="text-xs text-text-muted">
                        Booking now: {request.booking_status_label}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {declining && (
        <Modal
          busy={decline.isPending}
          open
          onClose={() => setDeclining(null)}
          title="Decline this request?"
          description={`${declining.customer_first_name} · ${declining.service_name} · ${formatDateTime(declining.start)}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeclining(null)}>
                Keep request
              </Button>
              <Button
                variant="danger"
                loading={decline.isPending}
                onClick={() => {
                  if (!reason) return setProblem('Choose a reason first.');
                  setProblem('');
                  decline.mutate({ id: declining.id, reason });
                }}
              >
                Decline request
              </Button>
            </>
          }
        >
          <Select
            label="Your reason"
            hint="Only the front desk sees this. The customer gets a polite message and can choose another time or stylist."
            required
            placeholder="Choose a reason"
            value={reason}
            error={problem}
            onChange={(event) => setReason(event.target.value as DeclineReason | '')}
            options={declineReasons.map((r) => ({ value: r.value, label: r.label }))}
          />
        </Modal>
      )}
    </section>
  );
}
