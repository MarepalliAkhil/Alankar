import type { SessionUser } from '../api/auth';
import { canAccess } from '../policy/policy';
import { BOOKING_SHEET, isBookingPath, rememberBooking } from './pending-booking';

/**
 * Where to go after sign-in.
 *
 * Customers ALWAYS go to their dashboard (`user.home`, /customer-dashboard): any `next`,
 * `returnTo` or booking intent is ignored as a destination. A booking they were in the middle of
 * is remembered instead, and the dashboard offers "Continue your booking".
 * Staff keep the old rule: a safe in-app `next` their role may open, else their own home.
 */
export function destinationAfterLogin(
  user: SessionUser,
  next: string | null,
  book: boolean,
): string {
  if (user.role === 'customer') {
    if (isBookingPath(next)) rememberBooking(next);
    else if (book) rememberBooking(BOOKING_SHEET);
    return user.home;
  }
  if (next && next.startsWith('/') && !next.startsWith('//') && canAccess(user.role, next)) {
    return next;
  }
  return user.home;
}
