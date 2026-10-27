import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Hourglass, Inbox, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { listDeskAppointments } from '../../api/desk';
import { Card, ErrorState, LoadingState } from '../ui';

/** "Today at the desk" on the receptionist and admin home: what needs attention now. */
export function DeskSummary() {
  const counts = useQuery({
    queryKey: ['desk-appointments', 'summary'],
    queryFn: () => listDeskAppointments('flags'),
    refetchInterval: 30_000,
  });
  if (counts.isPending) return <LoadingState label="Loading the desk…" lines={2} />;
  if (counts.isError) {
    return (
      <ErrorState
        description="We couldn't load the desk numbers."
        onRetry={() => void counts.refetch()}
      />
    );
  }
  const c = counts.data.counts;
  return (
    <section aria-labelledby="desk-today" className="flex flex-col gap-md">
      <h2 id="desk-today" className="text-xl font-bold text-text">
        Today at the desk
      </h2>
      <ul className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={<Inbox />} label="New requests" value={c.requested} to="/appointments" />
        <Tile
          icon={<Hourglass />}
          label="Awaiting payment"
          value={c.awaiting_payment}
          to="/appointments"
        />
        <Tile
          icon={<TriangleAlert />}
          label="Payment expired"
          value={c.payment_expired}
          to="/appointments"
        />
        <Tile
          icon={<CalendarClock />}
          label="Customer requests"
          value={c.flags}
          to="/appointments"
        />
      </ul>
    </section>
  );
}

function Tile({
  icon,
  label,
  value,
  to,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="block rounded-card focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Card className="flex items-center gap-md">
          <span aria-hidden="true" className="text-primary-hover [&>svg]:h-6 [&>svg]:w-6">
            {icon}
          </span>
          <div>
            <p className="text-2xl font-bold text-text">{value}</p>
            <p className="text-sm text-text-muted">{label}</p>
          </div>
        </Card>
      </Link>
    </li>
  );
}
