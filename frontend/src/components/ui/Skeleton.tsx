import { cn } from '../../lib/cn';

export interface SkeletonProps {
  className?: string;
}

/** A shimmering placeholder block. Size it with className (e.g. "h-4 w-32"). */
export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden="true" className={cn('skeleton block rounded-nested', className)} />;
}

/** Placeholder shaped like a card (title, two lines, a button). */
export function SkeletonCard({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('glass-card flex flex-col gap-sm rounded-card p-lg', className)}
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="mt-sm h-9 w-28 rounded-full" />
    </div>
  );
}

/** A grid of card placeholders, for lists shown as cards. */
export function SkeletonCards({
  count = 3,
  label = 'Loading…',
  className,
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn('card-grid', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="glass-card flex flex-col gap-sm rounded-card p-lg"
        >
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

/** A stack of row-card placeholders (a title and a badge, then two lines), for lists shown as
 * one card per row rather than a grid -- orders, members and similar record lists. */
export function SkeletonRows({
  count = 3,
  label = 'Loading…',
  className,
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-sm', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="glass-card flex flex-col gap-sm rounded-card p-lg"
        >
          <div className="flex items-center justify-between gap-sm">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder shaped like a table. */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  label = 'Loading…',
  className,
}: {
  rows?: number;
  columns?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('glass-panel flex flex-col gap-sm rounded-card p-md', className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows + 1 }, (_, r) => (
        <div key={r} aria-hidden="true" className="flex gap-md">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', r === 0 && 'h-3 opacity-70')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder shaped like a bar chart. */
export function SkeletonChart({
  label = 'Loading the chart…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  const bars = ['h-1/3', 'h-2/3', 'h-1/2', 'h-5/6', 'h-2/5', 'h-3/4', 'h-1/2'];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('glass-panel rounded-card p-md', className)}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex h-48 items-end gap-sm">
        {bars.map((h, i) => (
          <Skeleton key={i} className={cn('flex-1 rounded-b-none', h)} />
        ))}
      </div>
    </div>
  );
}

/** Placeholder shaped like a chat thread (bubbles on both sides). */
export function SkeletonChat({
  label = 'Loading messages…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  const rows = [
    ['self-start', 'w-2/3'],
    ['self-end', 'w-1/2'],
    ['self-start', 'w-3/5'],
    ['self-end', 'w-2/5'],
  ];
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-sm', className)}>
      <span className="sr-only">{label}</span>
      {rows.map(([side, width], i) => (
        <Skeleton key={i} className={cn('h-10 rounded-card', side, width)} />
      ))}
    </div>
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
