import { ArrowRight, Clock } from 'lucide-react';
import type { Service } from '../../api/public';
import type { DivisionId } from '../../config/divisions';
import type { ArtId } from '../../design/art';
import { formatDurationRange, formatINR } from '../../lib/format';
import { ArtImage } from '../ui/ArtImage';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { divisionIcon } from './icons';

const audienceLabel = { men: 'Men', women: 'Women', kids: 'Kids', unisex: 'Unisex' } as const;

/** The picture on a service card: the admin's service image, else the division's photo/artwork. */
const DIVISION_ART: Record<DivisionId, ArtId> = {
  salon: 'salonBackground',
  spa: 'spaBackground',
  'beauty-parlor': 'parlorBackground',
};

export function ServiceCard({ service, onOpen }: { service: Service; onOpen: () => void }) {
  return (
    <Card
      as="article"
      padding="none"
      className="group flex h-full flex-col overflow-hidden transition-transform duration-base ease-brand hover:-translate-y-1 focus-within:-translate-y-1"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full flex-col text-left focus-visible:shadow-focus focus-visible:outline-none"
      >
        <div className="relative h-32 w-full overflow-hidden">
          <ArtImage
            slot={DIVISION_ART[service.division]}
            override={service.image_url || null}
            className="h-full w-full transition-transform duration-slow ease-brand group-hover:scale-105"
          />
          <span
            aria-hidden="true"
            className="glass-dense absolute bottom-sm left-sm inline-flex h-10 w-10 items-center justify-center rounded-full text-primary-hover"
          >
            {divisionIcon[service.division]}
          </span>
          <Badge tone="neutral" className="absolute right-sm top-sm">
            {audienceLabel[service.audience]}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col gap-sm p-md">
          <h3 className="font-semibold text-text">{service.name}</h3>
          <span className="sr-only">See details and book</span>
          <p className="text-sm text-text-muted">{service.summary}</p>
          <div className="mt-auto flex items-end justify-between gap-sm pt-sm">
            <p className="text-sm text-text">
              <span className="text-text-muted">from </span>
              <span className="text-lg font-semibold text-primary-hover">
                {formatINR(service.from_price)}
              </span>
              <span className="block text-xs text-text-muted">incl. GST</span>
            </p>
            <span className="flex flex-col items-end gap-1 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                {formatDurationRange(service.min_duration, service.max_duration)}
              </span>
              <span
                aria-hidden="true"
                className="inline-flex items-center gap-1 font-medium text-primary-hover"
              >
                Details
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-base ease-brand group-hover:translate-x-1" />
              </span>
            </span>
          </div>
        </div>
      </button>
    </Card>
  );
}
