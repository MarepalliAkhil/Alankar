import type { SVGProps } from 'react';

/**
 * The shop's own icon set (Task 15): one 24 x 24 grid, one 1.6 stroke, round caps and joins, no
 * fills, no emoji. They are drawn for what Alankar sells and does (hair, spa, beauty, and the six
 * steps of a visit), so pages do not depend on a stock icon set for their identity.
 * Colour comes from `currentColor`, size from the className.
 */
export const alankarIcons = {
  scissors: (
    <>
      <circle cx="6" cy="6.5" r="2.6" />
      <circle cx="6" cy="17.5" r="2.6" />
      <path d="M8 8.2L20 18M8 15.8L20 6" />
    </>
  ),
  comb: (
    <>
      <rect x="3" y="6" width="18" height="5" rx="2" />
      <path d="M6 11v7M9.5 11v7M13 11v7M16.5 11v7" />
    </>
  ),
  mirror: (
    <>
      <ellipse cx="12" cy="9" rx="6" ry="7" />
      <path d="M12 16v6M9 7a3.4 3.4 0 0 1 3-2" />
    </>
  ),
  lotus: (
    <>
      <path d="M12 20c-2.5-2-3.5-5-3.5-8 1.2.6 2.4 1.8 3.5 4 1.1-2.2 2.3-3.4 3.5-4 0 3-1 6-3.5 8z" />
      <path d="M3 13.5c3 0 6 1.3 9 6.5M21 13.5c-3 0-6 1.3-9 6.5" />
    </>
  ),
  stones: (
    <>
      <ellipse cx="12" cy="18" rx="8" ry="3" />
      <ellipse cx="12" cy="12.5" rx="6" ry="2.5" />
      <ellipse cx="12" cy="7.5" rx="4" ry="2" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10 11 5 20 4c0 9-5 15-14 15z" />
      <path d="M5 19l8-8" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="6.5" r="3.3" />
      <circle cx="12" cy="17.5" r="3.3" />
      <circle cx="6.5" cy="12" r="3.3" />
      <circle cx="17.5" cy="12" r="3.3" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
  brush: (
    <>
      <path d="M20 4l-9 9" />
      <path d="M10.5 13.5l-1.5 1.5c-2 2-1.5 4-4 6 3 1 6 0 8-2 1.5-1.5 1-3 .5-4z" />
    </>
  ),
  bangle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5.2" />
      <path d="M12 3.5v0M20.5 12v0M12 20.5v0M3.5 12v0" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" />
    </>
  ),
  approve: <path d="M3 13l4 4 8-9M10 16.5l.8.8 9.2-10.3" />,
  door: <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h8A1.5 1.5 0 0 1 16 4.5V21M3 21h18M13 12v.01" />,
  rupee: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 7.5h8M8 11h8M8 7.5h2.2a2.6 2.6 0 0 1 0 5.2H8l6.5 4.8" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.9 1-5.9L3.5 9.7l5.9-.8z" />,
} as const;

export type AlankarIconName = keyof typeof alankarIcons;

export interface AlankarIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: AlankarIconName;
  /** Set only when the icon stands alone; otherwise it is hidden from screen readers. */
  title?: string;
}

export function AlankarIcon({ name, title, className, ...rest }: AlankarIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-6 w-6'}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {alankarIcons[name]}
    </svg>
  );
}
