import type { DivisionId } from '../../config/divisions';
import type { ArtId } from '../../design/art';
import { ArtImage } from '../ui/ArtImage';

const HEADER: Record<DivisionId, ArtId> = {
  salon: 'salonHero',
  spa: 'spaHero',
  'beauty-parlor': 'parlorHero',
};

/**
 * The framed header picture on the booking page: the chosen division's photo (a different picture
 * from the page background, shown whole in a 16:5 frame), or a close crop of the Alankar
 * reception for "All". The frame reserves its space, so nothing moves when the picture loads.
 * Decorative only.
 */
export function BookingHeader({ division }: { division: DivisionId | null }) {
  return (
    <div
      aria-hidden="true"
      data-booking-header={division ?? 'all'}
      className="relative aspect-[16/6] w-full overflow-hidden rounded-card border border-border bg-surface-muted shadow-card sm:aspect-[16/5]"
    >
      <ArtImage
        key={division ?? 'all'}
        slot={division ? HEADER[division] : 'shopBackground'}
        crop={division ? undefined : { position: '78% 50%', zoom: 1.5 }}
        sizes="(min-width: 1024px) 900px, 100vw"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
