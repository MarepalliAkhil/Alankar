import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { DivisionId } from '../../config/divisions';
import { backgroundFor, isBookingPath, useBookingDivision } from '../../design/page-background';
import { useRouteTheme } from '../../design/display';
import { divisionOfPath, rememberDivision } from '../../design/last-division';
import { divisionTheme } from '../../design/themes';
import { useSession } from '../../session/session-context';
import { PageBackdrop } from './PageBackdrop';

/** While booking, the theme tint follows the division being booked. */
function BookingTint({ division }: { division: DivisionId }) {
  useRouteTheme(divisionTheme[division]);
  return null;
}

/**
 * The one shared page background, rendered by every layout. Fixed behind all content, under a
 * readability veil; see design/page-background.ts for which picture a route gets. Staff pages are
 * data-heavy, so their picture gets a light blur. The home page paints its own background, and a
 * division page shows only its own hero picture.
 */
export function PageBackground() {
  const { pathname } = useLocation();
  const { user } = useSession();
  const booking = useBookingDivision();
  const viewing = divisionOfPath(pathname);
  useEffect(() => {
    if (viewing) rememberDivision(viewing);
  }, [viewing]);
  // A division page (/salon, /spa, /beauty-parlor) has ONE picture: its hero. No second, blurred
  // copy of a photo behind it; the page takes the division's tint instead (see DivisionPage).
  if (viewing) return null;
  const choice = backgroundFor(pathname, booking);
  if (!choice) return null;
  const strong = !!user && user.role !== 'customer';
  return (
    <>
      {isBookingPath(pathname) && choice.division && <BookingTint division={choice.division} />}
      <PageBackdrop slot={choice.slot} strong={strong} />
    </>
  );
}
