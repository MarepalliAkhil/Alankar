import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getStylistPay, listStylistPay, type PayTaskRow } from '../../api/ratingsAdmin';
import PayrollRuns from './PayrollRuns';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  SkeletonTable,
  TabPanel,
  Table,
  Tabs,
  type BadgeTone,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

function thisMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date())
    .slice(0, 7);
}

const STATE: Record<PayTaskRow['rating_state'], { label: string; tone: BadgeTone }> = {
  counted: { label: 'Counted', tone: 'success' },
  unrated: { label: 'Not rated', tone: 'neutral' },
  held: { label: 'Not counted (under review)', tone: 'warning' },
};

const columns: Column<PayTaskRow>[] = [
  { key: 'date', header: 'Billed', render: (t) => formatDateTime(t.date) },
  { key: 'invoice', header: 'Invoice', render: (t) => t.invoice },
  { key: 'customer', header: 'Customer', render: (t) => t.customer },
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
  {
    key: 'rating',
    header: 'Rating',
    render: (t) => (
      <span>
        {t.stars ? `${t.stars} of 5 ` : ''}
        <Badge tone={STATE[t.rating_state].tone}>{STATE[t.rating_state].label}</Badge>
      </span>
    ),
  },
  { key: 'base', header: 'Task payout', render: (t) => formatINRExact(t.base_payout) },
  { key: 'mult', header: 'Multiplier', render: (t) => `× ${t.multiplier}` },
  { key: 'payout', header: 'After rating', render: (t) => formatINRExact(t.payout) },
  { key: 'tip', header: 'Tip', render: (t) => formatINRExact(t.tip) },
  { key: 'total', header: 'Total', render: (t) => formatINRExact(t.total) },
];

/** Admin: estimated stylist pay for a month, with the breakdown for every billed visit. */
function StylistEstimate() {
  const [month, setMonth] = useState(thisMonth());
  const [open, setOpen] = useState('');
  const list = useQuery({
    queryKey: ['a-pay', month],
    queryFn: () => listStylistPay(month),
  });
  const detail = useQuery({
    queryKey: ['a-pay', month, open],
    queryFn: () => getStylistPay(open, month),
    enabled: Boolean(open),
  });
  return (
    <div className="flex flex-col gap-lg">
      <p className="text-sm text-text-muted">
        Stylist pay = task payout × rating multiplier + tips (tips are never multiplied). These are
        estimates worked out from billed visits.
      </p>
      <div className="max-w-xs">
        <Input
          label="Month"
          type="month"
          max={thisMonth()}
          value={month}
          onChange={(e) => {
            if (e.target.value) {
              setMonth(e.target.value);
              setOpen('');
            }
          }}
        />
      </div>
      {list.isPending ? (
        <LoadingState label="Working out stylist pay…" />
      ) : list.isError ? (
        <ErrorState
          description="We couldn't load stylist pay."
          onRetry={() => void list.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-md sm:grid-cols-3">
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">Task payouts</h2>
              <p className="text-xl font-semibold text-text">
                {formatINRExact(list.data.totals.tasks)}
              </p>
            </Card>
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">Tips</h2>
              <p className="text-xl font-semibold text-text">
                {formatINRExact(list.data.totals.tips)}
              </p>
            </Card>
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">
                Total <Badge tone="warning">Estimated</Badge>
              </h2>
              <p className="text-xl font-semibold text-text">
                {formatINRExact(list.data.totals.total)}
              </p>
              <p className="text-xs text-text-muted">
                {list.data.totals.invoices} billed visit{list.data.totals.invoices === 1 ? '' : 's'}
              </p>
            </Card>
          </div>
          <p className="text-sm text-text-muted" role="status">
            Check: tips on the invoices {formatINRExact(list.data.reconciliation.tips_on_invoices)},
            tips in pay {formatINRExact(list.data.reconciliation.tips_in_pay)}, difference{' '}
            {formatINRExact(list.data.reconciliation.difference)}.
          </p>
          {list.data.stylists.length === 0 ? (
            <EmptyState
              title="No stylists"
              description="Stylists with a linked account appear here."
            />
          ) : (
            <ul className="grid gap-md md:grid-cols-2" aria-label="Stylist pay">
              {list.data.stylists.map((s) => (
                <li key={s.id}>
                  <Card variant="dense" className="flex flex-col gap-xs">
                    <div className="flex flex-wrap items-center gap-xs">
                      <h2 className="text-lg font-semibold text-text">{s.name}</h2>
                      {!s.active && <Badge>Deactivated</Badge>}
                      {s.rating.flagged && <Badge tone="danger">Rating below 3.0</Badge>}
                    </div>
                    <p className="text-xl font-semibold text-text">{formatINRExact(s.total)}</p>
                    <p className="text-sm text-text-muted">
                      Tasks {formatINRExact(s.tasks_pay)} + tips {formatINRExact(s.tips)} ·{' '}
                      {s.invoices} visit{s.invoices === 1 ? '' : 's'}
                    </p>
                    <p className="text-sm text-text-muted">
                      {s.rating.enough
                        ? `Average ${s.rating.average} from ${s.rating.count} ratings: × ${s.rating.multiplier}`
                        : `${s.rating.count} of ${s.rating.needed} ratings needed: × 1.00`}
                    </p>
                    {s.waiting_checkout > 0 && (
                      <p className="text-xs text-text-muted">
                        {s.waiting_checkout} finished visit{s.waiting_checkout === 1 ? '' : 's'}{' '}
                        waiting for checkout.
                      </p>
                    )}
                    <div className="pt-xs">
                      <Button
                        size="sm"
                        variant={open === s.id ? 'secondary' : 'primary'}
                        aria-expanded={open === s.id}
                        onClick={() => setOpen(open === s.id ? '' : s.id)}
                      >
                        {open === s.id ? 'Hide breakdown' : `Breakdown for ${s.name}`}
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {open &&
            (detail.isPending ? (
              <SkeletonTable rows={6} columns={7} label="Loading the breakdown…" />
            ) : detail.isError ? (
              <ErrorState
                description="We couldn't load the breakdown."
                onRetry={() => void detail.refetch()}
              />
            ) : (
              <div className="flex flex-col gap-sm">
                <h2 className="text-lg font-semibold text-text">
                  {detail.data.name}: every billed visit
                </h2>
                <Table
                  caption={`Billed visits for ${detail.data.name}`}
                  columns={columns}
                  rows={detail.data.tasks}
                  rowKey={(t) => t.id}
                  emptyMessage="No billed visits this month."
                />
                <p className="text-sm text-text">
                  Total {formatINRExact(detail.data.totals.total)} (tasks{' '}
                  {formatINRExact(detail.data.totals.tasks)} + tips{' '}
                  {formatINRExact(detail.data.totals.tips)}).
                </p>
              </div>
            ))}
          <Card className="flex flex-col gap-xs">
            <h2 className="text-lg font-semibold text-text">How the multiplier works</h2>
            <p className="text-sm text-text-muted">
              Uses the average of counted ratings that month, and only with at least{' '}
              {list.data.rules.min_ratings} ratings; otherwise × 1.00. Change the bands in Settings.
            </p>
            <ul className="text-sm text-text">
              {list.data.rules.bands.map((b) => (
                <li key={b.label} className="flex justify-between gap-md">
                  <span>Average {b.label}</span>
                  <span>× {b.multiplier}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

type Tab = 'runs' | 'estimate';

/** Admin: payroll runs (draft → approve → paid) and the live stylist pay estimate. */
export default function PayrollPage() {
  useDocumentTitle('Payroll');
  const [tab, setTab] = useState<Tab>('runs');
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Payroll"
        description="Run payroll for a month, adjust with a reason, approve to lock it, then mark it paid. Payment is simulated."
      />
      <Tabs
        label="Payroll sections"
        idPrefix="payroll"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'runs', label: 'Payroll runs' },
          { id: 'estimate', label: 'Stylist pay estimate' },
        ]}
      />
      <TabPanel idPrefix="payroll" id={tab}>
        {tab === 'runs' ? <PayrollRuns /> : <StylistEstimate />}
      </TabPanel>
    </div>
  );
}
