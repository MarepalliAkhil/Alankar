import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorDetail } from '../../api/client';
import { ReversalFields } from '../admin/ReversalFields';
import { noReversal, toReversal, type ReversalChoice } from '../admin/reversal';
import { getInvoice, requestRefund, type PayMethod } from '../../api/pos';
import { formatDateTime, formatINRExact } from '../../lib/format';
import { useSession } from '../../session/session-context';
import { Badge, Button, ErrorState, Input, LoadingState, Modal, Select, useToast } from '../ui';

const refundTone = {
  pending_approval: 'warning',
  processed: 'success',
  rejected: 'danger',
} as const;

/** One invoice, ready to print, with the refund request form. */
export function InvoiceModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { user } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [undo, setUndo] = useState<ReversalChoice>(noReversal);
  const [problem, setProblem] = useState('');

  const invoice = useQuery({
    queryKey: ['pos-invoice', invoiceId],
    queryFn: () => getInvoice(invoiceId),
  });
  const isAdmin = user?.role === 'admin';

  const refund = useMutation({
    mutationFn: () =>
      requestRefund(invoiceId, {
        amount,
        reason,
        ...(isAdmin ? { method, ...toReversal(undo) } : {}),
      }),
    onSuccess: (row) => {
      toast.show({
        tone: 'success',
        title: row.status === 'processed' ? 'Refund recorded' : 'Refund sent to the admin',
      });
      setAsking(false);
      setAmount('');
      setReason('');
      setUndo(noReversal);
      void queryClient.invalidateQueries({ queryKey: ['pos-invoice', invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['pos-refunds'] });
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not save the refund.'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem('');
    refund.mutate();
  };

  const data = invoice.data;
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={data ? `Invoice ${data.number}` : 'Invoice'}
      description={data ? `${data.customer_name} · ${formatDateTime(data.issued_at)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Printer className="h-4 w-4" />}
            onClick={() => window.print()}
          >
            Print
          </Button>
          {data && Number(data.refundable) > 0 && !asking && (
            <Button onClick={() => setAsking(true)}>{isAdmin ? 'Refund' : 'Request refund'}</Button>
          )}
        </>
      }
    >
      {invoice.isPending ? (
        <LoadingState label="Loading the invoice…" />
      ) : invoice.isError || !data ? (
        <ErrorState
          description="We couldn't load this invoice."
          onRetry={() => void invoice.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-lg text-sm">
          {data.service_changes && (
            <p className="rounded-input bg-warning-soft p-md text-warning-text">
              Service change: {data.service_changes}
            </p>
          )}
          <ul className="flex flex-col gap-xs">
            {data.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-md">
                <span>
                  {item.description}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                </span>
                <span>{formatINRExact(item.amount)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[1fr_auto] gap-x-md gap-y-1 border-t border-border pt-md">
            {Number(data.discount_amount) > 0 && (
              <>
                <dt>
                  Discount {Number(data.discount_percent)}% ({data.discount_reason})
                </dt>
                <dd>− {formatINRExact(data.discount_amount)}</dd>
              </>
            )}
            <dt className="text-text-muted">GST included</dt>
            <dd className="text-text-muted">{formatINRExact(data.gst_amount)}</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="font-semibold">{formatINRExact(data.total)}</dd>
            {Number(data.prepaid_amount) > 0 && (
              <>
                <dt>Paid online</dt>
                <dd>{formatINRExact(data.prepaid_amount)}</dd>
              </>
            )}
            {data.loyalty_redeemed > 0 && (
              <>
                <dt>Loyalty points used</dt>
                <dd>{data.loyalty_redeemed}</dd>
              </>
            )}
            {Number(data.tip_amount) > 0 && (
              <>
                <dt>Tip</dt>
                <dd>{formatINRExact(data.tip_amount)}</dd>
              </>
            )}
            <dt>Points earned</dt>
            <dd>{data.loyalty_earned}</dd>
          </dl>
          {data.payments.length > 0 && (
            <ul className="flex flex-col gap-xs border-t border-border pt-md">
              {data.payments.map((p) => (
                <li key={p.reference} className="flex justify-between gap-md">
                  <span className="capitalize">
                    {p.method} <span className="text-text-muted">({p.reference})</span>
                  </span>
                  <span>{formatINRExact(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.refunds.length > 0 && (
            <ul className="flex flex-col gap-xs border-t border-border pt-md" aria-label="Refunds">
              {data.refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-sm">
                  <span>
                    Refund {formatINRExact(r.amount)} — {r.reason}
                  </span>
                  <Badge tone={refundTone[r.status]}>{r.status_label}</Badge>
                </li>
              ))}
            </ul>
          )}
          {asking && (
            <form onSubmit={submit} className="flex flex-col gap-md border-t border-border pt-md">
              <h3 className="font-semibold">
                {isAdmin ? 'Refund this invoice' : 'Ask the admin to approve a refund'}
              </h3>
              <Input
                label="Refund amount (₹)"
                type="number"
                min={0}
                step="0.01"
                required
                hint={`Up to ${formatINRExact(data.refundable)}.`}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <Input
                label="Reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              {isAdmin && (
                <ReversalFields
                  returnable={data.returnable ?? []}
                  earned={data.loyalty_earned}
                  redeemed={data.loyalty_redeemed}
                  value={undo}
                  onChange={setUndo}
                />
              )}
              {isAdmin && (
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
              )}
              {problem && (
                <p role="alert" className="text-danger-text">
                  {problem}
                </p>
              )}
              <div className="flex justify-end gap-sm">
                <Button variant="ghost" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={refund.isPending}>
                  {isAdmin ? 'Refund now' : 'Send request'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
