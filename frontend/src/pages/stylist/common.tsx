import { ArrowRight } from 'lucide-react';
import { Badge, Button, ButtonLink, Card, ErrorState } from '../../components/ui';
import { statusEdge } from '../../components/ui/status-styles';
import { cn } from '../../lib/cn';
import type { AppointmentStatus } from '../../types/appointment';
import { formatDateTime, formatTime } from '../../lib/format';
import type { StylistCard } from '../../api/stylist';
import { isNotLinked } from './not-linked';

/** Error panel for a stylist page: explains the not-linked case, otherwise offers a retry. */
export function StylistError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isNotLinked(error)) {
    return (
      <ErrorState
        title="Your account is not linked to a team profile yet"
        description="Ask the admin to link your account to your profile. Until then there is nothing to show here."
      />
    );
  }
  return <ErrorState description="We couldn't load this page." onRetry={onRetry} />;
}

const tones: Record<string, 'primary' | 'success' | 'warning' | 'neutral'> = {
  scheduled: 'primary',
  checked_in: 'warning',
  in_progress: 'warning',
  completed: 'success',
};

export function VisitTitle({ visit }: { visit: StylistCard }) {
  return (
    <>
      {visit.service_name}
      {visit.variant_label ? ` · ${visit.variant_label}` : ''}
    </>
  );
}

/** One visit as a card with a status edge. The stylist sees the guest's first name only.
 * Buttons use the actions that exist today: Start (checked in), Complete (in progress, opens the
 * visit where completing lives), Open, and Chat (while the visit is live). */
export function VisitCardView({
  visit,
  withDate = false,
  onStart,
  starting = false,
}: {
  visit: StylistCard;
  withDate?: boolean;
  onStart?: (id: string) => void;
  starting?: boolean;
}) {
  const live = ['scheduled', 'checked_in', 'in_progress'].includes(visit.status);
  const edge = statusEdge[visit.status as AppointmentStatus] ?? '';
  return (
    <Card padding="md" className={cn('flex h-full flex-col gap-sm', edge)}>
      <div className="flex items-start justify-between gap-sm">
        <h3 className="text-lg font-semibold text-text">{visit.customer_first_name}</h3>
        <Badge tone={tones[visit.status] ?? 'neutral'}>{visit.status_label}</Badge>
      </div>
      <p className="text-base font-medium text-text">
        <VisitTitle visit={visit} />
      </p>
      {visit.addon_labels.length > 0 && (
        <p className="text-sm text-text-muted">+ {visit.addon_labels.join(', ')}</p>
      )}
      <p className="text-sm text-text-muted">
        {visit.start && (withDate ? formatDateTime(visit.start) : formatTime(visit.start))}
        {` · ${visit.duration_minutes} min`}
        {visit.room_name ? ` · ${visit.room_name}` : ''}
      </p>
      {visit.allergy_alert && <Badge tone="danger">Allergy alert: open the visit to read it</Badge>}
      <div className="mt-auto flex flex-wrap gap-sm pt-sm">
        {onStart && visit.actions.includes('start') && (
          <Button size="sm" loading={starting} onClick={() => onStart(visit.id)}>
            Start
          </Button>
        )}
        {visit.actions.includes('complete') && (
          <ButtonLink size="sm" to={`/my-appointments/${visit.id}`}>
            Complete
          </ButtonLink>
        )}
        <ButtonLink
          size="sm"
          variant="secondary"
          to={`/my-appointments/${visit.id}`}
          aria-label={`Open visit with ${visit.customer_first_name}`}
        >
          Open <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </ButtonLink>
        {live && (
          <ButtonLink size="sm" variant="ghost" to="/chat">
            Chat
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}
