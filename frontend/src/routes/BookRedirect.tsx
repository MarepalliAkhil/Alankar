import { Navigate, useSearchParams } from 'react-router-dom';
import { BOOK_NOW_PATH } from '../config/paths';
import { DelayedLoader } from '../components/ui/Loader';
import { usePageHead } from '../seo/head';
import { useSession } from '../session/session-context';
import { bookingTarget } from './booking';

/**
 * The short public address /book: customers go straight to the booking sheet (with ?service=
 * kept), guests to the customer sign-in that continues to booking, staff to their own home.
 */
export default function BookRedirect() {
  usePageHead('/book');
  const { status, user } = useSession();
  const [params] = useSearchParams();
  if (status === 'loading') return <DelayedLoader label="Opening booking…" />;
  const service = params.get('service') ?? undefined;
  const target = user
    ? (bookingTarget(user, service) ?? user.home)
    : service
      ? (bookingTarget(null, service) as string)
      : BOOK_NOW_PATH;
  return <Navigate to={target} replace />;
}
