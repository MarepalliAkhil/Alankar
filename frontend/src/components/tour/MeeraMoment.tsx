import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Meera } from './Meera';
import type { MeeraPose } from './meera-data';

/** A small box for Meera: 96 px tall (112 from 640 px), always 4:5, so nothing shifts when it loads. */
export const MEERA_SMALL = 'h-24 aspect-[4/5] sm:h-28';

/**
 * A small, never-blocking Meera moment inside a customer screen: her picture (decorative, the
 * words carry the meaning) beside a short line. Without a picture it is just the line.
 */
export function MeeraMoment({
  pose,
  children,
  className,
}: {
  pose: MeeraPose;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-meera-moment={pose} className={cn('flex items-center gap-sm', className)}>
      <div className="flex-none empty:hidden">
        <Meera pose={pose} decorative quiet className={MEERA_SMALL} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
