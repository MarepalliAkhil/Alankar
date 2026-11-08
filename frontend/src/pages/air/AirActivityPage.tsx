import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  claimNeeds,
  getAirActivity,
  getAirStats,
  resolveNeeds,
  revealPhone,
  undoAirAction,
  type AirActionType,
  type AirActivityRow,
  type AirKpiKey,
  type AirRange,
  type AirStats,
  type NeedsItem,
} from '../../api/airDesk';
import { errorDetail } from '../../api/client';
import type { StatsTable } from '../../api/stats';
import { StatTile, type Good } from '../../components/admin/StatTile';
import { StatsTableCard } from '../../components/admin/StatsTableCard';
import { AirCharacter } from '../../components/air/Air';
import { isNightInIndia, poseFor } from '../../components/air/air-data';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  Select,
  SkeletonChart,
  Table,
  Tabs,
  useToast,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { saveBlob } from '../../lib/saveBlob';
import { useSession } from '../../session/session-context';
import {
  STYLIST_SERIES,
  TYPE_SERIES,
  SAFE,
  funnelSummary,
  hourlySummary,
  linksSummary,
  productsSummary,
  shortDay,
  stylistSummary,
  tableCsv,
  timeOf,
  trendSummary,
} from './air-charts';
import AirSettingsPanel from './AirSettingsPanel';

const StackedBarView = lazy(() => import('../../components/charts/StackedBarView'));
const BarChartView = lazy(() => import('../../components/charts/BarChartView'));
const ConversationTrendView = lazy(() => import('../../components/charts/ConversationTrendView'));

const RANGES = [
  { value: 'since_last', label: 'Since my last session' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
] as const;

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  ...TYPE_SERIES.map((s) => ({ value: s.key, label: s.label })),
];

const count = (v: number | string) => String(v);
const percent = (v: number | string) => `${v}%`;

/** AIR Activity (receptionist and admin): what AIR did, what needs a person, and the numbers. */
export default function AirActivityPage() {
  useDocumentTitle('AIR Activity');
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<'activity' | 'settings'>('activity');
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="AIR · virtual receptionist"
        title="AIR Activity"
        description="What AIR did while it covered the front desk, counted from the action log and the booking, payment and order records. AIR is optional and off unless the admin switches it on."
      />
      {isAdmin && (
        <Tabs
          items={[
            { id: 'activity', label: 'Activity' },
            { id: 'settings', label: 'AIR settings' },
          ]}
          value={tab}
          onChange={setTab}
          label="AIR Activity sections"
          idPrefix="air"
        />
      )}
      <div
        role={isAdmin ? 'tabpanel' : undefined}
        id={isAdmin ? `air-panel-${tab}` : undefined}
        aria-labelledby={isAdmin ? `air-tab-${tab}` : undefined}
        className="flex flex-col gap-lg"
      >
        {isAdmin && tab === 'settings' ? <AirSettingsPanel /> : <Activity />}
      </div>
    </div>
  );
}

function Activity() {
  const [range, setRange] = useState<AirRange>('since_last');
  const stats = useQuery({
    queryKey: ['air-stats', range],
    queryFn: () => getAirStats(range),
    staleTime: 30_000,
  });
  const data = stats.data;
  return (
    <>
      <Card variant="dense" as="section" aria-label="Range" className="flex flex-col gap-sm">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <FilterChips label="Range" options={RANGES} value={range} onChange={setRange} />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={stats.isFetching}
            onClick={() => void stats.refetch()}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh
          </Button>
        </div>
        {data && (
          <p className="text-sm text-text-muted">
            {data.range_label}: {timeOf(data.period.start)} to {timeOf(data.period.end)} (India
            time), compared with the same length of time just before.
          </p>
        )}
      </Card>
      {stats.isPending ? (
        <Card variant="dense">
          <LoadingState label="Counting what AIR did…" lines={4} />
        </Card>
      ) : stats.isError ? (
        <Card variant="dense">
          <ErrorState
            description={errorDetail(stats.error) ?? "We couldn't load AIR's numbers."}
            onRetry={() => void stats.refetch()}
          />
        </Card>
      ) : data ? (
        <Dashboard data={data} range={range} />
      ) : null}
    </>
  );
}

function CoverBanner({ active }: { active: boolean }) {
  if (!active) return null;
  const night = isNightInIndia();
  return (
    <Card variant="dense" as="section" aria-label="Desk cover" className="flex items-center gap-md">
      <AirCharacter
        pose={poseFor(night ? 'night-cover' : 'day-cover')}
        decorative
        className="w-16"
      />
      <p className="text-sm font-medium text-text">
        AIR is covering the front desk right now
        {night ? ' (overnight)' : ''}: no receptionist is on shift or signed in.
      </p>
    </Card>
  );
}

function Dashboard({ data, range }: { data: AirStats; range: AirRange }) {
  const toast = useToast();
  const t = data.tables;
  const k = (key: AirKpiKey) => data.kpis[key];
  const tile = (key: AirKpiKey, label: string, good: Good = 'up', format = count) => (
    <StatTile key={key} label={label} kpi={k(key)} format={format} good={good} empty="None yet" />
  );
  const exportTable = (name: string, table: StatsTable) => {
    try {
      saveBlob(new Blob([tableCsv(table)], { type: 'text/csv' }), `air-${name}-${range}.csv`);
    } catch {
      toast.show({ tone: 'danger', title: 'Download failed' });
    }
  };
  const card = (name: string) => ({ onExport: () => exportTable(name, t[name as keyof typeof t]) });
  const fallback = <SkeletonChart label="Drawing the chart…" />;
  const noNulls = (rows: StatsTable['rows']) =>
    rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? 0])));
  const hours = noNulls(t.hourly.rows);
  const funnel = t.funnel.rows.map((r) => ({ label: String(r.step), value: Number(r.count) }));
  const links = t.links.rows.map((r) => ({ label: String(r.status), value: Number(r.count) }));
  const trend = t.conversations.rows.map((r) => ({
    day: shortDay(String(r.date)),
    chat: Number(r.chat),
    voice: Number(r.voice),
    rate: r.rate === null ? null : Number(r.rate),
  }));
  const products = t.products.rows.map((r) => ({
    label: String(r.name),
    value: Number(r.stock_before ?? 0),
    value2: Number(r.stock_after ?? 0),
  }));
  const changes: StatsTable = {
    ...t.product_changes,
    rows: t.product_changes.rows.map((r) => ({ ...r, when: timeOf(String(r.when)) })),
  };

  return (
    <>
      <CoverBanner active={data.cover.active} />
      <NeedsYou items={data.needs_you} />

      <section aria-labelledby="air-kpis" className="flex flex-col gap-md">
        <h2 id="air-kpis" className="text-xl font-semibold text-text">
          The numbers
        </h2>
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
          {tile('conversations', 'Conversations attended', 'neutral')}
          {tile('booking_requests', 'Booking requests taken')}
          {tile('reception_accepted', 'Desk side accepted by AIR', 'neutral')}
          {tile('stylist_accepted', 'Accepted by the stylist')}
          {tile('declined_or_timed_out', 'Declined or no answer in time', 'down')}
          {tile('links_sent', 'Payment links sent', 'neutral')}
          {tile('links_paid', 'Payment links paid')}
          {tile('links_expired', 'Payment links expired', 'down')}
          {tile('confirmed', 'Confirmed (paid and scheduled)')}
          {tile('orders', 'Product orders created or changed', 'neutral')}
          {tile('handed_off', 'Handed to a person', 'down')}
          {tile('handover_rate', 'Handover rate', 'down', percent)}
        </div>
        <p className="text-xs text-text-muted">
          Waiting for a stylist right now: {data.counts.awaiting_stylist ?? 0}. Definitions are in
          the AIR guide (docs/AIR.md, section 14).
        </p>
      </section>

      <section aria-labelledby="air-charts" className="flex flex-col gap-md">
        <h2 id="air-charts" className="text-xl font-semibold text-text">
          Charts
        </h2>
        <div className="grid min-w-0 gap-md xl:grid-cols-2">
          <StatsTableCard
            title="Actions by hour"
            description={hourlySummary(t.hourly)}
            table={t.hourly}
            chart={
              <Suspense fallback={fallback}>
                <StackedBarView
                  title={`AIR actions by hour of the day, stacked by type. ${hourlySummary(t.hourly)}`}
                  data={hours}
                  xKey="hour"
                  series={TYPE_SERIES}
                />
              </Suspense>
            }
            emptyTitle="No actions"
            emptyText="AIR took no actions in this range."
            {...card('hourly')}
          />
          <StatsTableCard
            title="Booking funnel"
            description={funnelSummary(t.funnel, t.lost)}
            table={t.funnel}
            chart={
              <Suspense fallback={fallback}>
                <BarChartView
                  title={`Booking funnel. ${funnelSummary(t.funnel, t.lost)}`}
                  data={funnel}
                  valueLabel="Requests"
                />
              </Suspense>
            }
            emptyTitle="No requests"
            emptyText="AIR took no booking requests in this range."
            {...card('funnel')}
          />
          <StatsTableCard
            title="Ended without a booking"
            description="Shown beside the funnel: requests that were declined, not answered in time, or whose payment link expired."
            table={t.lost}
            emptyTitle="Nothing lost"
            emptyText="No request ended without a booking."
            collapsible={false}
            {...card('lost')}
          />
          <StatsTableCard
            title="Payment links"
            description={linksSummary(t.links)}
            table={t.links}
            chart={
              <Suspense fallback={fallback}>
                <BarChartView
                  title={`Payment links by status. ${linksSummary(t.links)}`}
                  data={links}
                  valueLabel="Links"
                />
              </Suspense>
            }
            emptyTitle="No links"
            emptyText="No payment links in this range."
            {...card('links')}
          />
          <StatsTableCard
            title="Stylist responses"
            description={stylistSummary(t.stylists)}
            table={t.stylists}
            chart={
              <Suspense fallback={fallback}>
                <StackedBarView
                  title={`Stylist answers to AIR requests. ${stylistSummary(t.stylists)}`}
                  data={noNulls(t.stylists.rows)}
                  xKey="name"
                  series={STYLIST_SERIES}
                />
              </Suspense>
            }
            emptyTitle="No answers"
            emptyText="No stylist had to answer an AIR request."
            {...card('stylists')}
          />
          <StatsTableCard
            title="Conversations and handover rate (7 days)"
            description={trendSummary(t.conversations, data.channels.chat, data.channels.voice)}
            table={t.conversations}
            chart={
              <Suspense fallback={fallback}>
                <ConversationTrendView
                  data={trend}
                  title={`Conversations per day by chat and voice, with the handover rate line. ${trendSummary(t.conversations, data.channels.chat, data.channels.voice)}`}
                />
              </Suspense>
            }
            emptyTitle="No conversations"
            emptyText="Nobody talked to AIR in the last 7 days."
            {...card('conversations')}
          />
          <StatsTableCard
            title="Products updated"
            description={productsSummary(t.products)}
            table={t.products}
            chart={
              <Suspense fallback={fallback}>
                <BarChartView
                  title={`Stock before and after AIR's changes, per product. ${productsSummary(t.products)}`}
                  data={products}
                  valueLabel="Stock before"
                  value2Label="Stock after"
                />
              </Suspense>
            }
            emptyTitle="No product changes"
            emptyText="AIR did not change any product stock."
            {...card('products')}
          />
        </div>
        <p className="text-xs text-text-muted">
          Colours are a colour-blind-safe set ({Object.keys(SAFE).length} shades); every chart also
          has a sentence above it and a table with the same numbers.
        </p>
      </section>

      <ActivityTable range={range} customers={data.customers} />

      <section aria-labelledby="air-customers" className="grid min-w-0 gap-md xl:grid-cols-2">
        <h2 id="air-customers" className="sr-only">
          Customers and products
        </h2>
        <CustomersPanel rows={data.customers} />
        <StatsTableCard
          title="Products panel"
          description="Every stock change AIR made: product, change, quantity, stock before and after, and the order."
          table={changes}
          emptyTitle="No product changes"
          emptyText="AIR did not touch any product in this range."
          collapsible={false}
          {...card('product_changes')}
        />
      </section>
    </>
  );
}

function NeedsYou({ items }: { items: NeedsItem[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const me = user?.full_name ?? '';
  const act = useMutation({
    mutationFn: ({ item, what }: { item: NeedsItem; what: 'claim' | 'resolve' }) =>
      what === 'claim' ? claimNeeds(item.kind, item.ref) : resolveNeeds(item.kind, item.ref),
    onSuccess: (_, { what }) => {
      toast.show({ tone: 'success', title: what === 'claim' ? 'Claimed' : 'Marked as resolved' });
      void queryClient.invalidateQueries({ queryKey: ['air-stats'] });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Could not update',
        description: errorDetail(error) ?? 'Please try again.',
      }),
  });
  return (
    <Card variant="dense" as="section" aria-labelledby="air-needs" className="flex flex-col gap-sm">
      <div className="flex items-center gap-sm">
        <AirCharacter
          pose={poseFor(items.length ? 'pointing' : 'mood', items.length ? undefined : 'idle')}
          decorative
          className="w-12"
        />
        <h2 id="air-needs" className="text-xl font-semibold text-text">
          Needs you {items.length > 0 && <Badge tone="warning">{items.length}</Badge>}
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing needs a person right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const mine = item.claimed_by && item.claimed_by === me;
            return (
              <li
                key={`${item.kind}-${item.ref}`}
                className="flex flex-wrap items-center justify-between gap-sm py-sm"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-text">
                    <Badge tone="neutral">{item.kind_label}</Badge> {item.title}
                  </p>
                  <p className="break-words text-xs text-text-muted">
                    {item.customer && `${item.customer} · `}
                    {timeOf(item.when)}
                    {item.claimed_by && ` · Claimed by ${item.claimed_by}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-xs">
                  {item.link && (
                    <Link
                      to={item.link}
                      className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-md text-sm text-text hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      Open
                    </Link>
                  )}
                  {!item.claimed_by && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={act.isPending && act.variables?.item === item}
                      onClick={() => act.mutate({ item, what: 'claim' })}
                    >
                      Claim
                    </Button>
                  )}
                  {(!item.claimed_by || mine || user?.role === 'admin') && (
                    <Button
                      size="sm"
                      loading={act.isPending && act.variables?.item === item}
                      onClick={() => act.mutate({ item, what: 'resolve' })}
                    >
                      Resolved
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PhoneCell({ row }: { row: AirActivityRow }) {
  const [shown, setShown] = useState<string | null>(null);
  const toast = useToast();
  if (!row.customer_id || !row.phone_masked) return <span className="text-text-muted">–</span>;
  if (shown !== null) return <span className="tabular-nums">{shown}</span>;
  return (
    <button
      type="button"
      className="tabular-nums text-text underline decoration-dotted underline-offset-2 focus-visible:shadow-focus focus-visible:outline-none"
      aria-label={`Show the phone number ending ${row.phone_masked.slice(-4)}`}
      onClick={() => {
        revealPhone(row.customer_id!)
          .then(setShown)
          .catch((error) =>
            toast.show({
              tone: 'danger',
              title: 'Could not show it',
              description: errorDetail(error),
            }),
          );
      }}
    >
      {row.phone_masked}
    </button>
  );
}

function ActivityTable({
  range,
  customers,
}: {
  range: AirRange;
  customers: AirStats['customers'];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<AirActionType | ''>('');
  const [customer, setCustomer] = useState('');
  const rows = useQuery({
    queryKey: ['air-activity', range, type, customer],
    queryFn: () => getAirActivity(range, { type, customer }),
  });
  const undo = useMutation({
    mutationFn: (id: string) => undoAirAction(id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Undone' });
      void queryClient.invalidateQueries({ queryKey: ['air-activity'] });
      void queryClient.invalidateQueries({ queryKey: ['air-stats'] });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Could not undo',
        description: errorDetail(error) ?? 'Please try again.',
      }),
  });
  const columns: Column<AirActivityRow>[] = [
    { key: 'when', header: 'Time', render: (r) => timeOf(r.when) },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <span className="flex flex-col">
          <span>{r.customer || '–'}</span>
          <PhoneCell row={r} />
        </span>
      ),
    },
    { key: 'action', header: 'What AIR did', render: (r) => r.action },
    { key: 'result', header: 'Result', render: (r) => r.result },
    {
      key: 'link',
      header: 'Booking or order',
      render: (r) =>
        r.link ? (
          <Link to={r.link} className="text-text underline underline-offset-2">
            {r.link_label}
          </Link>
        ) : (
          '–'
        ),
    },
    {
      key: 'undo',
      header: 'Undo',
      render: (r) =>
        r.can_undo ? (
          <Button
            size="sm"
            variant="secondary"
            loading={undo.isPending && undo.variables === r.id}
            onClick={() => undo.mutate(r.id)}
          >
            Undo
          </Button>
        ) : (
          <span className="text-text-muted">–</span>
        ),
    },
  ];
  return (
    <Card
      variant="dense"
      as="section"
      aria-labelledby="air-activity"
      className="flex min-w-0 flex-col gap-md"
    >
      <h2 id="air-activity" className="text-xl font-semibold text-text">
        Activity
      </h2>
      <div className="grid gap-md sm:grid-cols-2 lg:max-w-2xl">
        <Select
          label="Type"
          options={TYPE_OPTIONS}
          value={type}
          onChange={(e) => setType(e.target.value as AirActionType | '')}
        />
        <Select
          label="Customer"
          options={[
            { value: '', label: 'All customers' },
            ...customers.map((c) => ({ value: c.customer_id, label: c.name })),
          ]}
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        />
      </div>
      <p className="text-xs text-text-muted">
        Phone numbers are hidden: select one to show it (the view is recorded). Undo works only for
        AIR's own held times and unpaid requests, within the undo window; a paid booking is never
        undone.
      </p>
      {rows.isPending ? (
        <LoadingState label="Loading the activity…" lines={3} />
      ) : rows.isError ? (
        <ErrorState
          description="We couldn't load the activity."
          onRetry={() => void rows.refetch()}
        />
      ) : rows.data.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="AIR did nothing that matches these filters."
        />
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <Table caption="What AIR did" columns={columns} rows={rows.data} rowKey={(r) => r.id} />
        </div>
      )}
    </Card>
  );
}

function CustomersPanel({ rows }: { rows: AirStats['customers'] }) {
  return (
    <Card
      variant="dense"
      as="section"
      aria-label="Customers panel"
      className="flex min-w-0 flex-col gap-sm"
    >
      <h3 className="text-lg font-semibold text-text">Customers panel</h3>
      <p className="text-sm text-text-muted">Who AIR dealt with, and what it did for each.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">No customers in this range.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((c) => (
            <li key={c.customer_id} className="py-sm">
              <p className="text-sm font-medium text-text">
                {c.name}{' '}
                <span className="text-xs font-normal text-text-muted">
                  {c.actions} actions · last {timeOf(c.last)}
                </span>
              </p>
              <p className="break-words text-xs text-text-muted">{c.did.join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
