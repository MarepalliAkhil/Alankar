import { useQuery } from '@tanstack/react-query';
import { getAddon, recFeedback } from '../../api/recommendations';
import { formatDateTime, formatINR } from '../../lib/format';
import { ButtonLink } from '../ui';

/**
 * In the booking sheet, once a stylist and a time are chosen: one service that is often booked
 * together with this one, shown ONLY when the same stylist is free for it right after. Opens a
 * second booking sheet with that time and stylist filled in; nothing is added on its own.
 */
export function AddAfter({
  service,
  stylist,
  start,
}: {
  service: string;
  stylist: string;
  start: string;
}) {
  const query = useQuery({
    queryKey: ['booking-addon', service, stylist, start],
    queryFn: () => getAddon({ service, stylist, start }),
    retry: false,
  });
  const addon = query.data;
  if (!addon) return null;
  const params = new URLSearchParams({
    service: addon.service.slug,
    start: addon.start,
    stylist: addon.stylist.id,
  });
  return (
    <div className="rounded-nested bg-primary-soft p-md" data-add-after>
      <p className="text-sm font-semibold text-text">
        Add {addon.service.name} right after? {addon.stylist.name} is free at{' '}
        {formatDateTime(addon.start)}.
      </p>
      <p className="mt-xs text-sm text-text-muted">
        {addon.reason}. {addon.service.duration_minutes} min, from{' '}
        {formatINR(addon.service.from_price)}. Send this request first, then book the second one.
      </p>
      <ButtonLink
        className="mt-sm"
        size="sm"
        variant="secondary"
        to={`/customer/book?${params.toString()}`}
        target="_blank"
        rel="noopener"
        onClick={() =>
          void recFeedback({
            action: 'click',
            placement: 'addon',
            service: addon.service.id,
          }).catch(() => undefined)
        }
      >
        Open {addon.service.name} in a new tab
      </ButtonLink>
    </div>
  );
}
