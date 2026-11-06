import type { HTMLAttributes, ReactNode } from 'react';
import { useTheme } from '../../design/theme-context';
import { SLOW_ACTION_MS, useSlowPending } from '../../hooks/useSlowPending';
import { cn } from '../../lib/cn';
import { BrandMark } from './Loader';

export interface PendingAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** The real pending state of the action started inside this area (mutation.isPending). */
  pending: boolean;
  /** Shown on the overlay, e.g. "Taking your payment…". */
  message?: string;
  delay?: number;
  children: ReactNode;
}

/** The glass overlay with the theme's branded loader (used by PendingArea and Modal `busy`). */
export function BusyOverlay({ message, className }: { message: string; className?: string }) {
  const { theme } = useTheme();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="busy-overlay"
      className={cn(
        'busy-overlay glass-dense absolute inset-0 z-nav flex flex-col items-center justify-center gap-sm p-lg text-center',
        className,
      )}
    >
      <BrandMark theme={theme} className="h-12 w-12" />
      <p className="text-sm font-medium text-text">
        <span className="sr-only">Loading. </span>
        {message}
      </p>
    </div>
  );
}

export const SLOW_ACTION_MESSAGE = 'Please wait, this can take a few seconds.';

/**
 * Wraps a form or card whose action can be slow (payment, checkout, placing an order, payroll).
 * While the action runs the area takes no clicks (its button is already disabled); if it is still
 * running after 800 ms a glass overlay with the theme's branded loader covers it. Both go away the moment
 * the request ends, whether it worked or failed.
 */
export function PendingArea({
  pending,
  message = SLOW_ACTION_MESSAGE,
  delay = SLOW_ACTION_MS,
  className,
  children,
  ...rest
}: PendingAreaProps) {
  const slow = useSlowPending(pending, delay);
  return (
    <div className={cn('relative', className)} aria-busy={pending || undefined} {...rest}>
      <div className={cn(pending && 'pointer-events-none')}>{children}</div>
      {slow && <BusyOverlay message={message} className="rounded-card" />}
    </div>
  );
}
