import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useState } from 'react';
import { getMyHours, type WorkSessionRow } from '../../api/work';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Table,
  type Column,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';
import MyPayslips from '../../components/MyPayslips';

function thisMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date())
    .slice(0, 7);
}

const columns: Column<WorkSessionRow>[] = [
  { key: 'start', header: 'Signed in', render: (s) => formatDateTime(s.started_at) },
  {
    key: 'end',
    header: 'Signed out',
    render: (s) =>
      s.ended_at ? formatDateTime(s.ended_at) : <Badge tone="success">On the clock</Badge>,
  },
  { key: 'hours', header: 'Hours', render: (s) => s.hours },
  {
    key: 'how',
    header: 'How it ended',
    render: (s) => (
      <span className="flex flex-col gap-xs">
        <span>{s.end_reason_label || (s.open ? 'Still working' : '')}</span>
        {s.corrected && (
          <span className="text-xs text-text-muted">
            <Badge tone="info">Corrected by admin</Badge> {s.correction_reason}
          </span>
        )}
      </span>
    ),
  },
];

/** My Hours & Pay: hours from sign-in to sign-out, times the hourly rate the admin set. */
export default function MyHoursPage() {
  useDocumentTitle('My Hours & Pay');
  const [month, setMonth] = useState(thisMonth());
  const hours = useQuery({
    queryKey: ['my-hours', month],
    queryFn: () => getMyHours(month),
    refetchInterval: 60000,
  });

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="My Hours & Pay"
        description="Your hours are counted from sign-in to sign-out. You are signed out automatically after 15 minutes without activity."
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
      {hours.isPending ? (
        <LoadingState label="Loading your hours…" />
      ) : hours.isError ? (
        <ErrorState
          description="We couldn't load your hours."
          onRetry={() => void hours.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">Today</h2>
              <p className="text-xl font-semibold text-text">{hours.data.today_hours} h</p>
            </Card>
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">This month</h2>
              <p className="text-xl font-semibold text-text">{hours.data.total_hours} h</p>
            </Card>
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">Hourly rate</h2>
              <p className="text-xl font-semibold text-text">
                {hours.data.hourly_rate ? formatINRExact(hours.data.hourly_rate) : 'Not set yet'}
              </p>
            </Card>
            <Card className="flex flex-col gap-xs">
              <h2 className="text-sm font-semibold text-text-muted">Estimated pay</h2>
              <p className="text-xl font-semibold text-text">
                {hours.data.estimated_pay ? formatINRExact(hours.data.estimated_pay) : '—'}
              </p>
            </Card>
          </div>
          <p className="text-sm text-text-muted">
            {hours.data.hourly_rate
              ? 'Estimated pay is hours × your hourly rate. The final amount is set when payroll is approved.'
              : 'Your hourly rate has not been set yet. Ask the admin; your hours are still being counted.'}
          </p>
          {hours.data.sessions.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-6 w-6" />}
              title="No hours this month"
              description="Hours appear here once you have signed in during the month."
            />
          ) : (
            <Table
              caption="Work sessions"
              columns={columns}
              rows={hours.data.sessions}
              rowKey={(s) => s.id}
            />
          )}
        </>
      )}
      <MyPayslips />
    </section>
  );
}
