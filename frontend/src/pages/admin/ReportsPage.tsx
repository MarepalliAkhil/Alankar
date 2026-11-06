import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import {
  downloadReport,
  getReport,
  listReports,
  type Report,
  type ReportRow,
} from '../../api/reports';
import { errorDetail } from '../../api/client';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  SkeletonChart,
  Select,
  Table,
  useToast,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatINR } from '../../lib/format';
import { defaultRange, PRESETS, rangeProblem, type DateRange } from '../../lib/reportDates';

const BarChartView = lazy(() => import('../../components/charts/BarChartView'));
const HeatmapView = lazy(() => import('../../components/charts/HeatmapView'));

const cell = (report: Report, key: string, row: ReportRow): string => {
  const value = row[key];
  if (value === undefined || value === '') return '';
  const kind = report.columns.find((c) => c.key === key)?.kind;
  return kind === 'money' ? formatINR(value) : String(value);
};

/** Admin: thirteen reports with a date range, a chart and a CSV download. */
export default function ReportsPage() {
  useDocumentTitle('Reports');
  const toast = useToast();
  const [name, setName] = useState('revenue-by-day');
  const [range, setRange] = useState<DateRange>(() => defaultRange());
  const [downloading, setDownloading] = useState(false);
  const problem = rangeProblem(range);
  const names = useQuery({ queryKey: ['report-names'], queryFn: listReports });
  const report = useQuery({
    queryKey: ['report', name, range.from, range.to],
    queryFn: () => getReport(name, range),
    enabled: problem === null,
  });

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await downloadReport(name, range);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}_${range.from}_${range.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.show({
        tone: 'danger',
        title: 'Download failed',
        description: errorDetail(error) ?? 'Please try again.',
      });
    } finally {
      setDownloading(false);
    }
  };

  const data = report.data;
  const columns: Column<ReportRow>[] = data
    ? data.columns.map((c) => ({
        key: c.key,
        header: c.label,
        className: c.kind === 'text' ? '' : 'text-right',
        render: (row) => (
          <span className={c.kind === 'text' ? '' : 'tabular-nums'}>{cell(data, c.key, row)}</span>
        ),
      }))
    : [];

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Reports"
        description="Revenue is the bill before GST, shared over its lines. The totals always equal the invoices in the range. Refunds are shown on the day they were paid."
      />
      <Card variant="dense" as="section" aria-label="Report settings">
        <div className="grid gap-md md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <Select
            label="Report"
            value={name}
            onChange={(e) => setName(e.target.value)}
            options={(names.data ?? [{ key: name, label: 'Report' }]).map((r) => ({
              value: r.key,
              label: r.label,
            }))}
          />
          <Input
            label="From"
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
          <Input
            label="To"
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void download()}
            loading={downloading}
            disabled={problem !== null}
          >
            <Download className="size-4" aria-hidden /> Download CSV
          </Button>
        </div>
        <div className="mt-sm flex flex-wrap gap-xs">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRange(p.range(new Date()))}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {problem && (
          <p role="alert" className="mt-sm text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </Card>

      {problem ? null : report.isPending ? (
        <Card variant="dense">
          <LoadingState label="Loading the report…" />
        </Card>
      ) : report.isError ? (
        <Card variant="dense">
          <ErrorState
            description={errorDetail(report.error) ?? "We couldn't load this report."}
            onRetry={() => void report.refetch()}
          />
        </Card>
      ) : data ? (
        <>
          <Card variant="dense" as="section" aria-label={data.label}>
            <h2 className="text-lg font-semibold text-text">{data.label}</h2>
            <p className="text-sm text-text-muted">
              {data.from} to {data.to}
              {data.summary?.lost_rate
                ? ` · ${data.summary.lost_rate}% of appointments were no-shows or cancelled`
                : ''}
              {data.summary?.busiest ? ` · busiest: ${data.summary.busiest}` : ''}
              {data.summary?.difference !== undefined
                ? ` · bills ${formatINR(data.summary.bills_collected)} against payments ${formatINR(data.summary.checkout_payments)} (difference ${formatINR(data.summary.difference)})`
                : ''}
              {data.summary?.gift_card_balance_outstanding !== undefined
                ? ` · gift-card balance still to honour: ${formatINR(data.summary.gift_card_balance_outstanding)}`
                : ''}
            </p>
            {data.rows.length === 0 ? (
              <EmptyState title="Nothing in this range" description="Try a wider range of dates." />
            ) : data.chart.kind === 'heatmap' ? (
              <Suspense fallback={<SkeletonChart label="Drawing the chart…" />}>
                <HeatmapView report={data} />
              </Suspense>
            ) : (
              <Suspense fallback={<SkeletonChart label="Drawing the chart…" />}>
                <BarChartView
                  title={`${data.label} chart`}
                  valueLabel={data.columns.find((c) => c.key === data.chart.y)?.label ?? ''}
                  value2Label={
                    data.chart.y2
                      ? data.columns.find((c) => c.key === data.chart.y2)?.label
                      : undefined
                  }
                  data={data.rows.map((r) => ({
                    label: String(r[data.chart.x]),
                    value: Number(r[data.chart.y ?? '']),
                    value2: data.chart.y2 ? Number(r[data.chart.y2]) : undefined,
                  }))}
                />
              </Suspense>
            )}
          </Card>
          <Table
            caption={`${data.label}, ${data.from} to ${data.to}`}
            columns={[...columns]}
            rows={[...data.rows, { ...data.totals, __total: 1 }]}
            rowKey={(r) => (r.__total ? 'total' : String(r[data.columns[0].key]))}
            emptyMessage="Nothing in this range."
          />
        </>
      ) : null}
    </div>
  );
}
