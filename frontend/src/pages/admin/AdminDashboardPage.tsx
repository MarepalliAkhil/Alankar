import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { errorDetail } from '../../api/client';
import {
  downloadStatsTable,
  getShopStats,
  type KpiKey,
  type Preset,
  type ShopStats,
  type StatsQuery,
  type TableKey,
} from '../../api/stats';
import { StatTile, type Good } from '../../components/admin/StatTile';
import { StatsTableCard } from '../../components/admin/StatsTableCard';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  LoadingState,
  SkeletonChart,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatINR } from '../../lib/format';
import { rangeProblem } from '../../lib/reportDates';
import { saveBlob } from '../../lib/saveBlob';
import type { Report } from '../../api/reports';

const StackedBarView = lazy(() => import('../../components/charts/StackedBarView'));
const HBarView = lazy(() => import('../../components/charts/HBarView'));
const HeatmapView = lazy(() => import('../../components/charts/HeatmapView'));

const PRESET_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
] as const;

const STREAM_SERIES = [
  { key: 'services', label: 'Services', color: 'var(--color-primary)' },
  { key: 'products', label: 'Products', color: 'var(--color-accent)' },
  { key: 'tips', label: 'Tips', color: 'var(--color-warning)' },
  { key: 'packages', label: 'Packages', color: 'var(--color-info)' },
  { key: 'memberships', label: 'Memberships', color: 'var(--color-success)' },
] as const;

const BOOKING_SERIES = [
  { key: 'completed', label: 'Completed', color: 'var(--color-success)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--color-warning)' },
  { key: 'no_show', label: 'No-shows', color: 'var(--color-danger)' },
  { key: 'other', label: 'Booked or other', color: 'var(--color-primary)' },
] as const;

const money = (v: number | string) => formatINR(v);
const count = (v: number | string) => String(v);
const percent = (v: number | string) => `${v}%`;
const minutes = (v: number | string) => {
  const n = Number(v);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};
const stars = (v: number | string) => `${v} / 5`;
const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Admin dashboard: shop statistics for a date range, compared with the period before. */
export default function AdminDashboardPage() {
  useDocumentTitle('Dashboard');
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const [exporting, setExporting] = useState<TableKey | null>(null);
  const problem = preset === 'custom' ? rangeProblem(custom) : null;
  const query: StatsQuery = useMemo(
    () => (preset === 'custom' ? { preset, ...custom } : { preset }),
    [preset, custom],
  );
  const stats = useQuery({
    queryKey: ['shop-stats', query],
    queryFn: () => getShopStats(query),
    enabled: problem === null,
    staleTime: 60_000,
  });

  const exportTable = async (table: TableKey) => {
    setExporting(table);
    try {
      const p = stats.data?.period;
      saveBlob(await downloadStatsTable(query, table), `${table}_${p?.from}_${p?.to}.csv`);
    } catch (error) {
      toast.show({
        tone: 'danger',
        title: 'Download failed',
        description: errorDetail(error) ?? 'Please try again.',
      });
    } finally {
      setExporting(null);
    }
  };

  const data = stats.data;
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Shop statistics"
        description="Numbers from your own bills, bookings and ratings. Revenue is before GST. Every figure is compared with the same number of days just before."
      />

      <Card variant="dense" as="section" aria-label="Date range" className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <FilterChips
            label="Date range"
            options={PRESET_OPTIONS}
            value={preset}
            onChange={setPreset}
          />
          <div className="flex items-center gap-sm text-xs text-text-muted">
            {data && (
              <span>
                Last updated{' '}
                {new Date(data.generated_at).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={stats.isFetching}
              disabled={problem !== null}
              onClick={() => void stats.refetch()}
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
        {preset === 'custom' && (
          <div className="grid gap-md sm:grid-cols-2 lg:max-w-xl">
            <Input
              label="From"
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
            <Input
              label="To"
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        {data && (
          <p className="text-sm text-text-muted">
            Showing {day(data.period.from)} to {day(data.period.to)} ({data.period.days}{' '}
            {data.period.days === 1 ? 'day' : 'days'}), compared with{' '}
            {day(data.period.previous_from)} to {day(data.period.previous_to)}.
          </p>
        )}
      </Card>

      {problem ? null : stats.isPending ? (
        <Card variant="dense">
          <LoadingState label="Counting your numbers…" lines={4} />
        </Card>
      ) : stats.isError ? (
        <Card variant="dense">
          <ErrorState
            description={errorDetail(stats.error) ?? "We couldn't load the statistics."}
            onRetry={() => void stats.refetch()}
          />
        </Card>
      ) : data ? (
        <Dashboard data={data} exportTable={exportTable} exporting={exporting} />
      ) : null}
    </div>
  );
}

interface DashboardProps {
  data: ShopStats;
  exportTable: (table: TableKey) => Promise<void>;
  exporting: TableKey | null;
}

function Dashboard({ data, exportTable, exporting }: DashboardProps) {
  const k = (key: KpiKey) => data.kpis[key];
  const t = data.tables;
  const req = data.details.requests;
  const offers = data.details.offers;
  const extra = data.details.revenue_extra;
  const nothing = data.details.bookings_total === 0 && Number(k('revenue_total').value) === 0;
  const tile = (
    key: KpiKey,
    label: string,
    format: (v: number | string) => string,
    good: Good = 'up',
    empty?: string,
  ) => <StatTile key={key} label={label} kpi={k(key)} format={format} good={good} empty={empty} />;
  const exportProps = (table: TableKey) => ({
    onExport: () => void exportTable(table),
    exporting: exporting === table,
  });

  const trend = t.revenue_trend.rows.map((r) => ({
    ...r,
    day: day(String(r.date)),
    services: Number(r.services),
    products: Number(r.products),
    tips: Number(r.tips),
    packages: Number(r.packages),
    memberships: Number(r.memberships),
  }));
  const perDay = t.bookings_per_day.rows.map((r) => ({
    day: day(String(r.date)),
    completed: Number(r.completed),
    cancelled: Number(r.cancelled),
    no_show: Number(r.no_show),
    other: Number(r.total) - Number(r.completed) - Number(r.cancelled) - Number(r.no_show),
  }));
  const heat: Report = {
    key: 'busiest',
    label: 'Busiest hours',
    from: data.period.from,
    to: data.period.to,
    columns: t.busiest_hours.columns,
    rows: t.busiest_hours.rows as Report['rows'],
    totals: (t.busiest_hours.totals ?? {}) as Report['totals'],
    chart: { kind: 'heatmap', x: 'weekday', hours: t.busiest_hours.hours ?? [] },
  };
  const ranked = (table: TableKey, valueKey: string) =>
    t[table].rows.slice(0, 8).map((r) => ({ label: String(r.name), value: Number(r[valueKey]) }));
  const chartFallback = <SkeletonChart label="Drawing the chart…" />;
  const total = money(k('revenue_total').value as string);

  return (
    <>
      {nothing && (
        <Card variant="dense">
          <EmptyState
            title="No bills or bookings in this range"
            description="Nothing was billed or booked on these days, so the numbers below are zero. Try a wider range."
          />
        </Card>
      )}

      <section aria-labelledby="stats-revenue" className="flex flex-col gap-md">
        <h2 id="stats-revenue" className="text-xl font-semibold text-text">
          Revenue
        </h2>
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
          {tile('revenue_total', 'Total revenue', money)}
          {tile('revenue_services', 'Services', money)}
          {tile('revenue_products', 'Products', money)}
          {tile('revenue_tips', 'Tips', money)}
          {tile('revenue_packages', 'Packages', money)}
          {tile('revenue_memberships', 'Memberships', money)}
          {tile('average_bill', 'Average bill (with GST)', money, 'up', 'No bills yet')}
          {tile('bills', 'Bills', count)}
        </div>
        <p className="text-xs text-text-muted">
          Refunds paid in this range: {money(extra.refunds_paid)} (not taken off the figures above).
          Online shop orders: {extra.online_orders} for {money(extra.online_orders_total)} with GST,
          counted separately.
        </p>
        <StatsTableCard
          title="Revenue per day"
          description={`Stacked by where the money came from. Total ${total}.`}
          table={t.revenue_trend}
          chart={
            <Suspense fallback={chartFallback}>
              <StackedBarView
                title={`Revenue per day, ${total} in all`}
                data={trend}
                xKey="day"
                series={STREAM_SERIES}
                format={money}
              />
            </Suspense>
          }
          emptyTitle="No revenue yet"
          emptyText="Nothing was billed or sold in this range."
          {...exportProps('revenue_trend')}
        />
        <StatsTableCard
          title="Revenue by stream"
          table={t.revenue_streams}
          emptyTitle="No revenue yet"
          emptyText="Nothing was billed or sold in this range."
          {...exportProps('revenue_streams')}
        />
      </section>

      <section aria-labelledby="stats-bookings" className="flex flex-col gap-md">
        <h2 id="stats-bookings" className="text-xl font-semibold text-text">
          Bookings
        </h2>
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
          {tile('bookings', 'Bookings', count)}
          {tile('completed', 'Completed', count)}
          {tile('cancelled', 'Cancelled', count, 'down')}
          {tile('no_show', 'No-shows', count, 'down')}
        </div>
        <div className="grid gap-md lg:grid-cols-2">
          <StatsTableCard
            title="Bookings by status"
            table={t.bookings_by_status}
            emptyTitle="No bookings"
            emptyText="There were no bookings or requests on these days."
            {...exportProps('bookings_by_status')}
          />
          <StatsTableCard
            title="Bookings per day"
            table={t.bookings_per_day}
            chart={
              <Suspense fallback={chartFallback}>
                <StackedBarView
                  title="Bookings per day by outcome"
                  data={perDay}
                  xKey="day"
                  series={BOOKING_SERIES}
                />
              </Suspense>
            }
            emptyTitle="No bookings"
            emptyText="There were no bookings or requests on these days."
            {...exportProps('bookings_per_day')}
          />
        </div>
        <StatsTableCard
          title="Busiest hours"
          description={
            t.busiest_hours.busiest
              ? `Busiest slot: ${t.busiest_hours.busiest}. Darker means more visits; each cell shows its number.`
              : 'Visits by weekday and hour.'
          }
          table={t.busiest_hours}
          chart={
            <Suspense fallback={chartFallback}>
              <HeatmapView report={heat} />
            </Suspense>
          }
          collapsible={false}
          emptyTitle="No visits"
          emptyText="No booked or completed visits in this range."
          {...exportProps('busiest_hours')}
        />
      </section>

      <section aria-labelledby="stats-people" className="flex flex-col gap-md">
        <h2 id="stats-people" className="text-xl font-semibold text-text">
          Team and customers
        </h2>
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
          {tile('average_rating', 'Average rating', stars, 'up', 'No ratings yet')}
          {tile('utilization_pct', 'Stylist utilization', percent, 'up', 'No working hours')}
          {tile('new_customers', 'New customers', count)}
          {tile('returning_customers', 'Returning customers', count)}
          {tile('acceptance_pct', 'Requests accepted', percent, 'up', 'No answered requests')}
          {tile('decision_minutes', 'Time to a decision', minutes, 'down', 'No decisions yet')}
          {tile('desk_minutes', 'Front desk reply', minutes, 'down', 'No replies yet')}
          {tile('stylist_minutes', 'Stylist reply', minutes, 'down', 'No replies yet')}
        </div>
        <p className="text-xs text-text-muted">
          {req.requests} booking {req.requests === 1 ? 'request' : 'requests'} came in:{' '}
          {req.accepted} accepted by both, {req.declined} declined, {req.expired} expired,{' '}
          {req.open} still open. Customers counted are those billed in the range; &quot;new&quot;
          means their first bill is in it.
        </p>
        <div className="grid gap-md lg:grid-cols-2">
          <StatsTableCard
            title="Top stylists"
            description="By revenue from services they performed."
            table={t.top_stylists}
            chart={
              <Suspense fallback={chartFallback}>
                <HBarView
                  title="Top stylists by revenue"
                  valueLabel="Revenue"
                  data={ranked('top_stylists', 'revenue')}
                  format={money}
                />
              </Suspense>
            }
            emptyTitle="No stylist data"
            emptyText="No bills or ratings in this range."
            {...exportProps('top_stylists')}
          />
        </div>
        <StatsTableCard
          title="Stylist utilization"
          description="Booked minutes against working minutes (approved days off taken out)."
          table={t.utilization}
          emptyTitle="No stylists"
          emptyText="There are no stylists with working hours."
          collapsible={false}
          {...exportProps('utilization')}
        />
      </section>

      <section aria-labelledby="stats-sales" className="flex flex-col gap-md">
        <h2 id="stats-sales" className="text-xl font-semibold text-text">
          Services and products
        </h2>
        <div className="grid gap-md lg:grid-cols-2">
          <StatsTableCard
            title="Revenue by service"
            table={t.revenue_by_service}
            chart={
              <Suspense fallback={chartFallback}>
                <HBarView
                  title="Revenue by service"
                  valueLabel="Revenue"
                  data={ranked('revenue_by_service', 'revenue')}
                  format={money}
                />
              </Suspense>
            }
            emptyTitle="No services billed"
            emptyText="No service was billed in this range."
            {...exportProps('revenue_by_service')}
          />
          <StatsTableCard
            title="Top products"
            table={t.top_products}
            chart={
              <Suspense fallback={chartFallback}>
                <HBarView
                  title="Top products by revenue"
                  valueLabel="Revenue"
                  data={ranked('top_products', 'revenue')}
                  format={money}
                />
              </Suspense>
            }
            emptyTitle="No products sold"
            emptyText="No product was sold at the counter in this range."
            {...exportProps('top_products')}
          />
        </div>
        <StatsTableCard
          title="Low stock"
          description="Products at or below their low-stock level right now (not tied to the dates)."
          table={t.low_stock}
          emptyTitle="Nothing is low"
          emptyText="Every active product is above its low-stock level."
          collapsible={false}
          {...exportProps('low_stock')}
        />
      </section>

      <section aria-labelledby="stats-offers" className="flex flex-col gap-md">
        <h2 id="stats-offers" className="text-xl font-semibold text-text">
          Coupons, packages and memberships
        </h2>
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
          <Fact
            label="Coupons used"
            value={String(offers.coupons.uses)}
            note={`${money(offers.coupons.given)} given as discount`}
          />
          <Fact
            label="Packages sold"
            value={String(offers.packages.sold)}
            note={`${money(offers.packages.net)} after refunds · ${offers.packages.sessions_used} sessions used`}
          />
          <Fact
            label="Memberships sold"
            value={String(offers.memberships.sold)}
            note={`${money(offers.memberships.net)} after refunds`}
          />
          <Fact
            label="Active memberships"
            value={String(offers.memberships.active_now)}
            note={`${offers.memberships.joined} joined · ${offers.memberships.renewed} renewed · ${offers.memberships.cancelled + offers.memberships.ended} ended in range`}
          />
        </div>
        <div className="grid gap-md lg:grid-cols-2">
          <StatsTableCard
            title="Coupons by use"
            table={t.coupons}
            emptyTitle="No coupons used"
            emptyText="No coupon was used on a bill in this range."
            collapsible={false}
            {...exportProps('coupons')}
          />
          <StatsTableCard
            title="Payroll"
            description="Payroll runs for the months this range touches."
            table={t.payroll}
            emptyTitle="No months"
            emptyText="No payroll months in this range."
            collapsible={false}
            {...exportProps('payroll')}
          />
        </div>
      </section>
    </>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="glass-dense flex min-w-0 flex-col gap-1 rounded-card p-md">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-text">{value}</p>
      <p className="text-xs text-text-muted">{note}</p>
    </div>
  );
}
