import { Clock } from 'lucide-react';
import type { Service } from '../../api/public';
import { formatDurationRange, formatINR } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { divisionIcon } from './icons';

const audienceLabel = { men: 'Men', women: 'Women', kids: 'Kids', unisex: 'Unisex' } as const;

export function ServiceCard({ service, onOpen }: { service: Service; onOpen: () => void }) {
  return (
    <Card as="article" padding="none" className="flex h-full flex-col overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${service.name}: see details and book`}
        className="flex h-full flex-col text-left focus-visible:shadow-focus focus-visible:outline-none"
      >
        {service.image_url ? (
          <img src={service.image_url} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-24 w-full items-center justify-center bg-primary-soft text-primary-hover"
          >
            {divisionIcon[service.division]}
          </div>
        )}
        <div className="flex flex-1 flex-col gap-sm p-md">
          <div className="flex items-start justify-between gap-sm">
            <h3 className="font-semibold text-text">{service.name}</h3>
            <Badge tone="neutral">{audienceLabel[service.audience]}</Badge>
          </div>
          <p className="text-sm text-text-muted">{service.summary}</p>
          <div className="mt-auto flex items-end justify-between gap-sm pt-sm">
            <p className="text-sm text-text">
              <span className="text-text-muted">from </span>
              <span className="text-base font-bold">{formatINR(service.from_price)}</span>
              <span className="block text-xs text-text-muted">incl. GST</span>
            </p>
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <Clock aria-hidden="true" className="h-3.5 w-3.5" />
              {formatDurationRange(service.min_duration, service.max_duration)}
            </span>
          </div>
        </div>
      </button>
    </Card>
  );
}
