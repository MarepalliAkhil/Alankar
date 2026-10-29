import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrders } from '../../api/shop';
import { PageHeader } from '../../components/layout/PageContainer';
import { OrderStatusBadge } from '../../components/shop/OrderBits';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  LoadingState,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

const STATUSES = [
  { value: 'open', label: 'To do' },
  { value: 'placed', label: 'To pack' },
  { value: 'packed', label: 'To ship' },
  { value: 'shipped', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'pending_payment', label: 'Waiting for payment' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All' },
] as const;

type StatusFilter = (typeof STATUSES)[number]['value'];

/** Receptionist and admin: online shop orders with filters. Open one to move it along. */
export default function OrdersPage() {
  useDocumentTitle('Orders');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const orders = useQuery({
    queryKey: ['orders', status, q.trim(), from, to],
    queryFn: () => listOrders({ status, q: q.trim(), from, to }),
  });
  const counts = orders.data?.counts;
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        title="Orders"
        description="Online shop orders. Pack paid orders, hand them to delivery, mark them delivered."
      />
      {counts && (
        <div className="flex flex-wrap gap-sm" aria-label="Work waiting">
          <Badge tone="primary">{counts.placed ?? 0} to pack</Badge>
          <Badge tone="info">{counts.packed ?? 0} to ship</Badge>
          <Badge tone="info">{counts.shipped ?? 0} out for delivery</Badge>
        </div>
      )}
      <Card variant="dense" className="flex flex-col gap-sm">
        <FilterChips label="Status" options={STATUSES} value={status} onChange={setStatus} />
        <div className="grid gap-sm sm:grid-cols-3">
          <Input
            label="Search"
            placeholder="Order number, name, email or PIN code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>
      {orders.isPending ? (
        <LoadingState label="Loading orders…" />
      ) : orders.isError ? (
        <ErrorState
          description="We couldn't load the orders."
          onRetry={() => void orders.refetch()}
        />
      ) : orders.data.orders.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" aria-hidden />}
          title="No orders here"
          description="Try another status or clear the search."
        />
      ) : (
        <ul className="flex flex-col gap-sm">
          {orders.data.orders.map((o) => (
            <Card as="li" variant="dense" key={o.id} aria-label={`Order ${o.number}`}>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div className="flex flex-wrap items-center gap-xs">
                  <Link
                    to={`/orders/${o.id}`}
                    className="font-semibold text-text underline-offset-2 hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    {o.number}
                  </Link>
                  <OrderStatusBadge order={o} />
                </div>
                <span className="font-semibold text-text">{formatINRExact(o.total)}</span>
              </div>
              <p className="text-sm text-text">
                {o.customer?.name} · {o.address.city} {o.address.pincode}
              </p>
              <p className="text-xs text-text-muted">
                {o.lines.reduce((n, ln) => n + ln.quantity, 0)} item(s) · ordered{' '}
                {formatDateTime(o.created_at)}
              </p>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}
