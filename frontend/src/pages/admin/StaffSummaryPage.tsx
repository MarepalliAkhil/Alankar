import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState, type FormEvent } from 'react';
import { errorDetail } from '../../api/client';
import {
  getReviewHistory,
  getReviews,
  getStaffSummary,
  saveReview,
  type Bucket,
  type Indicator,
  type ReviewPerson,
  type ReviewStatus,
  type SummaryQuery,
} from '../../api/staffSummary';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  SkeletonChart,
  SkeletonRows,
  Select,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
  type BadgeTone,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDay, formatINRExact } from '../../lib/format';

const BarChartView = lazy(() => import('../../components/charts/BarChartView'));
const LineChartView = lazy(() => import('../../components/charts/LineChartView'));

type Tab = 'team' | 'stylists' | 'receptionists' | 'reviews';
type Mode = 'month' | 'range';

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const LEVEL: Record<Indicator['level'], { label: string; tone: BadgeTone }> = {
  good: { label: 'Good', tone: 'success' },
  watch: { label: 'Watch', tone: 'warning' },
  concern: { label: 'Concern', tone: 'danger' },
  no_data: { label: 'Not enough data', tone: 'neutral' },
};

const label = (b: { bucket: string }) => formatDay(b.bucket);

function Kpi({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <Card className="flex flex-col gap-xs">
      <h3 className="text-sm font-semibold text-text-muted">{title}</h3>
      <p className="text-xl font-semibold text-text">{value}</p>
      {note && <p className="text-xs text-text-muted">{note}</p>}
    </Card>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-sm">
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <Suspense fallback={<SkeletonChart label="Loading the chart…" />}>{children}</Suspense>
    </Card>
  );
}

/** The same set of graphs for the team and for one person's series. */
function SeriesCharts({ series, who }: { series: Bucket[]; who: string }) {
  const rated = series.some((b) => b.avg_rating !== null);
  return (
    <div className="grid gap-md lg:grid-cols-2">
      <Chart title={`Appointments done and no-shows: ${who}`}>
        <BarChartView
          title={`Appointments done and no-shows for ${who}`}
          valueLabel="Appointments done"
          value2Label="No-shows"
          data={series.map((b) => ({
            label: label(b),
            value: b.appointments,
            value2: b.no_shows,
          }))}
        />
      </Chart>
      <Chart title={`Revenue before GST: ${who}`}>
        <BarChartView
          title={`Revenue for ${who}`}
          valueLabel="Revenue (₹)"
          data={series.map((b) => ({ label: label(b), value: Number(b.revenue) }))}
        />
      </Chart>
      <Chart title={`Average rating over time: ${who}`}>
        {rated ? (
          <LineChartView
            title={`Average rating over time for ${who}`}
            valueLabel="Average rating"
            domain={[1, 5]}
            data={series.map((b) => ({
              label: label(b),
              value: b.avg_rating === null ? null : Number(b.avg_rating),
            }))}
          />
        ) : (
          <p className="text-sm text-text-muted">No ratings in this period.</p>
        )}
      </Chart>
    </div>
  );
}

export default function StaffSummaryPage() {
  useDocumentTitle('Staff Summary');
  const [tab, setTab] = useState<Tab>('team');
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [start, setStart] = useState(`${today().slice(0, 7)}-01`);
  const [end, setEnd] = useState(today());
  const [pick, setPick] = useState('');
  const query: SummaryQuery = mode === 'month' ? { month } : { start, end };
  const summary = useQuery({
    queryKey: ['a-summary', query],
    queryFn: () => getStaffSummary(query),
  });
  const reviewMonth = mode === 'month' ? month : end.slice(0, 7);
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Staff Summary"
        description="Graphs and numbers from real appointments, invoices, ratings and work hours. Revenue is before GST and matches the Reports page."
      />
      <div className="flex flex-wrap items-end gap-md">
        <div className="w-48">
          <Select
            label="Period"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            options={[
              { value: 'month', label: 'A month' },
              { value: 'range', label: 'A date range' },
            ]}
          />
        </div>
        {mode === 'month' ? (
          <div className="w-48">
            <Input
              label="Month"
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="w-48">
              <Input
                label="From"
                type="date"
                value={start}
                onChange={(e) => e.target.value && setStart(e.target.value)}
              />
            </div>
            <div className="w-48">
              <Input
                label="To"
                type="date"
                value={end}
                onChange={(e) => e.target.value && setEnd(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
      <Tabs
        label="Staff summary sections"
        idPrefix="summary"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'team', label: 'Team' },
          { id: 'stylists', label: 'Stylists' },
          { id: 'receptionists', label: 'Receptionists' },
          { id: 'reviews', label: 'Performance Review' },
        ]}
      />
      <TabPanel idPrefix="summary" id={tab} className="flex flex-col gap-lg">
        {tab === 'reviews' ? (
          <Reviews month={reviewMonth} />
        ) : summary.isPending ? (
          <LoadingState label="Working out the numbers…" />
        ) : summary.isError ? (
          <ErrorState
            description={errorDetail(summary.error) ?? "We couldn't load the staff summary."}
            onRetry={() => void summary.refetch()}
          />
        ) : (
          <>
            <p className="text-sm text-text-muted">
              {summary.data.range.start} to {summary.data.range.end}, grouped by{' '}
              {summary.data.range.bucket}.
            </p>
            {tab === 'team' && (
              <>
                <div className="card-grid">
                  <Kpi
                    title="Appointments done"
                    value={String(summary.data.team.kpis.appointments)}
                  />
                  <Kpi title="Revenue" value={formatINRExact(summary.data.team.kpis.revenue)} />
                  <Kpi
                    title="Average rating"
                    value={summary.data.team.kpis.avg_rating ?? '—'}
                    note={`${summary.data.team.kpis.rating_count} counted ratings`}
                  />
                  <Kpi title="No-shows" value={String(summary.data.team.kpis.no_shows)} />
                  <Kpi title="Receptionist hours" value={`${summary.data.team.kpis.hours} hours`} />
                  <Kpi
                    title="Staff cost"
                    value={formatINRExact(summary.data.team.kpis.payroll_cost)}
                    note={`Stylists ${formatINRExact(summary.data.team.kpis.stylist_earnings)} · receptionists ${formatINRExact(summary.data.team.kpis.receptionist_pay)}`}
                  />
                </div>
                <SeriesCharts series={summary.data.team.series} who="the team" />
                <Chart title="Receptionist hours: the team">
                  <BarChartView
                    title="Receptionist hours for the team"
                    valueLabel="Hours"
                    data={summary.data.team.series.map((b) => ({
                      label: label(b),
                      value: Number(b.hours),
                    }))}
                  />
                </Chart>
              </>
            )}
            {tab === 'stylists' &&
              (summary.data.stylists.length === 0 ? (
                <EmptyState
                  title="No stylists"
                  description="Stylists with a linked account appear here."
                />
              ) : (
                (() => {
                  const s =
                    summary.data.stylists.find((x) => x.id === pick) ?? summary.data.stylists[0];
                  const k = s.kpis;
                  return (
                    <>
                      <div className="w-64">
                        <Select
                          label="Stylist"
                          value={s.id}
                          onChange={(e) => setPick(e.target.value)}
                          options={summary.data.stylists.map((x) => ({
                            value: x.id,
                            label: x.name,
                          }))}
                        />
                      </div>
                      <div className="card-grid">
                        <Kpi title="Appointments done" value={String(k.appointments)} />
                        <Kpi title="Revenue" value={formatINRExact(k.revenue)} />
                        <Kpi
                          title="Average rating"
                          value={k.avg_rating ?? '—'}
                          note={`${k.rating_count} counted ratings`}
                        />
                        <Kpi title="No-shows" value={String(k.no_shows)} />
                        <Kpi
                          title="Earnings"
                          value={formatINRExact(k.earnings)}
                          note={`Including tips ${formatINRExact(k.tips)}`}
                        />
                        <Kpi
                          title="Rebooking"
                          value={k.rebooking.enough ? `${k.rebooking.rate}%` : k.rebooking.label}
                          note={`${k.rebooking.customers} customers`}
                        />
                      </div>
                      <SeriesCharts series={s.series} who={s.name} />
                    </>
                  );
                })()
              ))}
            {tab === 'receptionists' &&
              (summary.data.receptionists.length === 0 ? (
                <EmptyState
                  title="No receptionists"
                  description="Receptionists appear here once they have signed in."
                />
              ) : (
                (() => {
                  const d =
                    summary.data.receptionists.find((x) => x.id === pick) ??
                    summary.data.receptionists[0];
                  return (
                    <>
                      <div className="w-64">
                        <Select
                          label="Receptionist"
                          value={d.id}
                          onChange={(e) => setPick(e.target.value)}
                          options={summary.data.receptionists.map((x) => ({
                            value: x.id,
                            label: x.name,
                          }))}
                        />
                      </div>
                      <div className="card-grid">
                        <Kpi
                          title="Hours"
                          value={`${d.kpis.hours} hours`}
                          note={`${d.kpis.sessions} sessions`}
                        />
                        <Kpi
                          title="Pay"
                          value={d.kpis.pay ? formatINRExact(d.kpis.pay) : 'No rate set'}
                        />
                        <Kpi
                          title="On time"
                          value={
                            d.kpis.has_shifts ? `${d.kpis.on_time_rate ?? '—'}%` : 'No shift set'
                          }
                        />
                        <Kpi title="Sessions to check" value={String(d.kpis.flagged_sessions)} />
                      </div>
                      <Chart title={`Hours worked: ${d.name}`}>
                        <BarChartView
                          title={`Hours worked by ${d.name}`}
                          valueLabel="Hours"
                          data={d.series.map((b) => ({ label: label(b), value: Number(b.hours) }))}
                        />
                      </Chart>
                    </>
                  );
                })()
              ))}
          </>
        )}
      </TabPanel>
    </div>
  );
}

// --- Performance Review (admin only, never shown to the staff member)

function IndicatorLine({ name, ind, text }: { name: string; ind?: Indicator; text: string }) {
  if (!ind) return null;
  const l = LEVEL[ind.level];
  return (
    <li className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-xs text-sm">
        <span className="font-medium text-text">{name}:</span>
        <span className="text-text">{text}</span>
        <Badge tone={l.tone}>{l.label}</Badge>
      </div>
      <p className="text-xs text-text-muted">Rule: {ind.rule}</p>
    </li>
  );
}

function Reviews({ month }: { month: string }) {
  const [open, setOpen] = useState('');
  const data = useQuery({ queryKey: ['a-reviews', month], queryFn: () => getReviews(month) });
  if (data.isPending) return <SkeletonRows count={4} label="Loading performance reviews…" />;
  if (data.isError)
    return (
      <ErrorState
        description="We couldn't load performance reviews."
        onRetry={() => void data.refetch()}
      />
    );
  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-muted">
        Indicators come from real data with the plain rules shown under each one. There is no
        overall score. Reviews are visible to the admin only. Recommending that a job ends does not
        deactivate anyone; that stays a separate action on the Staff page.
      </p>
      {data.data.people.length === 0 ? (
        <EmptyState title="No staff" description="Stylists and receptionists appear here." />
      ) : (
        <ul className="flex flex-col gap-md" aria-label="Performance reviews">
          {data.data.people.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-sm">
                <div className="flex flex-wrap items-center gap-xs">
                  <h3 className="text-lg font-semibold text-text">{p.name}</h3>
                  <Badge>{p.role === 'stylist' ? 'Stylist' : 'Receptionist'}</Badge>
                  {p.review ? (
                    <Badge tone={p.review.status === 'continue' ? 'success' : 'warning'}>
                      {p.review.status_label}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">No review yet</Badge>
                  )}
                </div>
                <Indicators p={p} />
                <div>
                  <Button
                    size="sm"
                    variant={open === p.id ? 'secondary' : 'primary'}
                    aria-expanded={open === p.id}
                    onClick={() => setOpen(open === p.id ? '' : p.id)}
                  >
                    {open === p.id ? 'Close review' : `Review ${p.name}`}
                  </Button>
                </div>
                {open === p.id && (
                  <ReviewForm
                    person={p}
                    month={month}
                    statuses={data.data.statuses}
                    onSaved={() => setOpen('')}
                  />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Indicators({ p }: { p: ReviewPerson }) {
  const i = p.indicators;
  if (i.unlinked) {
    return <p className="text-sm text-text-muted">This stylist has no linked account yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-xs">
      {i.kind === 'stylist' ? (
        <>
          <IndicatorLine
            name="Ratings"
            ind={i.rating}
            text={
              i.rating?.average
                ? `${i.rating.average} from ${i.rating.count} ratings`
                : 'No ratings'
            }
          />
          <IndicatorLine
            name="Punctuality"
            ind={i.punctuality}
            text={
              i.punctuality?.rate
                ? `${i.punctuality.rate}% (${i.punctuality.on_time} of ${i.punctuality.days} days on time)`
                : 'No started visits'
            }
          />
          <IndicatorLine
            name="Rebooking"
            ind={i.rebooking}
            text={
              i.rebooking?.enough
                ? `${i.rebooking.rate}% (${i.rebooking.rebooked} of ${i.rebooking.customers} customers)`
                : (i.rebooking?.label ?? '')
            }
          />
          <li className="text-sm text-text">
            Completed tasks: {i.completed_tasks} · No-shows: {i.no_shows}
          </li>
        </>
      ) : (
        <>
          <IndicatorLine
            name="Punctuality"
            ind={i.punctuality}
            text={
              i.punctuality?.has_shifts
                ? i.punctuality.rate
                  ? `${i.punctuality.rate}% on time`
                  : 'No shift days yet'
                : 'No shift set'
            }
          />
          <li className="text-sm text-text">
            Hours: {i.hours} · Invoices processed: {i.completed_tasks} · Sessions to check:{' '}
            {i.flagged_sessions}
          </li>
        </>
      )}
    </ul>
  );
}

function ReviewForm({
  person,
  month,
  statuses,
  onSaved,
}: {
  person: ReviewPerson;
  month: string;
  statuses: { value: ReviewStatus; label: string }[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<ReviewStatus>(person.review?.status ?? 'continue');
  const [notes, setNotes] = useState(person.review?.notes ?? '');
  const [problem, setProblem] = useState('');
  const history = useQuery({
    queryKey: ['a-review-history', person.id],
    queryFn: () => getReviewHistory(person.id),
  });
  const save = useMutation({
    mutationFn: () => saveReview(person.id, { month, status, notes: notes.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['a-reviews', month] });
      void queryClient.invalidateQueries({ queryKey: ['a-review-history', person.id] });
      toast.show({ tone: 'success', title: 'Review saved. It is in the audit log.' });
      onSaved();
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not save the review.'),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (status !== 'continue' && notes.trim().length < 3)
      return setProblem('Write your notes for this decision (at least 3 characters).');
    setProblem('');
    save.mutate();
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-sm border-t border-border pt-sm"
    >
      <Select
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as ReviewStatus)}
        options={statuses}
      />
      <Textarea
        label="Admin notes (private)"
        value={notes}
        maxLength={2000}
        onChange={(e) => setNotes(e.target.value)}
      />
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {problem}
        </p>
      )}
      <div>
        <Button loading={save.isPending} type="submit" disabled={save.isPending}>
          Save review
        </Button>
      </div>
      {history.data && history.data.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-text">Past reviews</h4>
          <ul className="text-sm text-text-muted">
            {history.data.map((h) => (
              <li key={h.id}>
                {h.month}: {h.status_label}
                {h.decided_by ? ` (by ${h.decided_by})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
