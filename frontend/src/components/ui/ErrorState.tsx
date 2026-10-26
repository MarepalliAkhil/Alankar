import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-md py-xl text-center', className)}
    >
      <span
        aria-hidden="true"
        className="mb-md inline-flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft text-danger-text"
      >
        <TriangleAlert className="h-6 w-6" />
      </span>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-text-muted">{description}</p>
      {(onRetry || action) && (
        <div className="mt-lg flex flex-wrap justify-center gap-sm">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
