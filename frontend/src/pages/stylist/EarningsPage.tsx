import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getEarnings, getRatings, type Earnings } from '../../api/stylist';
import { PageHeader } from '../../components/layout/PageContainer';
import { Badge, Card, Input, LoadingState, Table, type Column } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';
import { StylistError } from './common';

function thisMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date())
    .slice(0, 7);
}

type Task = Earnings['tasks'][number];

const columns: Column<Task>[] = [
  { key: 'date', header: 'Billed', render: (t) => formatDateTime(t.date) },
  {
    key: 'service',
    header: 'Service',
    render: (t) => (
      <span>
        {t.service}
        {t.partial && <span className="text-xs text-text-muted"> (part of the booking)</span>}
      </span>
    ),
  },
  { key: 'payout', header: 'Task payout', render: (t) => formatINRExact(t.payout) },
  { key: 'mult', header: 'Multiplier', render: (t) => `× ${t.multiplier}` },
  { key: 'tip', header: 'Tip', render: (t) => formatINRExact(t.tip) },
];

/** Ratings, rating bands and estimated earnings. View only: payroll approval is in Task 6. */
export default function EarningsPage() {
  useDocumentTitle('Earnings');
  const [month, setMonth] = useState(thisMonth());
  const earnings = useQuery({
    queryKey: ['stylist', 'earnings', month],
    queryFn: () => getEarnings(month),
  });
  const ratings = useQuery({ queryKey: ['stylist', 'ratings'], queryFn: getRatings });

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="Earnings"
        description="Your ratings and what you have earned. Figures are estimates until payroll is approved."
      />
      <div className="max-w-xs">
        <Input
          label="Month"
          type="month"
          max={thisMonth()}
          value={month}
          onChange={(event) => event.target.value && setMonth(event.target.value)}
        />
      </div>
      {earnings.isPending ? (
        <LoadingState label="Loading your earnings…" />
      ) : earnings.isError ? (
        <StylistError error={earnings.error} onRetry={() => void earnings.refetch()} />
      ) : (
        <>
          <div className="grid gap-md sm:grid-cols-3">
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">Task payouts</h2>
              <p className="text-xl font-semibold text-text">
                {formatINRExact(earnings.data.totals.tasks)}
              </p>
            </Card>
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">Tips</h2>
              <p className="text-xl font-semibold text-text">
                {formatINRExact(earnings.data.totals.tips)}
              </p>
            </Card>
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">
                Total <Badge tone="warning">Estimated</Badge>
              </h2>
              <p className="text-xl font-semibold text-text">
                {formatINRExact(earnings.data.totals.total)}
              </p>
              <p className="text-xs text-text-muted">Final after payroll approval.</p>
            </Card>
          </div>

          <Card className="flex flex-col gap-sm">
            <h2 className="text-lg font-semibold text-text">Your rating</h2>
            {earnings.data.rating.enough ? (
              <p className="text-sm text-text">
                Average {earnings.data.rating.average} from {earnings.data.rating.count} ratings.
                Your multiplier this month is × {earnings.data.rating.multiplier}.
              </p>
            ) : (
              <p className="text-sm text-text">
                Not enough ratings yet ({earnings.data.rating.count} of{' '}
                {earnings.data.rating.needed}). Your multiplier stays at × 1.00 until then.
              </p>
            )}
            <h3 className="pt-sm text-sm font-semibold text-text">How the multiplier works</h3>
            <ul className="text-sm text-text-muted">
              {earnings.data.rules.bands.map((band) => (
                <li key={band.label} className="flex justify-between gap-md">
                  <span>Average {band.label}</span>
                  <span>× {band.multiplier}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-sm">
            <h2 className="text-lg font-semibold text-text">Tasks billed this month</h2>
            <Table
              caption="Tasks billed this month"
              columns={columns}
              rows={earnings.data.tasks}
              rowKey={(t) => t.id}
              emptyMessage="No billed tasks this month yet."
            />
          </div>

          {earnings.data.waiting_checkout.length > 0 && (
            <Card className="flex flex-col gap-xs">
              <h2 className="text-lg font-semibold text-text">Waiting for checkout</h2>
              <p className="text-sm text-text-muted">
                These count towards your pay once the front desk bills them.
              </p>
              <ul className="text-sm text-text">
                {earnings.data.waiting_checkout.map((w) => (
                  <li key={w.id}>
                    {w.date && formatDateTime(w.date)} · {w.service}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Card className="flex flex-col gap-sm">
        <h2 className="text-lg font-semibold text-text">Guest comments</h2>
        {ratings.isPending ? (
          <LoadingState label="Loading comments…" />
        ) : ratings.isError ? (
          <p className="text-sm text-text-muted">We couldn&apos;t load your ratings.</p>
        ) : ratings.data.comments.length === 0 ? (
          <p className="text-sm text-text-muted">No comments yet. Comments never show names.</p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {ratings.data.comments.map((c, index) => (
              <li key={index} className="rounded-input bg-surface p-md text-sm">
                <p className="font-semibold text-text">
                  {c.stars} of 5 · {c.service}
                </p>
                {c.comment && <p className="text-text">{c.comment}</p>}
                {c.tags.length > 0 && <p className="text-text-muted">{c.tags.join(', ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
