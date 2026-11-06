import { cn } from '../../lib/cn';

/**
 * The progress of the tour: ONE line connecting one node per chapter. Finished nodes are filled,
 * the current node is ringed, and there is nothing else on the line (no extra small dots).
 * Screen readers hear "Step n of 7".
 */
export function ProgressPath({ count, current }: { count: number; current: number }) {
  const step = Math.min(current + 1, count);
  return (
    <ol
      aria-label={`Step ${step} of ${count}`}
      className="flex min-w-[9rem] flex-1 items-center sm:max-w-[16rem]"
    >
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          aria-current={i === current ? 'step' : undefined}
          className={cn('flex items-center', i < count - 1 && 'flex-1')}
        >
          <span
            data-dot={i === current ? 'current' : i < current ? 'done' : 'todo'}
            className={cn(
              'block h-3.5 w-3.5 shrink-0 rounded-full border-2',
              i < current && 'border-primary bg-primary',
              i === current && 'border-primary bg-surface ring-4 ring-primary-soft',
              i > current && 'border-text-muted bg-surface',
            )}
          />
          {i < count - 1 && (
            <span
              aria-hidden="true"
              className={cn('h-0.5 flex-1', i < current ? 'bg-primary' : 'bg-text-muted/40')}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
