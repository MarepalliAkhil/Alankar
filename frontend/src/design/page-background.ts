/**
 * Amendment 2: which full-window photo sits behind each page (docs/IMAGE_SLOTS.md has the table).
 *
 *   /                                -> none (the home page paints its own four-picture background)
 *   /salon /spa /beauty-parlor       -> that division's background
 *   /customer/book                   -> the division being booked (Salon, Spa, Parlor), and the
 *                                       Alankar photo while "All" is chosen
 *   everything else (dashboards, bookings list, Zen Chat, wallet, packages, gift cards, shop,
 *   orders, invoices, profile, receptionist, stylist and admin pages, login, register,
 *   For Zenotians)                   -> the Alankar reception photo
 */
import { useSyncExternalStore } from 'react';
import type { DivisionId } from '../config/divisions';
import type { ArtId } from './art';
import { divisionOfPath } from './last-division';

export type BackgroundChoice = { slot: ArtId; division: DivisionId | null } | null;

export const DIVISION_BACKGROUND: Record<DivisionId, ArtId> = {
  salon: 'salonBackground',
  spa: 'spaBackground',
  'beauty-parlor': 'parlorBackground',
};
export const BRAND_BACKGROUND: ArtId = 'shopBackground';

export const BOOKING_PATH = '/customer/book';
export const isBookingPath = (pathname: string) => pathname.replace(/\/$/, '') === BOOKING_PATH;

export function backgroundFor(
  pathname: string,
  bookingDivision: DivisionId | null,
): BackgroundChoice {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  if (path === '/') return null;
  const viewing = divisionOfPath(path);
  const division = viewing ?? (isBookingPath(path) ? bookingDivision : null);
  return division
    ? { slot: DIVISION_BACKGROUND[division], division }
    : { slot: BRAND_BACKGROUND, division: null };
}

// ---- the division the customer is booking right now (set by the booking pages) ----------------
let current: DivisionId | null = null;
const listeners = new Set<() => void>();

/** Called by the booking page when the division chip or the chosen service's division changes. */
export function setBookingDivision(id: DivisionId | null): void {
  if (current === id) return;
  current = id;
  listeners.forEach((listener) => listener());
}
export function useBookingDivision(): DivisionId | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
