import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getCalendar } from '../../api/stylist';
import { formatDay, formatTime } from '../../lib/format';
import { StylistError } from '../../pages/stylist/common';
import { Badge, Button, Card, LoadingState } from '../ui';

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

/**
 * The logged-in stylist's own calendar for one week: working hours, days off, their visits and
 * the requests still waiting for an answer (those hold the slot). Nothing about other stylists.
 */
export function MyCalendar() {
  const [from, setFrom] = useState(() => isoDay(new Date()));
  const to = addDays(from, 6);
  const calendar = useQuery({
    queryKey: ['stylist', 'calendar', from],
    queryFn: () => getCalendar(from, to),
  });

  return (
    <Card as="section" aria-labelledby="my-calendar" className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h2 id="my-calendar" className="text-lg font-semibold text-text">
          My calendar
        </h2>
        <div className="flex items-center gap-xs">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<ChevronLeft className="h-4 w-4" />}
            onClick={() => setFrom(addDays(from, -7))}
          >
            Earlier
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFrom(isoDay(new Date()))}>
            Today
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setFrom(addDays(from, 7))}>
            Later <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-text-muted">
        {formatDay(from)} to {formatDay(to)}
      </p>
      {calendar.isPending ? (
        <LoadingState label="Loading your calendar…" />
      ) : calendar.isError ? (
        <StylistError error={calendar.error} onRetry={() => void calendar.refetch()} />
      ) : (
        <ol className="flex flex-col gap-sm">
          {calendar.data.map((day) => (
            <li key={day.date} className="rounded-nested bg-surface-muted p-md">
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <h3 className="text-sm font-semibold text-text">{formatDay(day.date)}</h3>
                <span className="text-xs text-text-muted">
                  {day.day_off
                    ? 'Day off'
                    : day.hours
                      ? `${day.hours[0]} – ${day.hours[1]}`
                      : 'Not working'}
                </span>
              </div>
              {day.visits.length === 0 && day.waiting_requests.length === 0 ? (
                <p className="mt-xs text-sm text-text-muted">Nothing booked.</p>
              ) : (
                <ul className="mt-xs flex flex-col gap-xs">
                  {day.visits.map((visit) => (
                    <li key={visit.id} className="flex flex-wrap items-center gap-sm text-sm">
                      <span className="font-medium text-text">
                        {visit.start ? formatTime(visit.start) : ''}
                      </span>
                      <Link
                        to={`/my-appointments/${visit.id}`}
                        className="rounded text-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        {visit.customer_first_name} · {visit.service_name}
                      </Link>
                      <Badge tone="primary">{visit.status_label}</Badge>
                    </li>
                  ))}
                  {day.waiting_requests.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-sm text-sm">
                      <span className="font-medium text-text">{formatTime(request.start)}</span>
                      <Link
                        to="/requests"
                        className="rounded text-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        {request.customer_first_name} · {request.service_name}
                      </Link>
                      <Badge tone="warning">Waiting for answers</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
