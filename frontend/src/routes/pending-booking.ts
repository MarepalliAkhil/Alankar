/**
 * A booking the customer started before signing in (the booking sheet they were sent to). Customers
 * always land on their dashboard after signing in; the dashboard then offers "Continue your
 * booking" with this address, so nothing is lost. Only the booking sheet's own address is ever
 * kept, so it can never become an open redirect. Kept in sessionStorage (per tab, per sign-in).
 */
const KEY = 'alankar.pending-booking';
export const BOOKING_SHEET = '/customer/book';

export function isBookingPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith(BOOKING_SHEET)) return false;
  const rest = path.slice(BOOKING_SHEET.length);
  return rest === '' || rest.startsWith('?');
}

export function rememberBooking(path: string): void {
  if (!isBookingPath(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // storage blocked: the customer can still open Book from the menu
  }
}

export function pendingBooking(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return isBookingPath(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingBooking(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
