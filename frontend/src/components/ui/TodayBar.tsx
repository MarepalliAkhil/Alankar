import { CalendarCheck, CheckCircle2, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatTime } from '../../lib/format';
import { Card } from './Card';

export interface TodayVisit {
  start: string | null;
  status: string;
  customer_first_name: string;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * "Today" summary above a visit list, computed in the browser from the visits the page already
 * loaded (no extra request): how many visits today, the next one and its time, how many are done.
 */
export function TodayBar({ visits, now = new Date() }: { visits: TodayVisit[]; now?: Date }) {
  const today = visits.filter((visit) => visit.start && sameDay(new Date(visit.start), now));
  const done = today.filter((visit) => visit.status === 'completed').length;
  const next = today
    .filter((visit) => visit.status !== 'completed' && new Date(visit.start as string) >= now)
    .sort(
      (a, b) => new Date(a.start as string).getTime() - new Date(b.start as string).getTime(),
    )[0];
  return (
    <Card variant="dense" aria-label="Today at a glance" className="grid gap-md sm:grid-cols-3">
      <Stat icon={<CalendarCheck />} label="Visits today" value={String(today.length)} />
      <Stat
        icon={<Clock />}
        label="Next visit"
        value={next ? formatTime(next.start as string) : 'None'}
        note={next?.customer_first_name}
      />
      <Stat
        icon={<CheckCircle2 />}
        label="Completed"
        value={today.length ? `${done} of ${today.length}` : '0'}
      />
    </Card>
  );
}

export function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-md">
      <span aria-hidden="true" className="text-primary-hover [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-text-muted">{label}</p>
        <p className="text-xl font-semibold text-text">
          {value}
          {note && <span className="ml-2 text-sm font-normal text-text-muted">{note}</span>}
        </p>
      </div>
    </div>
  );
}
