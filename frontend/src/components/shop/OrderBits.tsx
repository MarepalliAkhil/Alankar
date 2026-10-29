import { Check, Circle } from 'lucide-react';
import type { Order, OrderStatus } from '../../api/shop';
import { cn } from '../../lib/cn';
import { formatDateTime, formatINRExact } from '../../lib/format';
import { Badge, type BadgeTone } from '../ui';

const TONES: Record<OrderStatus, BadgeTone> = {
  pending_payment: 'warning',
  placed: 'primary',
  packed: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'neutral',
  payment_expired: 'neutral',
};

export function OrderStatusBadge({ order }: { order: Pick<Order, 'status' | 'status_label'> }) {
  return <Badge tone={TONES[order.status]}>{order.status_label}</Badge>;
}

/** Placed -> Packed -> Shipped -> Delivered, each with the time it happened. */
export function OrderTimeline({ order }: { order: Order }) {
  const closed = order.status === 'cancelled' || order.status === 'payment_expired';
  return (
    <ol aria-label="Order tracking" className="flex flex-col gap-sm sm:flex-row sm:gap-0">
      {order.timeline.map((step, i) => (
        <li
          key={step.status}
          className="flex flex-1 items-start gap-sm sm:flex-col sm:items-center"
        >
          <div className="flex items-center sm:w-full">
            <span
              aria-hidden
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                step.done
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface text-text-muted',
              )}
            >
              {step.done ? <Check className="size-4" /> : <Circle className="size-2" />}
            </span>
            {i < order.timeline.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'hidden h-0.5 flex-1 sm:block',
                  order.timeline[i + 1]?.done ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
          <div className="sm:mt-xs sm:text-center">
            <p className={cn('text-sm font-medium', step.done ? 'text-text' : 'text-text-muted')}>
              {step.label}
              <span className="sr-only">{step.done ? ' (done)' : ' (not yet)'}</span>
            </p>
            <p className="text-xs text-text-muted">
              {step.at ? formatDateTime(step.at) : closed ? '—' : 'Waiting'}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OrderLines({ order }: { order: Order }) {
  return (
    <div className="flex flex-col gap-xs">
      <ul className="flex flex-col gap-xs">
        {order.lines.map((ln) => (
          <li key={ln.product} className="flex justify-between gap-sm text-sm">
            <span className="text-text">
              {ln.name} × {ln.quantity}
            </span>
            <span className="text-text">{formatINRExact(ln.amount)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-xs flex flex-col gap-1 border-t border-border pt-xs text-sm">
        <Row label="Items (incl. GST)" value={order.items_total} />
        {Number(order.discount) > 0 && <Row label="Discount" value={`-${order.discount}`} />}
        <Row label="Delivery" value={order.delivery_fee} free={Number(order.delivery_fee) === 0} />
        <div className="flex justify-between font-semibold text-text">
          <dt>Total</dt>
          <dd>{formatINRExact(order.total)}</dd>
        </div>
        <p className="text-xs text-text-muted">
          Includes GST of {formatINRExact(order.gst_included)}.
          {Number(order.refunded) > 0 && ` Refunded ${formatINRExact(order.refunded)}.`}
        </p>
      </dl>
    </div>
  );
}

function Row({ label, value, free }: { label: string; value: string; free?: boolean }) {
  return (
    <div className="flex justify-between text-text-muted">
      <dt>{label}</dt>
      <dd>
        {free
          ? 'Free'
          : value.startsWith('-')
            ? `- ${formatINRExact(value.slice(1))}`
            : formatINRExact(value)}
      </dd>
    </div>
  );
}

export function OrderAddress({ order }: { order: Order }) {
  const a = order.address;
  return (
    <address className="text-sm not-italic text-text">
      <p className="font-medium">{a.full_name}</p>
      <p>{a.line1}</p>
      {a.line2 && <p>{a.line2}</p>}
      {a.landmark && <p className="text-text-muted">Near {a.landmark}</p>}
      <p>
        {a.city}, {a.state} {a.pincode}
      </p>
      <p className="text-text-muted">Mobile {a.mobile}</p>
    </address>
  );
}
