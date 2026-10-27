import { Link } from 'react-router-dom';
import { Badge, Button, Card, ErrorState } from '../../components/ui';
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

/** One visit as a card. The stylist sees the guest's first name only. */
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
  return (
    <Card padding="md" className="flex h-full flex-col gap-sm">
      <div className="flex items-start justify-between gap-sm">
        <h3 className="font-semibold text-text">{visit.customer_first_name}</h3>
        <Badge tone={tones[visit.status] ?? 'neutral'}>{visit.status_label}</Badge>
      </div>
      <p className="text-sm text-text">
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
        <Link
          className="text-sm font-semibold text-primary-hover underline"
          to={`/my-appointments/${visit.id}`}
        >
          Open visit
        </Link>
        {onStart && visit.actions.includes('start') && (
          <Button size="sm" loading={starting} onClick={() => onStart(visit.id)}>
            Start service
          </Button>
        )}
      </div>
    </Card>
  );
}
