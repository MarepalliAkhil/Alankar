import { Clock } from 'lucide-react';
import type { Service } from '../../api/public';
import { formatDuration, formatDurationRange, formatINR } from '../../lib/format';
import { bookingTarget } from '../../routes/booking';
import { useSession } from '../../session/session-context';
import { ButtonLink } from '../ui/ButtonLink';
import { Modal } from '../ui/Modal';

/** Popup sheet with the full service details and the Book button. */
export function ServiceSheet({
  service,
  onClose,
}: {
  service: Service | null;
  onClose: () => void;
}) {
  const { user } = useSession();
  if (!service) return null;
  const target = bookingTarget(user, service.slug);
  const options = service.variants;

  return (
    <Modal
      open
      onClose={onClose}
      title={service.name}
      description={`${service.category.name} · ${formatDurationRange(service.min_duration, service.max_duration)}`}
      size="lg"
      footer={
        target ? (
          <ButtonLink to={target}>{user ? 'Book this service' : 'Sign in to book'}</ButtonLink>
        ) : (
          <p className="text-sm text-text-muted">Sign in with a customer account to book.</p>
        )
      }
    >
      <div className="flex flex-col gap-lg">
        <p className="text-sm text-text">{service.description || service.summary}</p>

        <section aria-labelledby="price-title">
          <h3 id="price-title" className="mb-sm text-sm font-semibold text-text">
            Price {options.length > 0 ? 'by option' : ''}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-nested border border-border bg-surface">
            {(options.length > 0
              ? options
              : [
                  {
                    id: 'base',
                    label: service.name,
                    price: service.from_price,
                    duration_minutes: service.min_duration,
                  },
                ]
            ).map((option) => (
              <li key={option.id} className="flex items-center justify-between gap-md px-md py-sm">
                <span className="text-sm text-text">{option.label}</span>
                <span className="flex items-center gap-md text-sm">
                  <span className="inline-flex items-center gap-1 text-text-muted">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                    {formatDuration(option.duration_minutes)}
                  </span>
                  <span className="font-semibold text-text">{formatINR(option.price)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-text-muted">All prices include GST.</p>
        </section>

        {service.addons.length > 0 && (
          <section aria-labelledby="addons-title">
            <h3 id="addons-title" className="mb-sm text-sm font-semibold text-text">
              Optional add-ons
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {service.addons.map((addon) => (
                <li key={addon.id} className="flex justify-between gap-md text-text">
                  <span>{addon.label}</span>
                  <span className="font-medium">+ {formatINR(addon.price)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="rounded-nested bg-primary-soft px-md py-sm text-sm text-text">
          You send a request with your preferred time and stylist. We confirm it and email you a
          payment link to lock in your slot.
        </p>
      </div>
    </Modal>
  );
}
