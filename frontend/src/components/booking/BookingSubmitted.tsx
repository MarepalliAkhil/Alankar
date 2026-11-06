import { CheckCircle2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PageHeader } from '../layout/PageContainer';
import { MeeraMoment } from '../tour';
import { ButtonLink, Card } from '../ui';

/**
 * Shown right after a booking request is sent. It is a request, not a booking: the front desk and
 * the stylist both have to say yes. Meera is waiting here; she celebrates only on My bookings,
 * once the booking is really confirmed.
 */
export function BookingSubmitted() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo?.({ top: 0 });
  }, []);
  return (
    <div data-booking-submitted className="flex flex-col gap-lg py-lg">
      <PageHeader eyebrow="Booking request" title="Request sent" />
      <Card className="flex flex-col gap-md">
        <MeeraMoment pose="waiting" className="items-start">
          <h2
            ref={heading}
            tabIndex={-1}
            className="flex items-center gap-2 text-xl font-semibold text-text focus-visible:outline-none"
          >
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-success" />
            Your request went to the front desk and your stylist
          </h2>
          <p className="mt-sm text-text-muted">
            Your booking is confirmed only when both of them accept. Until then it is waiting, and
            nothing is charged. We will tell you here, by email and by text as soon as they answer.
          </p>
        </MeeraMoment>
        <div className="flex flex-wrap gap-sm">
          <ButtonLink to="/customer/appointments">Go to My appointments</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
