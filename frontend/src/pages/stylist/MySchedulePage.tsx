import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useState } from 'react';
import { errorDetail } from '../../api/client';
import { getSchedule, requestDaysOff, withdrawDaysOff, type ClashVisit } from '../../api/stylist';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  Input,
  LoadingState,
  Table,
  useToast,
  type Column,
} from '../../components/ui';
import type { DayOff } from '../../api/stylist';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatDay } from '../../lib/format';
import { StylistError } from './common';

const dayNames: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function clashes(error: unknown): ClashVisit[] {
  if (!axios.isAxiosError(error)) return [];
  const data = error.response?.data as { visits?: ClashVisit[] } | undefined;
  return data?.visits ?? [];
}

export default function MySchedulePage() {
  useDocumentTitle('My Schedule');
  const toast = useToast();
  const queryClient = useQueryClient();
  const schedule = useQuery({ queryKey: ['stylist', 'schedule'], queryFn: getSchedule });
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [visits, setVisits] = useState<ClashVisit[]>([]);

  const ask = useMutation({
    mutationFn: () => requestDaysOff({ start_date: start, end_date: end || start, reason }),
    onSuccess: () => {
      setStart('');
      setEnd('');
      setReason('');
      setMessage('');
      setVisits([]);
      void queryClient.invalidateQueries({ queryKey: ['stylist', 'schedule'] });
      toast.show({ title: 'Request sent to the admin', tone: 'success' });
    },
    onError: (error) => {
      const found = clashes(error);
      setVisits(found);
      setMessage(
        found.length > 0
          ? 'You have visits on those days. Ask the front desk to reschedule them first, then send your request again.'
          : (errorDetail(error) ?? 'We could not send the request.'),
      );
    },
  });
  const withdraw = useMutation({
    mutationFn: withdrawDaysOff,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['stylist', 'schedule'] }),
    onError: (error) =>
      toast.show({
        title: 'Could not withdraw',
        description: errorDetail(error) ?? 'Please try again.',
        tone: 'danger',
      }),
  });

  const columns: Column<DayOff>[] = [
    {
      key: 'dates',
      header: 'Days',
      render: (r) =>
        r.start_date === r.end_date
          ? formatDay(r.start_date)
          : `${formatDay(r.start_date)} to ${formatDay(r.end_date)}`,
    },
    { key: 'reason', header: 'Reason', render: (r) => r.reason },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className="flex flex-col gap-xs">
          <Badge
            tone={
              r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'neutral'
            }
          >
            {r.status_label}
          </Badge>
          {r.decision_note && <span className="text-xs text-text-muted">{r.decision_note}</span>}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      render: (r) =>
        r.status === 'pending' ? (
          <Button
            size="sm"
            variant="ghost"
            loading={withdraw.isPending && withdraw.variables === r.id}
            onClick={() => withdraw.mutate(r.id)}
          >
            Withdraw
          </Button>
        ) : null,
    },
  ];

  return (
    <section className="flex flex-col gap-lg">
      <PageHeader
        title="My Schedule"
        description="Your working hours, and days-off requests. The admin approves days off."
      />
      {schedule.isPending ? (
        <LoadingState label="Loading your schedule…" />
      ) : schedule.isError ? (
        <StylistError error={schedule.error} onRetry={() => void schedule.refetch()} />
      ) : (
        <>
          <Card className="flex flex-col gap-sm">
            <h2 className="text-lg font-semibold text-text">Working hours</h2>
            <ul className="grid gap-xs text-sm sm:grid-cols-2">
              {schedule.data.hours.map((h) => (
                <li key={h.day} className="flex justify-between gap-md">
                  <span className="text-text">{dayNames[h.day]}</span>
                  <span className="text-text-muted">
                    {h.hours ? `${h.hours[0]} – ${h.hours[1]}` : 'Day off'}
                    {h.own ? '' : ' (salon hours)'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-md">
            <h2 className="text-lg font-semibold text-text">Ask for days off</h2>
            <form
              className="grid gap-md sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                ask.mutate();
              }}
            >
              <Input
                label="From"
                type="date"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              <Input
                label="To (leave empty for one day)"
                type="date"
                min={start || undefined}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Reason"
                  required
                  minLength={3}
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" loading={ask.isPending}>
                  Send request
                </Button>
              </div>
            </form>
            {message && (
              <div
                role="alert"
                className="rounded-input bg-warning-soft p-md text-sm text-warning-text"
              >
                <p>{message}</p>
                {visits.length > 0 && (
                  <ul className="mt-sm list-disc pl-lg">
                    {visits.map((v) => (
                      <li key={v.id}>
                        {formatDateTime(v.start)} · {v.customer_first_name} · {v.service_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-sm">
            <h2 className="text-lg font-semibold text-text">Your requests</h2>
            {schedule.data.days_off.length === 0 ? (
              <p className="text-sm text-text-muted">You have not asked for any days off.</p>
            ) : (
              <Table
                caption="Days-off requests"
                columns={columns}
                rows={schedule.data.days_off}
                rowKey={(r) => r.id}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
