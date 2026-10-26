import type { SessionUser } from '../api/auth';

/** Where a "Book" button leads: the booking sheet for customers, sign-in for guests. */
export function bookingTarget(user: SessionUser | null, serviceSlug?: string): string | null {
  const sheet = `/customer/book${serviceSlug ? `?service=${encodeURIComponent(serviceSlug)}` : ''}`;
  if (!user) return `/login?role=customer&next=${encodeURIComponent(sheet)}`;
  if (user.role === 'customer') return sheet;
  return null; // staff do not book from the public site
}
