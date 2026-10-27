import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { listMyInvoices, type Invoice } from '../../api/billing';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Table,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINR } from '../../lib/format';

/** Invoices: the customer's own tax invoices, newest first. Read only (paid invoices are final). */
export default function InvoicesPage() {
  useDocumentTitle('Invoices');
  const invoices = useQuery({ queryKey: ['my-invoices'], queryFn: listMyInvoices });
  const [open, setOpen] = useState<Invoice | null>(null);

  const columns: Column<Invoice>[] = [
    { key: 'number', header: 'Invoice', render: (row) => row.number },
    { key: 'date', header: 'Date', render: (row) => formatDateTime(row.issued_at) },
    { key: 'service', header: 'Service', render: (row) => row.service_name },
    { key: 'total', header: 'Total', render: (row) => formatINR(row.total) },
    {
      key: 'view',
      header: 'Details',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setOpen(row)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-lg py-lg">
      <PageHeader title="Invoices" description="Your invoices appear here after each visit." />
      {invoices.isPending ? (
        <LoadingState label="Loading your invoices…" />
      ) : invoices.isError ? (
        <ErrorState
          description="We couldn't load your invoices."
          onRetry={() => void invoices.refetch()}
        />
      ) : invoices.data.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No invoices yet"
          description="After a visit is completed, its invoice will show up here."
        />
      ) : (
        <Table
          caption="Your invoices"
          columns={columns}
          rows={invoices.data}
          rowKey={(row) => row.id}
        />
      )}
      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `Invoice ${open.number}` : 'Invoice'}
        description={open ? formatDateTime(open.issued_at) : undefined}
        footer={
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        }
      >
        {open && <InvoiceBody invoice={open} />}
      </Modal>
    </section>
  );
}

function InvoiceBody({ invoice }: { invoice: Invoice }) {
  return (
    <div className="flex flex-col gap-md text-sm">
      <p className="text-text-muted">
        {invoice.service_name}
        {invoice.stylist_name ? ` · ${invoice.stylist_name}` : ''}
      </p>
      <ul className="divide-y divide-border">
        {invoice.items.map((item, index) => (
          <li key={index} className="flex justify-between gap-md py-sm">
            <span>
              {item.description}
              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
            </span>
            <span>{formatINR(item.amount)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-y-1">
        <dt className="text-text-muted">Subtotal</dt>
        <dd className="text-right">{formatINR(invoice.subtotal)}</dd>
        <dt className="text-text-muted">GST</dt>
        <dd className="text-right">{formatINR(invoice.gst_amount)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold">{formatINR(invoice.total)}</dd>
        <dt className="text-text-muted">Paid online</dt>
        <dd className="text-right">{formatINR(invoice.prepaid_amount)}</dd>
        <dt className="text-text-muted">Paid at the salon</dt>
        <dd className="text-right">{formatINR(invoice.balance_paid)}</dd>
      </dl>
    </div>
  );
}
