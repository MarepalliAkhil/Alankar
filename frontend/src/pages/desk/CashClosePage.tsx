import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorDetail } from '../../api/client';
import { getCashSummary, signCashClose, type PayMethod } from '../../api/pos';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

const labels: Record<PayMethod, string> = { cash: 'Cash', card: 'Card', upi: 'UPI' };

function todayInShop(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** End-of-day cash close: count the drawer, compare with the system, sign off once. */
export default function CashClosePage() {
  useDocumentTitle('Cash Close');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(todayInShop());
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const summary = useQuery({ queryKey: ['cash-close', day], queryFn: () => getCashSummary(day) });
  const sign = useMutation({
    mutationFn: () => signCashClose({ date: day, counted_cash: counted, note }),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Day closed' });
      void queryClient.invalidateQueries({ queryKey: ['cash-close', day] });
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not close the day.'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem('');
    sign.mutate();
  };

  const data = summary.data;
  const expected = data ? Number(data.methods.cash.expected) : 0;
  const difference = counted === '' ? null : Number(counted) - expected;

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="Cash Close"
        description="Count the drawer at the end of the day and sign off. A closed day cannot be changed."
      />
      <div className="max-w-xs">
        <Input
          label="Day"
          type="date"
          max={todayInShop()}
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </div>
      {summary.isPending ? (
        <LoadingState label="Loading the day's takings…" />
      ) : summary.isError || !data ? (
        <ErrorState
          description="We couldn't load the takings."
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-md sm:grid-cols-3">
            {(Object.keys(labels) as PayMethod[]).map((method) => (
              <Card key={method} className="flex flex-col gap-xs">
                <h2 className="text-sm font-semibold text-text-muted">{labels[method]}</h2>
                <p className="text-xl font-semibold text-text">
                  {formatINRExact(data.methods[method].expected)}
                </p>
                <p className="text-xs text-text-muted">
                  Taken {formatINRExact(data.methods[method].taken)} · refunded{' '}
                  {formatINRExact(data.methods[method].refunded)}
                </p>
              </Card>
            ))}
          </div>
          <p className="text-sm text-text-muted">
            {data.invoice_count} invoice{data.invoice_count === 1 ? '' : 's'} · tips{' '}
            {formatINRExact(data.tips)}
          </p>
          {data.unbilled_visits > 0 && (
            <p
              role="alert"
              className="rounded-input bg-warning-soft p-md text-sm text-warning-text"
            >
              {data.unbilled_visits} visit{data.unbilled_visits === 1 ? ' is' : 's are'} checked in
              but not billed yet.
            </p>
          )}
          {data.closed ? (
            <Card className="flex flex-col gap-xs text-sm">
              <h2 className="font-semibold text-text">Day closed</h2>
              <p>
                Expected cash {formatINRExact(data.closed.expected_cash)} · counted{' '}
                {formatINRExact(data.closed.counted_cash)} · difference{' '}
                {formatINRExact(data.closed.difference)}
              </p>
              {data.closed.note && <p>Note: {data.closed.note}</p>}
              <p className="text-text-muted">
                Signed by {data.closed.closed_by ?? 'staff'} on{' '}
                {formatDateTime(data.closed.closed_at)}
              </p>
            </Card>
          ) : (
            <Card>
              <form onSubmit={submit} className="flex max-w-md flex-col gap-md">
                <h2 className="font-semibold text-text">Count the cash drawer</h2>
                <Input
                  label="Cash counted (₹)"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                  hint={`The system expects ${formatINRExact(expected)}.`}
                />
                {difference !== null && difference !== 0 && (
                  <p className="text-sm text-warning-text">
                    Difference: {formatINRExact(difference)}. Write a short note to explain it.
                  </p>
                )}
                <Textarea
                  label="Note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  hint="Needed when the count does not match."
                />
                {problem && (
                  <p role="alert" className="text-sm text-danger-text">
                    {problem}
                  </p>
                )}
                <Button type="submit" loading={sign.isPending}>
                  Close the day
                </Button>
              </form>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
