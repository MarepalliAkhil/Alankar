import { cn } from '../../lib/cn';

export interface SkeletonProps {
  className?: string;
}

/** A pulsing placeholder block. Size it with className (e.g. "h-4 w-32"). */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-nested bg-primary-soft', className)}
    />
  );
}

export interface LoadingStateProps {
  label?: string;
  lines?: number;
  className?: string;
}

/** Page/section loading state: skeleton lines plus a screen-reader announcement. */
export function LoadingState({ label = 'Loading…', lines = 3, className }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-3 py-lg', className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  );
}
