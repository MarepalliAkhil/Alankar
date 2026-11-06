import type { ReactNode } from 'react';

/** Tooltip for an icon-only row. Hidden from screen readers: the row has its own accessible name. */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="glass-panel pointer-events-none absolute left-full z-overlay ml-sm hidden whitespace-nowrap rounded-nested px-sm py-1 text-sm text-text group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}
