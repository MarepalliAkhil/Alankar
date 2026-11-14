import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clearPendingBooking, pendingBooking } from '../../routes/pending-booking';
import { listMyAppointments, type CustomerAppointment } from '../../api/booking';
import { RatingPrompt } from '../../components/booking/RatingPrompt';
import { ForYou } from '../../components/recommendations/ForYou';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  AlankarIcon,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  LoadingState,
  StatusBadge,
  type AlankarIconName,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';

const SHORTCUTS: { to: string; label: string; text: string; icon: AlankarIconName }[] = [
  {
    to: '/customer/book',
    label: 'Book a visit',
    text: 'Pick a service and a time',
    icon: 'search',
  },
  {
    to: '/customer/appointments',
    label: 'My appointments',
    text: 'Requests, visits and payments',
    icon: 'calendar',
  },
  {
    to: '/customer/wallet',
    label: 'My wallet',
    text: 'Packages, membership, gift cards',
    icon: 'rupee',
  },
  { to: '/customer/shop', label: 'Shop', text: 'Products delivered to your door', icon: 'brush' },
];

const UPCOMING = new Set(['scheduled', 'checked_in', 'in_progress']);

function Row({ appt, children }: { appt: CustomerAppointment; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-sm border-t border-border py-md first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-sm font-semibold text-text">
          {appt.service_name} <StatusBadge status={appt.status} plain />
        </p>
        <p className="tabular text-sm text-text-muted">
          {formatDateTime(appt.start ?? appt.preferred_start)}
          {appt.stylist_name ? ` with ${appt.stylist_name}` : ''}
        </p>
      </div>
      {children}
    </li>
  );
}

/**
 * The customer's home: what needs them first (pay, wait, rate), the next visit, then four ways in.
 * It replaces the old grid of eleven menu cards, which only repeated the sidebar.
 */
export function CustomerHome({ firstName }: { firstName: string }) {
  const list = useQuery({ queryKey: ['my-appointments'], queryFn: listMyAppointments });
  const all = list.data ?? [];
  const toPay = all.filter((a) => a.status === 'awaiting_payment');
  const waiting = all.filter((a) => a.status === 'requested');
  const next = all
    .filter((a) => UPCOMING.has(a.status) && a.start)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))[0];

  const [draft, setDraft] = useState(pendingBooking);
  const held = toPay[0];

  return (
    <div className="flex flex-col gap-lg pb-xl">
      {(draft || held) && (
        <Card
          padding="lg"
          as="section"
          aria-labelledby="continue-booking"
          className="flex flex-col gap-sm border-primary sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <h2 id="continue-booking" className="text-lg font-semibold">
              Continue your booking
            </h2>
            <p className="text-sm text-text-muted">
              {held
                ? `Your ${held.service_name} is held for you until the payment link runs out.`
                : 'You started a booking before signing in. Pick up where you left off.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <ButtonLink to={held ? `/customer/pay/${held.id}` : (draft ?? '/customer/book')}>
              {held ? 'Continue to payment' : 'Continue your booking'}
            </ButtonLink>
            {!held && (
              <Button
                variant="ghost"
                onClick={() => {
                  clearPendingBooking();
                  setDraft(null);
                }}
              >
                Not now
              </Button>
            )}
          </div>
        </Card>
      )}
      <PageHeader
        title={`Hello, ${firstName}`}
        description="Here is what needs you, then the quickest ways to get around."
        actions={<ButtonLink to="/customer/book">Book a visit</ButtonLink>}
      />
      <div id="rate-your-visit">
        <RatingPrompt />
      </div>

      {list.isPending ? (
        <LoadingState label="Loading your visits…" />
      ) : list.isError ? (
        <ErrorState
          description="We couldn't load your visits."
          onRetry={() => void list.refetch()}
        />
      ) : (
        <div className="grid gap-md lg:grid-cols-5">
          <Card padding="lg" as="section" aria-labelledby="needs-you" className="lg:col-span-3">
            <h2 id="needs-you" className="mb-md text-lg font-semibold">
              Needs you
            </h2>
            {toPay.length + waiting.length === 0 ? (
              <p className="text-text-muted">
                Nothing is waiting on you. When your stylist says yes to a booking, the payment link
                shows up here.
              </p>
            ) : (
              <ul>
                {toPay.map((appt) => (
                  <Row key={appt.id} appt={appt}>
                    <ButtonLink to={`/customer/pay/${appt.id}`} size="sm">
                      Pay now
                    </ButtonLink>
                  </Row>
                ))}
                {waiting.map((appt) => (
                  <Row key={appt.id} appt={appt}>
                    <span className="text-sm text-text-muted">
                      Waiting for your stylist and the front desk
                    </span>
                  </Row>
                ))}
              </ul>
            )}
          </Card>
          <Card padding="lg" as="section" aria-labelledby="next-visit" className="lg:col-span-2">
            <h2 id="next-visit" className="mb-md text-lg font-semibold">
              Next visit
            </h2>
            {next ? (
              <ul>
                <Row appt={next} />
              </ul>
            ) : (
              <p className="text-text-muted">
                No visit is booked yet.{' '}
                <Link to="/customer/book" className="font-medium text-primary-hover underline">
                  Book one
                </Link>
                .
              </p>
            )}
          </Card>
        </div>
      )}

      <ForYou />

      <section aria-labelledby="shortcuts">
        <h2 id="shortcuts" className="mb-sm text-lg font-semibold">
          Jump to
        </h2>
        <ul className="grid gap-sm sm:grid-cols-2 xl:grid-cols-4">
          {SHORTCUTS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="flex h-full items-center gap-md rounded-card border border-border bg-surface p-md transition-colors duration-base ease-brand hover:border-primary focus-visible:shadow-focus focus-visible:outline-none"
              >
                <AlankarIcon name={item.icon} className="h-7 w-7 shrink-0 text-primary-hover" />
                <span className="min-w-0">
                  <span className="block font-semibold text-text">{item.label}</span>
                  <span className="block text-sm text-text-muted">{item.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
