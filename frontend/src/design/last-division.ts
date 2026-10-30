import { divisions, type DivisionId } from '../config/divisions';

/** Where the browser remembers the division the visitor looked at last (default: spa). */
export const LAST_DIVISION_KEY = 'salon-last-division';
export const DEFAULT_DIVISION: DivisionId = 'spa';

export function readLastDivision(): DivisionId {
  try {
    const value = window.localStorage.getItem(LAST_DIVISION_KEY);
    if (divisions.some((division) => division.id === value)) return value as DivisionId;
  } catch {
    // storage blocked: fall through to the default
  }
  return DEFAULT_DIVISION;
}

export function rememberDivision(id: DivisionId): void {
  try {
    window.localStorage.setItem(LAST_DIVISION_KEY, id);
  } catch {
    // private mode: the choice lasts only for this page view
  }
}

/** The division a public path belongs to (/salon, /spa, /beauty-parlor), or null. */
export function divisionOfPath(pathname: string): DivisionId | null {
  const clean = pathname.replace(/\/$/, '');
  return divisions.find((division) => division.path === clean)?.id ?? null;
}
