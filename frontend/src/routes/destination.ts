import type { SessionUser } from '../api/auth';
import { canAccess } from '../policy/policy';

/** Where to go after sign-in: a safe in-app `next` the role may open, else the role home. */
export function destinationAfterLogin(
  user: SessionUser,
  next: string | null,
  book: boolean,
): string {
  if (book && user.role === 'customer') return '/customer/book';
  if (next && next.startsWith('/') && !next.startsWith('//') && canAccess(user.role, next)) {
    return next;
  }
  return user.home;
}
