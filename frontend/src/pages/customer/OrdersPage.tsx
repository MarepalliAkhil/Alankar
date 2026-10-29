import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listMyOrders } from '../../api/shop';
import { PageHeader } from '../../components/layout/PageContainer';
import { OrderStatusBadge } from '../../components/shop/OrderBits';
import { ButtonLink, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

/** Customer: every shop order as a card; open one to pay, cancel or track it. */
export default function OrdersPage() {
  useDocumentTitle('My Orders');
  const orders = useQuery({ queryKey: ['my-orders'], queryFn: listMyOrders });
  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        title="My Orders"
        description="Your shop orders. Open one to pay, cancel before it is packed, or track it."
        actions={<ButtonLink to="/customer/shop">Go to the shop</ButtonLink>}
      />
      {orders.isPending ? (
        <LoadingState label="Loading your orders…" />
      ) : orders.isError ? (
        <ErrorState
          description="We couldn't load your orders."
          onRetry={() => void orders.refetch()}
        />
      ) : orders.data.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" aria-hidden />}
          title="No orders yet"
          description="Products you buy from the shop will show up here."
        />
      ) : (
        <ul className="flex flex-col gap-md">
          {orders.data.map((o) => (
            <Card as="li" variant="dense" key={o.id} aria-label={`Order ${o.number}`}>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div className="flex flex-wrap items-center gap-xs">
                  <Link
                    to={`/customer/orders/${o.id}`}
                    className="font-semibold text-text underline-offset-2 hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    {o.number}
                  </Link>
                  <OrderStatusBadge order={o} />
                </div>
                <span className="font-semibold text-text">{formatINRExact(o.total)}</span>
              </div>
              <p className="text-sm text-text-muted">
                {o.lines.map((ln) => `${ln.name} × ${ln.quantity}`).join(', ')}
              </p>
              <p className="text-xs text-text-muted">Ordered {formatDateTime(o.created_at)}</p>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}
