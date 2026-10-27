import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorDetail } from '../../api/client';
import {
  decideRefund,
  getQueue,
  listInvoices,
  listPendingRefunds,
  type InvoiceRow,
  type PayMethod,
  type RefundRow,
} from '../../api/pos';
import { CashClosesPanel } from '../../components/admin/CashClosesPanel';
import { ReversalFields } from '../../components/admin/ReversalFields';
import { noReversal, toReversal, type ReversalChoice } from '../../components/admin/reversal';
import { CheckoutModal } from '../../components/desk/CheckoutModal';
import { InvoiceModal } from '../../components/desk/InvoiceModal';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  Table,
  TabPanel,
  Tabs,
  useToast,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';
import { useSession } from '../../session/session-context';

type Tab = 'counter' | 'invoices' | 'refunds' | 'closes';

/** POS / Billing: bill checked-in visits, look up invoices, and (admin) decide refunds. */
export default function PosPage() {
  useDocumentTitle('POS / Billing');
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('counter');
  const [billing, setBilling] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const tabs = [
    { id: 'counter' as const, label: 'Counter' },
    { id: 'invoices' as const, label: 'Invoices' },
    ...(isAdmin
      ? [
          { id: 'refunds' as const, label: 'Refunds' },
          { id: 'closes' as const, label: 'Cash closes' },
        ]
      : []),
  ];

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="POS / Billing"
        description="Bill guests who are checked in or being served."
      />
      <Tabs items={tabs} value={tab} onChange={setTab} label="Billing sections" idPrefix="pos" />
      <TabPanel idPrefix="pos" id={tab}>
        {tab === 'counter' && <Counter onBill={setBilling} onOpen={setViewing} />}
        {tab === 'invoices' && <Invoices onOpen={setViewing} />}
        {tab === 'refunds' && isAdmin && <Refunds />}
        {tab === 'closes' && isAdmin && <CashClosesPanel />}
      </TabPanel>
      {billing && (
        <CheckoutModal
          appointmentId={billing}
          onClose={() => setBilling(null)}
          onBilled={(invoice) => {
            setBilling(null);
            setViewing(invoice.id);
          }}
        />
      )}
      {viewing && <InvoiceModal invoiceId={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

function Counter({
  onBill,
  onOpen,
}: {
  onBill: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const queue = useQuery({ queryKey: ['pos-queue'], queryFn: getQueue, refetchInterval: 30000 });
  if (queue.isPending) return <LoadingState label="Loading the counter…" />;
  if (queue.isError) {
    return (
      <ErrorState
        description="We couldn't load the counter."
        onRetry={() => void queue.refetch()}
      />
    );
  }
  const { ready, recent } = queue.data;
  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-col gap-md">
        <h2 className="text-lg font-semibold text-text">Ready to bill</h2>
        {ready.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title="Nobody is waiting to be billed"
            description="Guests appear here once they are checked in from Appointments."
          />
        ) : (
          <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {ready.map((visit) => (
              <li key={visit.id}>
                <Card padding="md" className="flex h-full flex-col gap-sm">
                  <div className="flex items-start justify-between gap-sm">
                    <h3 className="font-semibold text-text">{visit.customer_name}</h3>
                    <Badge tone={visit.status === 'completed' ? 'success' : 'primary'}>
                      {visit.status === 'completed' ? 'Ready for checkout' : visit.status_label}
                    </Badge>
                  </div>
                  <p className="text-sm text-text-muted">
                    {visit.service_name}
                    {visit.variant_label ? ` · ${visit.variant_label}` : ''}
                    {visit.stylist_name ? ` · ${visit.stylist_name}` : ''}
                  </p>
                  <p className="text-sm text-text-muted">
                    {visit.start && formatDateTime(visit.start)}
                  </p>
                  {visit.completion && visit.completion.removed.length > 0 && (
                    <p className="text-sm text-warning-text">
                      Not done: {visit.completion.removed.map((r) => r.label).join(', ')}
                    </p>
                  )}
                  <Button className="mt-auto" onClick={() => onBill(visit.id)}>
                    Bill {visit.customer_name}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-md">
        <h2 className="text-lg font-semibold text-text">Recent invoices</h2>
        <InvoiceTable rows={recent} onOpen={onOpen} />
      </div>
    </div>
  );
}

function InvoiceTable({ rows, onOpen }: { rows: InvoiceRow[]; onOpen: (id: string) => void }) {
  const columns: Column<InvoiceRow>[] = [
    { key: 'number', header: 'Invoice', render: (r) => r.number },
    { key: 'customer', header: 'Customer', render: (r) => r.customer_name },
    { key: 'date', header: 'Date', render: (r) => formatDateTime(r.issued_at) },
    { key: 'total', header: 'Total', render: (r) => formatINRExact(r.total) },
    {
      key: 'open',
      header: 'Details',
      render: (r) => (
        <Button variant="ghost" onClick={() => onOpen(r.id)}>
          Open {r.number}
        </Button>
      ),
    },
  ];
  return (
    <Table
      caption="Invoices"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No invoices yet."
    />
  );
}

function Invoices({ onOpen }: { onOpen: (id: string) => void }) {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);
  const list = useQuery({ queryKey: ['pos-invoices', term], queryFn: () => listInvoices(term) });
  return (
    <div className="flex flex-col gap-md">
      <div className="max-w-xl">
        <Input
          label="Search invoices"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Invoice number or customer name"
          autoComplete="off"
        />
      </div>
      {list.isPending ? (
        <LoadingState label="Loading invoices…" />
      ) : list.isError ? (
        <ErrorState
          description="We couldn't load the invoices."
          onRetry={() => void list.refetch()}
        />
      ) : (
        <InvoiceTable rows={list.data} onOpen={onOpen} />
      )}
    </div>
  );
}

function Refunds() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['pos-refunds'], queryFn: listPendingRefunds });
  const [deciding, setDeciding] = useState<{ refund: RefundRow; approve: boolean } | null>(null);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const [undo, setUndo] = useState<ReversalChoice>(noReversal);
  const [problem, setProblem] = useState('');

  const decide = useMutation({
    mutationFn: () =>
      decideRefund(deciding!.refund.id, {
        decision: deciding!.approve ? 'approve' : 'reject',
        ...(deciding!.approve ? { method, ...toReversal(undo) } : { note }),
      }),
    onSuccess: () => {
      toast.show({
        tone: 'success',
        title: deciding!.approve ? 'Refund approved' : 'Refund rejected',
      });
      setDeciding(null);
      setNote('');
      setUndo(noReversal);
      void queryClient.invalidateQueries({ queryKey: ['pos-refunds'] });
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not save the decision.'),
  });

  if (list.isPending) return <LoadingState label="Loading refunds…" />;
  if (list.isError) {
    return (
      <ErrorState description="We couldn't load the refunds." onRetry={() => void list.refetch()} />
    );
  }
  return (
    <div className="flex flex-col gap-md">
      {list.data.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No refunds waiting"
          description="Refund requests from the desk appear here for your decision."
        />
      ) : (
        <ul className="grid gap-md sm:grid-cols-2">
          {list.data.map((refund) => (
            <li key={refund.id}>
              <Card className="flex flex-col gap-sm">
                <div className="flex items-start justify-between gap-sm">
                  <h3 className="font-semibold text-text">
                    {formatINRExact(refund.amount)} · {refund.customer_name}
                  </h3>
                  <Badge tone="warning">{refund.status_label}</Badge>
                </div>
                <p className="text-sm text-text-muted">
                  {refund.invoice_number ?? refund.service_name} · asked by{' '}
                  {refund.requested_by ?? 'the system'}
                </p>
                <p className="text-sm">{refund.reason}</p>
                <div className="flex gap-sm">
                  <Button
                    onClick={() => {
                      setProblem('');
                      setDeciding({ refund, approve: true });
                    }}
                  >
                    Approve refund
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setProblem('');
                      setDeciding({ refund, approve: false });
                    }}
                  >
                    Reject refund
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {deciding && (
        <Modal
          open
          onClose={() => setDeciding(null)}
          title={deciding.approve ? 'Approve this refund' : 'Reject this refund'}
          description={`${formatINRExact(deciding.refund.amount)} for ${deciding.refund.customer_name}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeciding(null)}>
                Cancel
              </Button>
              <Button onClick={() => decide.mutate()} loading={decide.isPending}>
                {deciding.approve ? 'Confirm approval' : 'Confirm rejection'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            {deciding.approve && (
              <ReversalFields
                returnable={deciding.refund.returnable ?? []}
                earned={deciding.refund.loyalty_earned ?? 0}
                redeemed={deciding.refund.loyalty_redeemed ?? 0}
                value={undo}
                onChange={setUndo}
              />
            )}
            {deciding.approve ? (
              <Select
                label="Money goes back by"
                value={method}
                onChange={(event) => setMethod(event.target.value as PayMethod)}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'card', label: 'Card' },
                  { value: 'upi', label: 'UPI' },
                ]}
              />
            ) : (
              <Input
                label="Reason for rejecting"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
            {problem && (
              <p role="alert" className="text-danger-text">
                {problem}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
