import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { getInventory, type PosProduct } from '../../api/pos';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  EmptyState,
  ErrorState,
  SkeletonTable,
  Table,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatINRExact } from '../../lib/format';

const columns: Column<PosProduct>[] = [
  { key: 'name', header: 'Product', render: (p) => p.name },
  { key: 'sku', header: 'SKU', render: (p) => p.sku },
  { key: 'category', header: 'Category', render: (p) => p.category },
  { key: 'price', header: 'Price (incl. GST)', render: (p) => formatINRExact(p.unit_price) },
  { key: 'stock', header: 'In stock', render: (p) => p.stock },
  {
    key: 'state',
    header: 'Status',
    render: (p) =>
      p.low ? <Badge tone="warning">Low stock</Badge> : <Badge tone="success">OK</Badge>,
  },
];

/** Inventory, view only for the front desk. Stock changes happen through sales. */
export default function InventoryPage() {
  useDocumentTitle('Inventory');
  const inventory = useQuery({ queryKey: ['pos-inventory'], queryFn: getInventory });
  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="Inventory"
        description="Stock levels for retail products. Levels fall automatically when a product is sold."
      />
      {inventory.isPending ? (
        <SkeletonTable rows={6} columns={6} label="Loading stock…" />
      ) : inventory.isError ? (
        <ErrorState
          description="We couldn't load the stock."
          onRetry={() => void inventory.refetch()}
        />
      ) : inventory.data.results.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-6 w-6" />}
          title="No products yet"
          description="Products appear here once they are added."
        />
      ) : (
        <>
          {inventory.data.low_count > 0 && (
            <p role="status" className="text-sm text-warning-text">
              {inventory.data.low_count} product{inventory.data.low_count === 1 ? ' is' : 's are'}{' '}
              running low.
            </p>
          )}
          <Table
            caption="Products and stock"
            columns={columns}
            rows={inventory.data.results}
            rowKey={(p) => p.id}
          />
        </>
      )}
    </section>
  );
}
